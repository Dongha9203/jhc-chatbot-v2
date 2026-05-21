'use strict';

/**
 * 로컬 TF-IDF 임베딩 엔진
 * AI API 미사용 — 순수 수학 연산
 * ChromaDB에 저장할 벡터를 생성
 */

const { koreanUtils } = require('../utils/korean-utils');

// 한국어 문법 불용어 — 의미 없는 어미·조사·보조동사
const KO_STOPWORDS = new Set([
  '하나요','인가요','할까요','나요','세요','해요','이에요','예요','어요',
  '해야','하면','하고','해서','하는','하여','하지','하니','하다','했다',
  '있나요','없나요','됩니까','됩니다','합니다','합니까','어느','어떤',
  '있어요','없어요','인지','하기','하게','하던','했어','했는','해줘',
  '주세요','드릴까','알려줘','알려주','궁금해','궁금한','어디서','어디에',
  '어떻게','무엇을','무엇이','뭔가요','뭔지','무엇','어디','얼마나',
]);

class TFIDFEmbedder {
  constructor() {
    this.vocabulary = new Map();   // 단어 → 인덱스
    this.idfScores  = new Map();   // 단어 → IDF 점수
    this.docCount   = 0;
    this.vectorSize = 0;
    this.fitted     = false;
  }

  // ── 1. 텍스트 토큰화 ──
  tokenize(text) {
    if (!text) return [];
    const normalized = koreanUtils.normalize(text);
    // 공백 분리 단어 (2자 이상, 불용어 제외)
    const words = normalized.split(/\s+/).filter(w => w.length >= 2 && !KO_STOPWORDS.has(w));

    // 단어 간 bigram (문맥 포착)
    const bigrams = [];
    for (let i = 0; i < words.length - 1; i++) {
      bigrams.push(words[i] + '_' + words[i + 1]);
    }

    // 한국어 음절 n-gram: 4자 이상 단어에서 2~3음절 substring 추출
    // "환불하고" → "환불", "불하", "하고", "환불하", "불하고"
    // 어미 결합형("환불하고 싶어요")이 KB의 어근("환불")과 매칭되게 함
    const charNgrams = [];
    for (const word of words) {
      if (word.length >= 4) {
        for (let n = 2; n <= 3; n++) {
          for (let i = 0; i <= word.length - n; i++) {
            const ng = word.slice(i, i + n);
            if (ng.length >= 2 && !KO_STOPWORDS.has(ng)) charNgrams.push(ng);
          }
        }
      }
    }

    return [...words, ...bigrams, ...charNgrams];
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
