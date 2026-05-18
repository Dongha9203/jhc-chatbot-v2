'use strict';

/**
 * JHC Honey 챗봇 메인 처리 파이프라인
 * P1~P5 전체 절차 통합 실행
 *
 * 처리 순서:
 * 1. 전처리 (오타·이모지·다국어)
 * 2. 입력 보안 검증
 * 3. 상황 분류 (12상황)
 * 4. ChromaDB/TF-IDF KB 검색
 * 5. 상황 보정
 * 6. 함정 3종 + 컴플라이언스 검증
 * 7. 3톤 응답 조립
 * 8. 채널 포맷팅 (카카오톡 200자)
 * 9. 최종 검증 (V-Verify)
 */

const { koreanUtils }     = require('../utils/korean-utils');
const { searchEngine }    = require('./tfidf-search');
const { classifier }      = require('./situation-classifier');
const { trapValidator }   = require('./trap-validator');
const { responseBuilder } = require('../tone/response-builder');
const { nodeCache }       = require('../utils/cache');
const { logger }          = require('../utils/logger');
const settings            = require('../../config/settings');

class ChatPipeline {
  constructor() {
    this.initialized = false;
  }

  async init() {
    if (this.initialized) return;
    await searchEngine.init();
    this.initialized = true;
    logger.info('ChatPipeline 초기화 완료');
  }

  /**
   * 메인 처리 함수
   */
  async process({ input, userId, userName, channel = 'kakao', history = [] }) {
    if (!this.initialized) await this.init();

    const startTime = Date.now();

    // ── STEP 1: 전처리 ──
    const preprocessed = koreanUtils.preprocess(input);

    // ── STEP 2: 보안 검증 ──
    const security = trapValidator.validateInput(preprocessed.normalized);
    if (!security.valid) {
      logger.warn('보안 이슈 감지', { userId, issues: security.issues });
      return this._securityResponse(channel, userName);
    }

    // ── STEP 3: 상황 분류 ──
    const classified = classifier.classify(preprocessed.normalized, history);
    logger.debug('상황 분류', { situation: classified.situation, confidence: classified.confidence });

    // ── STEP 4: KB 검색 ──
    let searchResults = [];
    let searchScore   = 0;
    try {
      searchResults = await searchEngine.search(preprocessed.normalized);
      searchScore   = searchResults[0]?.score || 0;
    } catch (err) {
      logger.error('검색 오류', err);
    }

    // ── STEP 5: 상황 보정 ──
    const refined = classifier.refine(classified, searchResults);

    // ── STEP 6: 응답 조립 ──
    const raw = responseBuilder.build({
      situation:     refined.situation,
      searchResults,
      userName,
      meta:          refined.meta,
      channel,
      history,
    });

    // ── STEP 7: 응답 검증 (V-Verify) ──
    const validated = trapValidator.validateResponse(raw, {
      searchScore,
      isMultiTopic: refined.situation === '복합_정책',
      channel,
    });

    const finalResponse = validated.sanitized;
    const resolved      = searchResults.length > 0 && searchScore >= settings.search.minScore;

    const elapsed = Date.now() - startTime;
    logger.info('파이프라인 완료', {
      userId, channel, situation: refined.situation,
      resolved, score: searchScore.toFixed(3), ms: elapsed,
    });

    return {
      response:    finalResponse,
      situation:   refined.situation,
      searchScore,
      resolved,
      source:      searchResults[0]?.source || null,
      escalate:    refined.meta?.escalate || false,
      issues:      validated.issues,
      elapsed,
    };
  }

  _securityResponse(channel, userName) {
    const hon = userName ? `${userName}님` : '님';
    const msg = `${hon}, 해당 요청에는 응답 드리기 어렵습니다.\n제품·서비스 관련 문의 도와드릴게요! 😊`;
    return {
      response:   msg,
      situation:  'SECURITY_BLOCK',
      resolved:   false,
      escalate:   false,
      searchScore: 0,
      issues:     [{ type: 'SECURITY', severity: 'BLOCK' }],
    };
  }
}

const chatPipeline = new ChatPipeline();
module.exports = { chatPipeline, ChatPipeline };
