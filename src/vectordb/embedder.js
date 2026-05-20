'use strict';

/**
 * 로컬 TF-IDF 임베딩 엔진
 * AI API 미사용 — 순수 수학 연산
 * ChromaDB에 저장할 벡터를 생성
 */

const { koreanUtils } = require('../utils/korean-utils');

class TFIDFEmbedder {
  constructor() {
    this.vocabulary = new Map();   // 단어 → 인덱스
    this.idfScores  = new Map();   // 단어 → IDF 점수
    this.docCount   = 0;
    this.vectorSize = 0;
    this.fitted     = false;
  }

  // ── 1. 한국어 조사 제거 ──
  _stripParticle(word) {
    // 긴 패턴 먼저 — 짧은 조사의 부분 매칭 방지
    const particles = [
      '으로부터', '로부터', '에서부터',
      '에서도', '에서는', '에서만',
      '으로도', '으로는', '으로만',
      '이라도', '이지만', '이므로', '이라고', '이라는',
      '라도', '지만', '므로', '라고', '라는',
      '한테서', '에게서',
      '한테', '에게', '까지', '부터', '처럼', '보다', '만큼', '마다',
      '으로', '에서',
      '인지', '인가',  // 의문형 어미
      '이나', '이며', '이고',
      '나', '며', '고',
      '로', '에',
      '을', '를', '은', '는', '와', '과', '도', '만',
      '이', '가',
    ];
    for (const p of particles) {
      if (word.endsWith(p)) {
        const stem = word.slice(0, word.length - p.length);
        if (stem.length >= 2) return stem;
      }
    }
    return word;
  }

  // ── 2. 텍스트 토큰화 ──
  tokenize(text) {
    if (!text) return [];
    const normalized = koreanUtils.normalize(text);
    // 공백 + 구두점 기준으로 분리 (문서 내 "가능한가요?" → "가능한가요")
    const words = normalized
      .split(/[\s.,!?;:'"()\[\]{}\·\/\\|@#$%^&*+=<>~]+/)
      .filter(w => w.length >= 2);
    // 조사 제거 변형 추가 (환불이→환불, 배송은→배송 등)
    const stemmed = words
      .map(w => this._stripParticle(w))
      .filter(w => w.length >= 2);
    const allWords = [...new Set([...words, ...stemmed])];
    // N-gram (bigram) 추가로 문맥 포착
    const bigrams = [];
    for (let i = 0; i < words.length - 1; i++) {
      bigrams.push(words[i] + '_' + words[i+1]);
    }
    return [...allWords, ...bigrams];
  }

  // ── 2. 말뭉치 학습 (fit) ──
  fit(documents) {
    this.docCount = documents.length;
    const dfMap = new Map();  // 단어 → 등장 문서 수

    // 어휘 사전 구축
    documents.forEach(doc => {
      const tokens = new Set(this.tokenize(doc));
      tokens.forEach(token => {
        dfMap.set(token, (dfMap.get(token) || 0) + 1);
      });
    });

    // IDF 계산: log(N / df) + 1
    let idx = 0;
    dfMap.forEach((df, word) => {
      this.vocabulary.set(word, idx++);
      const idf = Math.log(this.docCount / df) + 1;
      this.idfScores.set(word, idf);
    });

    this.vectorSize = idx;
    this.fitted = true;
    return this;
  }

  // ── 3. 단일 문서 → TF-IDF 벡터 ──
  transform(text) {
    if (!this.fitted) throw new Error('Embedder not fitted. Call fit() first.');

    const tokens = this.tokenize(text);
    const tf = new Map();
    tokens.forEach(t => tf.set(t, (tf.get(t) || 0) + 1));

    // 희소 벡터 → 밀집 배열
    const vector = new Float32Array(this.vectorSize).fill(0);
    tf.forEach((count, word) => {
      const idx = this.vocabulary.get(word);
      if (idx !== undefined) {
        const tfScore  = count / tokens.length;
        const idfScore = this.idfScores.get(word) || 0;
        vector[idx] = tfScore * idfScore;
      }
    });

    return this._normalize(vector);
  }

  // ── 4. L2 정규화 (코사인 유사도 준비) ──
  _normalize(vector) {
    const norm = Math.sqrt(vector.reduce((s, v) => s + v * v, 0));
    if (norm === 0) return vector;
    return vector.map(v => v / norm);
  }

  // ── 5. 코사인 유사도 ──
  cosineSimilarity(vecA, vecB) {
    if (vecA.length !== vecB.length) return 0;
    let dot = 0;
    for (let i = 0; i < vecA.length; i++) dot += vecA[i] * vecB[i];
    return dot; // 이미 정규화되어 있으므로 dot product = cosine similarity
  }

  // ── 6. 직렬화 (KB 인덱싱 후 저장) ──
  serialize() {
    return {
      vocabulary: Object.fromEntries(this.vocabulary),
      idfScores:  Object.fromEntries(this.idfScores),
      docCount:   this.docCount,
      vectorSize: this.vectorSize,
      fitted:     this.fitted,
    };
  }

  // ── 7. 역직렬화 (로드) ──
  static deserialize(data) {
    const emb = new TFIDFEmbedder();
    emb.vocabulary = new Map(Object.entries(data.vocabulary));
    emb.idfScores  = new Map(Object.entries(data.idfScores));
    emb.docCount   = data.docCount;
    emb.vectorSize = data.vectorSize;
    emb.fitted     = data.fitted;
    return emb;
  }
}

module.exports = { TFIDFEmbedder };
