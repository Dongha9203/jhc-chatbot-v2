'use strict';

/**
 * 12상황 분류기 (P3 확장 버전)
 * 기본 8상황 + FAQ 반영 4상황 추가
 */

const SITUATIONS = {
  S1:  '정상_응답',
  S2:  '정보_부재',
  S3:  '정책_위반',
  S4:  '단순_거절',
  S5:  '에스컬',
  S6:  '감정_격화',    // 즉시 에스컬
  S7:  '반복_질문',
  S8:  '칭찬_감사',
  S9:  '피부_부작용',  // FAQ Q29 신규
  S10: '리콜_정품',   // FAQ Q42·Q43 신규
  S11: '임산부_미성년', // FAQ Q25·Q45 신규
  S12: '복합_정책',   // FAQ Q05·Q13·Q17 신규
};

// 감정 격화 키워드 (즉시 S6)
const ANGER_KEYWORDS = [
  '화나', '짜증', '열받', '두번다시', '고소', '신고할',
  '어이없', '말이돼', '최악', '환불안해', '욕', '트러블났',
  '병원비', '피부망했', '부작용신고', '소비자원',
];

// 칭찬·감사 키워드 (S8)
const PRAISE_KEYWORDS = [
  '감사', '고마워', '좋아요', '최고', '친절', '잘됐어',
  '도움됐', '해결됐', '완벽', '만족', '빠르다',
];

// 피부 트러블 키워드 (S9)
const SKIN_KEYWORDS = [
  '발진', '가려움', '알러지', '알레르기', '트러블', '프러블', '트러불',
  '부작용', '따가움', '붉어', '부어', '피부반응', '피부문제',
  '피부이상', '피부트러블', '피부프러블',
];

// 임산부·미성년자 키워드 (S11)
const MINOR_PREGN_KEYWORDS = [
  '임산부', '임신', '임부', '태아', '임신중',
  '미성년', '청소년', '14세', '어린이', '학생', '아이',
];

// 에스컬레이션 직접 요청 키워드 (S5)
const ESCALATE_KEYWORDS = [
  '담당자연락', '담당자전화', '담당자콜', '콜백', '전화해줘', '전화해주세요',
  '연락달라', '연락해줘', '연락해주세요', '전화달라', '전화주세요',
  '사람연결', '상담원연결', '상담원바꿔', '직접통화', '사람이랑통화',
  '담당자바꿔', '담당자연결', '담당자에게연락', '나에게연락',
];

// 단순 거절 키워드 (S4) — 제공 불가 정보·비업무 질문
const REJECT_KEYWORDS = [
  // 임원·직원 개인 연락처
  '대표이사', '대표번호', '사장님번호', '임원연락', '직원번호', '직원연락',
  '대표전화번호', '사장전화', '대표자전화',
  // 회사 내부 정보
  '내부문서', '내부자료', '직원명단', '조직도', '내부시스템',
  // 비업무 질문
  '오늘날씨', '주식가격', '로또번호', '코인시세', '환율',
  // 경쟁사 정보 요청
  '타사가격', '경쟁사', '타브랜드',
];

// 복합 정책 키워드 (S12) — 2개 이상 주제 혼재
const COMPLEX_KEYWORDS = [
  ['환불', '쿠폰'], ['환불', '적립금'], ['교환', '할인'],
  ['VIP', '환불'], ['배송', '환불'], ['취소', '쿠폰'],
];

class SituationClassifier {
  /**
   * 상황 분류
   * @param {string} input  — 고객 입력 원문
   * @param {Array}  history — 이전 대화 이력
   * @returns {{ situation, confidence, meta }}
   */
  classify(input, history = []) {
    const q = (input || '').replace(/\s/g, '').toLowerCase();

    // S6: 감정 격화 (최우선)
    if (ANGER_KEYWORDS.some(k => q.includes(k.replace(/\s/g, '')))) {
      return { situation: SITUATIONS.S6, confidence: 0.95, meta: { escalate: true } };
    }

    // S8: 칭찬·감사
    if (PRAISE_KEYWORDS.some(k => q.includes(k))) {
      return { situation: SITUATIONS.S8, confidence: 0.9, meta: {} };
    }

    // S9: 피부 트러블 (즉시 에스컬 포함)
    if (SKIN_KEYWORDS.some(k => q.includes(k))) {
      return { situation: SITUATIONS.S9, confidence: 0.9, meta: { escalate: true, law: '화장품법 제5조' } };
    }

    // S11: 임산부·미성년자
    if (MINOR_PREGN_KEYWORDS.some(k => q.includes(k))) {
      return { situation: SITUATIONS.S11, confidence: 0.88, meta: { sensitive: true } };
    }

    // S12: 복합 정책 (2개 이상 주제)
    const isComplex = COMPLEX_KEYWORDS.some(pair =>
      pair.every(kw => q.includes(kw))
    );
    if (isComplex) {
      return { situation: SITUATIONS.S12, confidence: 0.85, meta: { multiTopic: true } };
    }

    // S7: 반복 질문
    if (history.length >= 2) {
      const lastQ = (history[history.length - 1]?.userInput || '').replace(/\s/g,'').toLowerCase();
      if (lastQ && lastQ === q) {
        return { situation: SITUATIONS.S7, confidence: 0.9, meta: {} };
      }
    }

    // S10: 리콜·정품 문의
    if (['리콜', '회수', '정품', '가품', 'qr', '홀로그램'].some(k => q.includes(k))) {
      return { situation: SITUATIONS.S10, confidence: 0.85, meta: { law: '화장품법 제15조의2' } };
    }

    // S5: 에스컬레이션 직접 요청
    if (ESCALATE_KEYWORDS.some(k => q.includes(k.replace(/\s/g, '')))) {
      return { situation: SITUATIONS.S5, confidence: 0.92, meta: { escalate: true } };
    }

    // S4: 단순 거절 (제공 불가 정보·비업무 질문)
    if (REJECT_KEYWORDS.some(k => q.includes(k.replace(/\s/g, '')))) {
      return { situation: SITUATIONS.S4, confidence: 0.92, meta: { reject: true } };
    }

    // 기본: S1 (검색 결과에 따라 S2·S3·S4·S5 로 변환됨)
    return { situation: SITUATIONS.S1, confidence: 0.7, meta: {} };
  }

  // 검색 결과 기반 상황 보정
  refine(classified, searchResults) {
    if (classified.situation === SITUATIONS.S1) {
      if (!searchResults || searchResults.length === 0) {
        return { ...classified, situation: SITUATIONS.S2 };
      }
      const top = searchResults[0];
      if (top.escalate) {
        return { ...classified, situation: SITUATIONS.S5, meta: { ...classified.meta, escalate: true } };
      }
    }
    return classified;
  }

  getSituations() { return SITUATIONS; }
}

const classifier = new SituationClassifier();
module.exports = { classifier, SITUATIONS, SituationClassifier };
