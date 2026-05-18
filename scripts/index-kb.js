'use strict';

/**
 * KB 인덱싱 실행 스크립트
 * TF-IDF 학습 + ChromaDB 벡터 인덱싱 (1회성 실행)
 * 사용: node scripts/index-kb.js
 */

require('dotenv').config({ path: './config/.env' });

const { searchEngine } = require('../src/engine/tfidf-search');
const { logger } = require('../src/utils/logger');
const FAQ_DATA = require('../src/kb/faq-data');
const POLICY_DATA = require('../src/kb/policy-data');

async function main() {
  console.log('=== JHC KB 인덱싱 시작 ===');
  console.log(`FAQ: ${FAQ_DATA.length}문항 / 정책: ${POLICY_DATA.length}건`);

  try {
    // searchEngine.init() 이 TF-IDF fit + ChromaDB 인덱싱을 모두 처리
    await searchEngine.init();

    const stats = searchEngine.getStats();
    console.log('\n=== 인덱싱 완료 ===');
    console.log(`모드     : ${stats.mode}`);
    console.log(`총 문서  : ${stats.docCount}개`);
    console.log(`어휘 크기: ${stats.vocabSize}개 토큰`);

    if (stats.mode === 'chromadb') {
      console.log('ChromaDB 벡터 인덱싱 성공 ✓');
    } else {
      console.log('ChromaDB 미연결 — 인메모리 TF-IDF 모드 (서버 기동 시 자동 인덱싱)');
    }

    // 간단 검색 검증
    console.log('\n--- 검색 검증 ---');
    const testQueries = ['환불', '배송 기간', '피부 트러블', '임산부'];
    for (const q of testQueries) {
      const results = await searchEngine.search(q);
      const top = results[0];
      console.log(`[${q}] → ${top ? `${top.source} (score: ${top.score.toFixed(3)})` : '결과 없음'}`);
    }

    console.log('\n인덱싱 완료. 서버를 시작하려면: npm run dev');
    process.exit(0);
  } catch (err) {
    console.error('인덱싱 실패:', err.message);
    logger.error('index-kb 오류', { error: err.message });
    process.exit(1);
  }
}

main();
