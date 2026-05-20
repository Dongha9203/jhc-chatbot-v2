'use strict';

/**
 * R-C-F-V 4단 응답 조립기
 * P3 3톤 분리 v4 + 12상황 대응
 * Honey 페르소나 + 발랄·트렌디 톤 + 이름+"님" 호칭
 */

const settings   = require('../../config/settings');
const { SITUATIONS } = require('../engine/situation-classifier');

class ResponseBuilder {

  /**
   * 메인 응답 조립
   * @param {object} params
   * @param {string} params.situation  — 12상황 코드
   * @param {Array}  params.searchResults — KB 검색 결과
   * @param {string} params.userName   — 고객 이름 (없으면 '님')
   * @param {object} params.meta       — 분류기 메타
   * @param {string} params.channel    — 'kakao' | 'email'
   * @param {Array}  params.history    — 이전 대화
   */
  build(params) {
    const { situation, searchResults, userName, meta, channel, history } = params;
    const name = userName || '고객';
    const honorific = `${name}${settings.persona.honorific}`;

    switch (situation) {
      case SITUATIONS.S1: return this._buildNormal(honorific, searchResults, channel);
      case SITUATIONS.S2: return this._buildNoInfo(honorific, channel);
      case SITUATIONS.S3: return this._buildPolicyViolation(honorific, searchResults, channel);
      case SITUATIONS.S4: return this._buildSimpleReject(honorific, searchResults, channel);
      case SITUATIONS.S5: return this._buildEscalate(honorific, channel);
      case SITUATIONS.S6: return this._buildAnger(honorific, channel);
      case SITUATIONS.S7: return this._buildRepeat(honorific, searchResults, history, channel);
      case SITUATIONS.S8: return this._buildPraise(honorific, channel);
      case SITUATIONS.S9: return this._buildSkinTrouble(honorific, channel);
      case SITUATIONS.S10:return this._buildRecallAuth(honorific, searchResults, channel);
      case SITUATIONS.S11:return this._buildMinorPregn(honorific, channel);
      case SITUATIONS.S12:return this._buildComplex(honorific, searchResults, channel);
      default:             return this._buildNoInfo(honorific, channel);
    }
  }

  // ── 상황1: 정상 응답 ──
  _buildNormal(hon, results, ch) {
    if (!results?.length) return this._buildNoInfo(hon, ch);
    const top = results[0];
    const src = top.source || 'KB';
    const law = top.law ? `\n📋 법적 근거: ${top.law}` : '';

    if (ch === 'kakao') {
      return `${hon}, 확인 도와드릴게요! 😊\n${top.answer}\n📎 ${src}${law}`;
    }
    return [
      `${hon}, 확인 도와드릴게요! 😊`,
      '',
      top.answer,
      `📎 출처: ${src}${law}`,
      '',
      top.escalate ? '추가 문의는 담당자 연결 도와드릴까요?' : '다른 궁금한 점 있으시면 편하게 말씀해 주세요!',
    ].join('\n');
  }

  // ── 상황2: 정보 부재 ──
  _buildNoInfo(hon, ch) {
    if (ch === 'kakao') {
      return `${hon}, 해당 정보는 KB에 없네요 💦\n담당자 연결 도와드릴까요?`;
    }
    return [
      `${hon}, 확인해 봤는데 해당 정보가 KB에 없네요 💦`,
      '',
      '관련 정책이 명시되어 있지 않아 정확한 안내가 어려운 상황이에요.',
      '',
      '✅ 담당자 연결 도와드릴까요?',
      `📞 고객지원팀 | ${settings.escalation.hours}`,
    ].join('\n');
  }

  // ── 상황3: 정책 위반 ──
  _buildPolicyViolation(hon, results, ch) {
    const top = results?.[0];
    const src = top?.source || 'KB';

    if (ch === 'kakao') {
      return `${hon}, 확인했어요.\n해당 건은 어려울 수 있어요.\n① 교환 ② 적립금 전환 ③ 담당자 상담 중 선택해 주세요 ✨\n📎 ${src}`;
    }
    return [
      `${hon}, 환불·교환 가능 여부 확인했어요.`,
      '',
      top?.answer || '해당 정책을 KB에서 확인해 드렸어요.',
      `📎 출처: ${src}`,
      '',
      '다음 옵션 가능해요 ✨',
      '① 교환 (유사 상품)',
      '② 적립금 전환',
      '③ 담당자 상담',
      '',
      '원하시는 옵션 알려 주시면 바로 도와드릴게요!',
    ].join('\n');
  }

  // ── 상황4: 단순 거절 ──
  _buildSimpleReject(hon, results, ch) {
    const top = results?.[0];
    if (ch === 'kakao') {
      return `${hon}, 확인했어요!\n현재 해당 서비스는 운영하지 않아요 🔍\n비슷한 옵션 안내 도와드릴까요?`;
    }
    return [
      `${hon}, 확인했어요!`,
      '',
      top?.answer || '현재 해당 서비스는 운영하지 않고 있어요.',
      '',
      '비슷한 옵션이나 다른 방법을 안내 도와드릴까요?',
    ].join('\n');
  }

  // ── 상황5: 에스컬레이션 ──
  _buildEscalate(hon, ch) {
    const avg = settings.escalation.avgMinutes;
    if (ch === 'kakao') {
      return `${hon}, 확인 도와드릴게요!\n담당자 바로 연결할게요 ⏱️ (평균 ${avg}분)`;
    }
    return [
      `${hon}, 확인 도와드릴게요!`,
      '',
      '해당 케이스는 담당자가 직접 검토하는 게 더 정확해요.',
      `담당자 연결 진행할게요 ⏱️ 평균 ${avg}분이에요.`,
      '',
      `📞 ${settings.escalation.department} | ${settings.escalation.hours}`,
    ].join('\n');
  }

  // ── 상황6: 감정 격화 (Hochschild — 즉시 사람 인계) ──
  _buildAnger(hon, ch) {
    if (ch === 'kakao') {
      return `${hon}, 많이 답답하셨겠어요 🙏\n담당자 즉시 연결할게요! (평균 ${settings.escalation.avgMinutes}분)`;
    }
    return [
      `${hon}, 많이 답답하셨겠어요.`,
      '상황 정확히 알려주셔서 감사해요 🙏',
      '',
      '제가 답변드리는 것보다 담당자가 직접 검토하는 게 빠를 것 같아요.',
      `지금 바로 ${settings.escalation.department} 연결할게요.`,
      `평균 ${settings.escalation.avgMinutes}분이에요.`,
    ].join('\n');
  }

  // ── 상황7: 반복 질문 ──
  _buildRepeat(hon, results, history, ch) {
    const top = results?.[0];
    if (ch === 'kakao') {
      return `${hon}, 다시 확인 도와드릴게요 😊\n${top?.answer?.substring(0, 80) || '앞서 안내 드린 내용 참고해 주세요!'}\n더 구체적으로 말씀해 주세요!`;
    }
    return [
      `${hon}, 다시 확인 도와드릴게요 😊`,
      '',
      '앞서 안내드린 내용 다시 정리해 드릴게요:',
      top?.answer || '이전 안내 내용을 참고해 주세요.',
      '',
      '원하시는 부분이 다른 내용이라면 더 구체적으로 말씀해 주세요!',
    ].join('\n');
  }

  // ── 상황8: 칭찬·감사 ──
  _buildPraise(hon, ch) {
    return `${hon}, 좋게 봐주셔서 감사해요! 계속 노력할게요 💚`;
  }

  // ── 상황9: 피부 트러블 (FAQ Q29 기반) ──
  _buildSkinTrouble(hon, ch) {
    if (ch === 'kakao') {
      return `${hon}, 많이 놀라셨겠어요 🙏\n즉시 사용 중단 + 세안 후 보습제 발라주세요.\n로트번호와 증상 알려 주시면 담당자 연결할게요!`;
    }
    return [
      `${hon}, 많이 놀라셨겠어요 🙏`,
      '',
      '즉시 사용을 중단하고 깨끗한 물로 세안 후 자극이 최소화된 보습제를 가볍게 발라 주세요.',
      '증상이 심하거나 지속되면 피부과 진료를 받으시길 권장합니다.',
      '',
      '📋 제품 로트번호와 증상을 알려 주시면 성분 분석 자료 제공 + 담당자 연결 도와드릴게요!',
      '📎 출처: FAQ §Q29 | 화장품법 제5조',
    ].join('\n');
  }

  // ── 상황10: 리콜·정품 확인 (FAQ Q42·Q43) ──
  // KB 검색 결과 1위 기준으로 응답, 없을 때만 통합 안내 fallback
  _buildRecallAuth(hon, results, ch) {
    const top = results?.[0];

    if (top) {
      const src = top.source || 'KB';
      const law = top.law ? `\n📋 법적 근거: ${top.law}` : '';
      if (ch === 'kakao') {
        return `${hon}, 확인 도와드릴게요! 🔍\n${top.answer}\n📎 ${src}${law}`;
      }
      return [
        `${hon}, 확인 도와드릴게요! 🔍`,
        '',
        top.answer,
        `📎 출처: ${src}${law}`,
      ].join('\n');
    }

    // KB 결과 없을 때 통합 안내
    if (ch === 'kakao') {
      return `${hon}, 확인 도와드릴게요! 🔍\n리콜: 식품안전나라 홈페이지 확인\n정품: QR코드·홀로그램 스캔\n📎 FAQ §Q42·Q43`;
    }
    return [
      `${hon}, 확인 도와드릴게요! 🔍`,
      '',
      '✅ 리콜 확인: 식품의약품안전처 식품안전나라 홈페이지에서 리콜·회수 제품 목록을 확인하실 수 있어요.',
      '✅ 정품 확인: 제품 하단 QR코드 또는 홀로그램을 스캔하시면 정품 여부를 확인하실 수 있어요.',
      '',
      '당사 공식몰·공인 판매처에서 구매하시면 정품을 보장받으실 수 있습니다.',
      '📎 출처: FAQ §Q42·Q43 | 화장품법 제15조의2',
    ].join('\n');
  }

  // ── 상황11: 임산부·미성년자 (FAQ Q25·Q45) ──
  _buildMinorPregn(hon, ch) {
    if (ch === 'kakao') {
      return `${hon}, 안전이 최우선이에요 💚\n임산부: 산부인과 전문의 상담 권장\n14세 미만: 법정 대리인 동의 필요\n담당자 연결 도와드릴까요?`;
    }
    return [
      `${hon}, 안전이 최우선이에요 💚`,
      '',
      '🤰 임산부의 경우: 레티놀·살리실산·일부 에센셜 오일 등은 사용을 권장하지 않아요.',
      '전성분 확인 후 산부인과 전문의에게 먼저 상담 후 사용하시기 바랍니다.',
      '',
      '👶 미성년자의 경우: 만 14세 미만은 법정 대리인(부모님)의 동의가 필요해요.',
      '',
      '더 자세한 안내가 필요하시면 담당자 연결 도와드릴게요!',
      '📎 출처: FAQ §Q25·Q45 | 개인정보보호법 제22조',
    ].join('\n');
  }

  // ── 상황12: 복합 정책 (FAQ Q05·Q13·Q17) ──
  _buildComplex(hon, results, ch) {
    if (ch === 'kakao') {
      return `${hon}, 항목별로 안내드릴게요! ✨\n① 환불: 7일 이내 미개봉 가능\n② 쿠폰: 조건별 상이\n③ 적립금: 사용분 복구\n📎 FAQ §Q13·Q17`;
    }
    return [
      `${hon}, 항목별로 안내드릴게요! ✨`,
      '',
      '① 환불: 구매 후 7일 이내 미개봉 제품 가능',
      '② 쿠폰 복원: 일회성 쿠폰은 복원 불가, 이벤트 쿠폰은 조건별 상이',
      '③ 적립금: 사용분만큼 원상 복구',
      '',
      '📎 출처: FAQ §Q05·Q13·Q17 | 전자상거래법 제17조',
      '',
      '각 항목 더 자세히 알고 싶으시면 말씀해 주세요!',
    ].join('\n');
  }
}

const responseBuilder = new ResponseBuilder();
module.exports = { responseBuilder, ResponseBuilder };
