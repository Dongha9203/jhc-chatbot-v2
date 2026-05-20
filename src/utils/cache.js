'use strict';

/**
 * node-cache 기반 인메모리 캐시
 * 무료 사용 — Redis 불필요
 * 동일 질문 반복 시 검색 엔진 부하 제거
 */

const NodeCache = require('node-cache');
const settings  = require('../../config/settings');

const nodeCache = new NodeCache({
  stdTTL:      settings.cache.ttl,
  maxKeys:     settings.cache.maxKeys,
  checkperiod: 120,   // 만료 체크 주기 (초)
  useClones:   false, // 성능 최적화
});

// 캐시 통계 (모니터링용)
nodeCache.on('expired', (key) => {
  // logger 의존성 순환 방지로 console 사용
  if (process.env.NODE_ENV !== 'production') {
    console.debug(`[Cache] 만료: ${key}`);
  }
});

module.exports = { nodeCache };
