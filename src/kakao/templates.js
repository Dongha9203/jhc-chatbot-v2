'use strict';

/**
 * 카카오 i 오픈빌더 스킬 서버 응답 템플릿
 * https://i.kakao.com/openbuilder/docs/skill
 *
 * 무료 사용:
 * - simpleText: 텍스트 응답
 * - basicCard: 카드 응답 (이미지 없이도 가능)
 * - quickReplies: 빠른 답장 버튼
 */

const settings = require('../../config/settings');

const kakaoTemplates = {

  // ── 기본 텍스트 응답 ──
  simpleText(text, quickReplies = []) {
    const res = {
      version: '2.0',
      template: {
        outputs: [
          { simpleText: { text: text.substring(0, 1000) } }
        ],
      },
    };
    if (quickReplies.length) {
      res.template.quickReplies = quickReplies.map(q => ({
        label: q.label,
        action: 'message',
        messageText: q.text || q.label,
      }));
    }
    return res;
  },

  // ── 채널 추가 환영 ──
  welcomeResponse(name) {
    const hon = name ? `${name}님` : '님';
    return {
      version: '2.0',
      template: {
        outputs: [{
          basicCard: {
            title: `안녕하세요, ${hon}! 🍯`,
            description: [
              'J Health Care Honey CS 챗봇이에요.',
              '',
              '아래 항목 중 궁금한 것을 선택하거나',
              '직접 질문해 주세요!',
            ].join('\n'),
            buttons: [
              { label: '🛒 주문·결제', action: 'message', messageText: '주문 취소하고 싶어요' },
              { label: '🚚 배송 문의', action: 'message', messageText: '배송 며칠 걸려요?' },
              { label: '🔄 교환·환불', action: 'message', messageText: '환불 가능한가요?' },
              { label: '⭐ 회원 혜택', action: 'message', messageText: 'VIP 혜택 알려주세요' },
            ],
          },
        }],
        quickReplies: [
          { label: '🌿 성분 확인', action: 'message', messageText: '전성분 어디서 봐요?' },
          { label: '💊 피부 트러블', action: 'message', messageText: '피부 트러블 났어요' },
          { label: '📞 담당자 연결', action: 'message', messageText: '담당자 연결해주세요' },
        ],
      },
    };
  },

  // ── 에스컬레이션 응답 (담당자 연결 버튼 포함) ──
  escalateResponse(text, name) {
    return {
      version: '2.0',
      template: {
        outputs: [{
          basicCard: {
            title: '담당자 연결',
            description: text.substring(0, 200),
            buttons: [
              {
                label: '📞 담당자 연결하기',
                action: 'message',
                messageText: '담당자 연결해주세요',
              },
            ],
          },
        }],
      },
    };
  },

  // ── 정보 부재 응답 (퀵리플라이 포함) ──
  noInfoResponse(text) {
    return {
      version: '2.0',
      template: {
        outputs: [{ simpleText: { text: text.substring(0, 200) } }],
        quickReplies: [
          { label: '담당자 연결', action: 'message', messageText: '담당자 연결해주세요' },
          { label: '다른 질문하기', action: 'message', messageText: '처음으로' },
        ],
      },
    };
  },

  // ── 오류 응답 ──
  errorResponse() {
    return {
      version: '2.0',
      template: {
        outputs: [{
          simpleText: {
            text: '일시적인 오류가 발생했어요 💦\n잠시 후 다시 시도해 주시거나 담당자에게 연결해 주세요.',
          },
        }],
        quickReplies: [
          { label: '담당자 연결', action: 'message', messageText: '담당자 연결해주세요' },
        ],
      },
    };
  },

  // ── 리스트 카드 (FAQ 카테고리 선택) ──
  faqCategoryCard() {
    return {
      version: '2.0',
      template: {
        outputs: [{
          listCard: {
            header: { title: 'FAQ 분류를 선택해 주세요' },
            items: [
              { title: '🛒 주문·결제', description: 'Q01~Q06', action: 'message', messageText: '주문 결제 관련 질문' },
              { title: '🚚 배송',      description: 'Q07~Q12', action: 'message', messageText: '배송 관련 질문' },
              { title: '🔄 교환·환불', description: 'Q13~Q20', action: 'message', messageText: '교환 환불 관련 질문' },
              { title: '🌿 제품·성분', description: 'Q21~Q28', action: 'message', messageText: '제품 성분 관련 질문' },
              { title: '💊 피부 트러블',description: 'Q29~Q34', action: 'message', messageText: '피부 트러블 관련 질문' },
              { title: '⭐ 회원·혜택', description: 'Q35~Q40', action: 'message', messageText: '회원 혜택 관련 질문' },
            ],
            buttons: [
              { label: '전체 FAQ 보기', action: 'message', messageText: 'FAQ 전체 보기' },
            ],
          },
        }],
      },
    };
  },
};

module.exports = { kakaoTemplates };
