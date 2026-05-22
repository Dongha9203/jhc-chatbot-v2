'use strict';

/**
 * 한국어 전처리 유틸리티
 * 오타 교정 · 줄임말 정규화 · 이모지 처리 · 다국어 감지
 * 외부 형태소 분석기 없이 동작 (konlpy 선택사항)
 */

// 줄임말·채팅체 정규화 테이블
const NORMALIZE_TABLE = {
  '환구':  '환불',    '반풍':  '반품',    '배송함':  '배송기간',
  'ㄱㄴ':  '가능',    'ㅇㅋ':  '확인',    'ㄴ':      '아니요',
  '몇일':  '며칠',    '얼마나걸':  '배송기간', '뜯었':  '개봉',
  '됩니까': '가능한가요', '되나요': '가능한가요', '해줘': '해주세요',
  '알랴줘': '알려주세요', '알랴줘': '알려주세요',
  'VIP':  'VIP',     'vip':  'VIP',
  '취켜':  '취소',    '반품해':  '반품하고',
  '트러블났':  '피부 트러블 발생', '피부망':    '피부 트러블',
  '프러블':    '트러블',          '트러불':    '트러블',
  '피부프러블': '피부 트러블',    '피부트러불': '피부 트러블',
  '피부가 망가': '피부 트러블',   '피부 망가':  '피부 트러블',
  '망가졌':    '피부 트러블 발생', '피부손상':  '피부 트러블',
  '피부에 문제': '피부 트러블', '피부 문제': '피부 트러블',
  '피부에 이상': '피부 트러블', '피부 이상': '피부 트러블',
  '피부에 반응': '피부 트러블', '피부 반응': '피부 트러블',
  '문제가 발생': '트러블 발생', '이상이 생': '트러블 발생',
  '생겼어요': '발생했어요',
  'SPF':  'SPF',     'PA':   'PA',
};

// 이모지 → 의미 매핑 (감정 분석용)
const EMOJI_SENTIMENT = {
  '😭': { sentiment: 'negative', weight: 0.8 },
  '😡': { sentiment: 'angry',    weight: 1.0 },
  '🤬': { sentiment: 'angry',    weight: 1.0 },
  '😢': { sentiment: 'negative', weight: 0.6 },
  '😊': { sentiment: 'positive', weight: 0.8 },
  '🙏': { sentiment: 'neutral',  weight: 0.5 },
  '💦': { sentiment: 'negative', weight: 0.4 },
};

// 다국어 감지 패턴
const LANG_PATTERNS = {
  en: /[a-zA-Z]{3,}/,
  zh: /[\u4e00-\u9fff]/,
  ja: /[\u3040-\u30ff]/,
};

const koreanUtils = {

  /**
   * 종합 전처리
   */
  preprocess(input) {
    if (!input) return { original: '', normalized: '', lang: 'ko', emojiSentiment: null };

    const original = input.trim();

    // 이모지 감정 분석
    const emojiSentiment = this.analyzeEmoji(original);

    // 이모지 제거 (검색용)
    let text = original.replace(/[\u{1F300}-\u{1FFFF}]/gu, ' ');
    text = text.replace(/[\u2600-\u26FF]/gu, ' ');
    text = text.replace(/[\u2700-\u27BF]/gu, ' ');

    // 언어 감지
    const lang = this.detectLang(text);

    // 정규화
    const normalized = this.normalize(text);

    return { original, normalized, lang, emojiSentiment };
  },

  /**
   * 정규화 (줄임말 교정 + 특수문자 처리)
   */
  normalize(text) {
    let result = text.trim();

    // 줄임말 교정
    Object.entries(NORMALIZE_TABLE).forEach(([from, to]) => {
      result = result.replace(new RegExp(from, 'gi'), to);
    });

    // 연속 공백 정리
    result = result.replace(/\s+/g, ' ').trim();

    // 소문자 변환 (영문)
    result = result.toLowerCase();

    return result;
  },

  /**
   * 이모지 감정 분석
   */
  analyzeEmoji(text) {
    let maxWeight   = 0;
    let sentiment   = null;
    let foundEmoji  = null;

    Object.entries(EMOJI_SENTIMENT).forEach(([emoji, info]) => {
      if (text.includes(emoji) && info.weight > maxWeight) {
        maxWeight  = info.weight;
        sentiment  = info.sentiment;
        foundEmoji = emoji;
      }
    });

    return sentiment ? { sentiment, weight: maxWeight, emoji: foundEmoji } : null;
  },

  /**
   * 언어 감지
   */
  detectLang(text) {
    for (const [lang, pattern] of Object.entries(LANG_PATTERNS)) {
      if (pattern.test(text)) return lang;
    }
    return 'ko';
  },

  /**
   * 다국어 입력 처리 응답 생성
   */
  multiLangResponse(lang, answer) {
    if (lang === 'en') {
      return `${answer}\n\n[English] Please feel free to ask in Korean or English.`;
    }
    return answer;
  },

  /**
   * 텍스트 길이 제한 (채널별)
   */
  truncate(text, maxLength = 200, suffix = '…') {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - suffix.length) + suffix;
  },

  /**
   * 호칭 생성
   */
  buildHonorific(name, suffix = '님') {
    if (!name || name.trim() === '') return suffix;
    return `${name.trim()}${suffix}`;
  },
};

module.exports = { koreanUtils };
