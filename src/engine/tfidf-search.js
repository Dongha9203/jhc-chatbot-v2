'use strict';

/**
 * TF-IDF 검색 엔진
 * - ChromaDB 연결 시: 벡터 검색 (코사인 유사도)
 * - ChromaDB 미연결 시: 인메모리 TF-IDF 폴백
 * AI API 완전 미사용
 */

const { TFIDFEmbedder }  = require('../vectordb/embedder');
const { chromaClient }   = require('../vectordb/chroma-client');
const { koreanUtils }    = require('../utils/korean-utils');
const { nodeCache }      = require('../utils/cache');
const settings           = require('../../config/settings');
const { logger }         = require('../utils/logger');
const FAQ_DATA           = require('../kb/faq-data');
const POLICY_DATA        = require('../kb/policy-data');

class TFIDFSearchEngine {
  constructor() {
    this.embedder       = new TFIDFEmbedder();
    this.inMemoryDocs   = [];   // 폴백용 인메모리 문서
    this.chromaOnline   = false;
    this.initialized    = false;
  }

  // ── 초기화 ──
  async init() {
    if (this.initialized) return;

    // 모든 KB 문서 수집
    const allDocs = [
      ...FAQ_DATA.map(f => ({
        id:       f.id,
        text:     `${f.question} ${f.answer} ${f.keywords.join(' ')}`,
        question: f.question,
        answer:   f.answer,
        category: f.category,
        source:   `FAQ §${f.id}`,
        law:      f.law || '',
        escalate: f.escalate || false,
        sensitive: f.sensitive || false,
        keywords: f.keywords,
      })),
      ...POLICY_DATA.map(p => ({
        id:       p.id,
        text:     `${p.title} ${p.content} ${p.keywords.join(' ')}`,
        question: p.title,
        answer:   p.content,
        category: p.category,
        source:   `정책 §${p.id}`,
        law:      p.law || '',
        escalate: false,
        sensitive: false,
        keywords: p.keywords,
      })),
    ];

    // TF-IDF 학습 (항상 수행 — 폴백 보장)
    this.embedder.fit(allDocs.map(d => d.text));
    this.inMemoryDocs = allDocs.map(doc => ({
      ...doc,
      vector: this.embedder.transform(doc.text),
    }));

    // ChromaDB 연결 시도
    this.chromaOnline = await chromaClient.ping();
    if (this.chromaOnline) {
      logger.info('ChromaDB 연결 성공 — 벡터 검색 모드');
      await this._ensureChromaIndexed(allDocs);
    } else {
      logger.warn('ChromaDB 오프라인 — 인메모리 TF-IDF 모드');
    }

    this.initialized = true;
    logger.info(`검색 엔진 초기화 완료: ${allDocs.length}개 문서`);
  }

  // ── ChromaDB 인덱싱 확인 ──
  async _ensureChromaIndexed(allDocs) {
    // cosine 공간 보장 (잘못된 공간이면 자동 삭제·재생성)
    await chromaClient.getOrCreateCollection(settings.chroma.collections.faq);
    const count = await chromaClient.count(settings.chroma.collections.faq);
    if (count > 0) {
      logger.info(`ChromaDB 기존 인덱스 사용: ${count}개`);
      return;
    }
    logger.info('ChromaDB 인덱싱 시작...');

    const batchSize = 10;
    for (let i = 0; i < allDocs.length; i += batchSize) {
      const batch = allDocs.slice(i, i + batchSize);
      await chromaClient.add(settings.chroma.collections.faq, {
        ids:        batch.map(d => d.id),
        embeddings: batch.map(d => Array.from(this.embedder.transform(d.text))),
        documents:  batch.map(d => d.text),
        metadatas:  batch.map(d => ({
          question: d.question,
          answer:   d.answer,
          category: d.category,
          source:   d.source,
          law:      d.law,
          escalate: String(d.escalate),
          sensitive: String(d.sensitive),
          keywords: d.keywords.join(','),
        })),
      });
    }
    logger.info(`ChromaDB 인덱싱 완료: ${allDocs.length}개`);
  }

  // ── 메인 검색 ──
  async search(query, opts = {}) {
    if (!this.initialized) await this.init();

    const cacheKey = `search:${query}`;
    const cached   = nodeCache.get(cacheKey);
    if (cached) return cached;

    // 전처리
    const normalized = koreanUtils.normalize(query);
    const results    = this.chromaOnline
      ? await this._chromaSearch(normalized, opts)
      : this._inMemorySearch(normalized, opts);

    // 키워드 부스팅 → minScore 필터 순서 (부스팅이 필터 기준을 통과시킬 수 있도록)
    const boosted  = this._keywordBoost(results, normalized);
    const filtered = boosted.filter(r => r.score >= settings.search.minScore);
    const topK     = filtered.slice(0, settings.search.topK);

    if (topK.length > 0) nodeCache.set(cacheKey, topK);
    return topK;
  }

  // ── ChromaDB 검색 ──
  async _chromaSearch(query, opts) {
    try {
      const qVec = Array.from(this.embedder.transform(query));
      const res  = await chromaClient.query(settings.chroma.collections.faq, {
        queryEmbeddings: [qVec],
        nResults: settings.search.topK * 2,
        where: opts.category ? { category: opts.category } : undefined,
      });

      if (!res.ids?.[0]?.length) return [];

      return res.ids[0].map((id, i) => ({
        id,
        score:     1 - (res.distances[0][i] || 0),
        question:  res.metadatas[0][i].question,
        answer:    res.metadatas[0][i].answer,
        category:  res.metadatas[0][i].category,
        source:    res.metadatas[0][i].source,
        law:       res.metadatas[0][i].law,
        escalate:  res.metadatas[0][i].escalate === 'true',
        sensitive: res.metadatas[0][i].sensitive === 'true',
        keywords:  (res.metadatas[0][i].keywords || '').split(','),
      })).filter(r => r.score >= settings.search.minScore);
    } catch (e) {
      if (e.code === 'CHROMA_OFFLINE') {
        this.chromaOnline = false;
        return this._inMemorySearch(query, opts);
      }
      throw e;
    }
  }

  // ── 인메모리 TF-IDF 검색 (폴백) — minScore 필터는 키워드 부스팅 후 적용 ──
  _inMemorySearch(query, opts) {
    const qVec = this.embedder.transform(query);
    return this.inMemoryDocs
      .filter(d => !opts.category || d.category === opts.category)
      .map(doc => ({
        ...doc,
        score: this.embedder.cosineSimilarity(qVec, doc.vector),
      }))
      .sort((a, b) => b.score - a.score);
  }

  // ── 키워드 부스팅 ──
  _keywordBoost(results, query) {
    const q = query.toLowerCase().replace(/\s/g, '');
    return results.map(r => {
      let boost = 1.0;
      const kws = r.keywords || [];
      // 정확 키워드 매칭
      if (kws.some(k => q.includes(k.toLowerCase().replace(/\s/g, '')))) {
        boost *= settings.search.keywordBonus;
      }
      // 질문 완전 포함
      if (r.question && r.question.replace(/\s/g,'').includes(q)) {
        boost *= settings.search.exactBonus;
      }
      return { ...r, score: r.score * boost };
    }).sort((a, b) => b.score - a.score);
  }

  // ── 검색 통계 ──
  getStats() {
    return {
      mode:       this.chromaOnline ? 'chromadb' : 'in-memory-tfidf',
      docCount:   this.inMemoryDocs.length,
      vocabSize:  this.embedder.vectorSize,
      initialized: this.initialized,
    };
  }
}

const searchEngine = new TFIDFSearchEngine();
module.exports = { searchEngine, TFIDFSearchEngine };
