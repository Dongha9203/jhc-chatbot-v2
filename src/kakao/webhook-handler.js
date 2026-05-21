'use strict';

/**
 * 카카오톡 채널 Webhook 처리기
 * 무료 구성: 카카오 i 오픈빌더 스킬 서버 응답 형식 사용
 *
 * 카카오 채널 설정:
 * 1. business.kakao.com → 채널 개설 (무료)
 * 2. 오픈빌더 → 봇 생성 → 스킬 서버 URL 등록
 *    또는 채널 → 채팅방 Webhook URL 등록
 * 3. Webhook URL: POST /webhook/kakao
 */

const crypto  = require('crypto');
const settings = require('../../config/settings');
const { chatPipeline } = require('../engine/chat-pipeline');
const { logManager }   = require('../loop/log-manager');
const { kakaoTemplates } = require('./templates');
const { logger }       = require('../utils/logger');

class WebhookHandler {

  /**
   * Webhook 서명 검증 (카카오 보안)
   */
  verifySignature(rawBody, signature) {
    if (!settings.kakao.channelSecret) return true; // 개발 환경
    const hash = crypto
      .createHmac('sha1', settings.kakao.channelSecret)
      .update(rawBody)
      .digest('hex');
    return hash === signature;
  }

  /**
   * Webhook 이벤트 라우팅
   */
  async handle(req, res) {
    const body = req.body;
    const eventType = body?.userRequest?.type || body?.type || 'message';

    logger.info(`카카오 이벤트: ${eventType}`, {
      userId: body?.userRequest?.user?.id,
      utterance: body?.userRequest?.utterance,
    });

    try {
      // ── 채널 추가 이벤트 (follow) ──
      if (eventType === 'follow' || body?.type === 'follow') {
        return res.json(this._handleFollow(body));
      }

      // ── 채널 차단 이벤트 (unfollow) ──
      if (eventType === 'unfollow' || body?.type === 'unfollow') {
        logger.info('채널 차단', { userId: body?.user?.id });
        return res.json({ result: 'ok' });
      }

      // ── 일반 메시지 ──
      return await this._handleMessage(body, res);

    } catch (err) {
      logger.error('Webhook 처리 오류', err);
      return res.json(kakaoTemplates.errorResponse());
    }
  }

  /**
   * 채널 추가 환영 메시지
   */
  _handleFollow(body) {
    const name = body?.user?.properties?.nickname || body?.userRequest?.user?.properties?.nickname || '';
    return kakaoTemplates.welcomeResponse(name);
  }

  /**
   * 일반 메시지 처리
   */
  async _handleMessage(body, res) {
    const utterance = body?.userRequest?.utterance || '';
    const userId    = body?.userRequest?.user?.id || 'anonymous';
    const userName  = body?.userRequest?.user?.properties?.nickname || '';

    if (!utterance.trim()) {
      return res.json(kakaoTemplates.simpleText(
        `${userName || ''}님, 궁금한 점을 말씀해 주세요! 😊`
      ));
    }

    // ── 챗봇 파이프라인 실행 ──
    const result = await chatPipeline.process({
      input:    utterance,
      userId,
      userName,
      channel:  'kakao',
      history:  [],  // 세션 관리 추가 시 여기서 이력 주입
    });

    // ── 로그 기록 (P4 폐곡선) ──
    await logManager.save({
      userId,
      channel:     'kakao',
      input:       utterance,
      response:    result.response,
      situation:   result.situation,
      searchScore: result.searchScore,
      resolved:    result.resolved,
      source:      result.source,
      category:    result.category,
    });

    // ── 카카오톡 응답 형식으로 변환 ──
    if (result.situation === '감정_격화' || result.escalate) {
      return res.json(kakaoTemplates.escalateResponse(result.response, userName));
    }

    if (!result.resolved) {
      return res.json(kakaoTemplates.noInfoResponse(result.response));
    }

    return res.json(kakaoTemplates.simpleText(result.response));
  }
}

const webhookHandler = new WebhookHandler();
module.exports = { webhookHandler, WebhookHandler };
