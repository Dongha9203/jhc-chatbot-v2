'use strict';

const fs   = require('fs');
const path = require('path');

const KB_PATH = path.resolve(__dirname, '../../data/faq-kb.json');

function loadFromDisk() {
  return JSON.parse(fs.readFileSync(KB_PATH, 'utf8'));
}

// 다른 모듈이 이 배열의 참조를 그대로 유지하므로
// splice로 내용만 교체하면 재시작 없이 반영된다
const FAQ_DATA = loadFromDisk();

let reloadTimer = null;
fs.watch(KB_PATH, { persistent: false }, () => {
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => {
    try {
      const fresh = loadFromDisk();
      FAQ_DATA.splice(0, FAQ_DATA.length, ...fresh);
      console.log(`[KB] hot-reload 완료 — ${fresh.length}건 반영`);
      // 검색 엔진 벡터 인덱스도 무효화 (lazy require로 순환 참조 방지)
      try {
        require('../engine/tfidf-search').searchEngine.initialized = false;
      } catch (_) { /* 엔진 미로드 상태면 무시 */ }
    } catch (e) {
      console.error('[KB] hot-reload 실패:', e.message);
    }
  }, 300); // 에디터 연속 저장 이벤트 debounce
});

module.exports = FAQ_DATA;
