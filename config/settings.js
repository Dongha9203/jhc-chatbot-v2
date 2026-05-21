'use strict';
require('dotenv').config({ path: './config/.env' });

const settings = {
  server: {
    port: parseInt(process.env.PORT) || 3000,
    env:  process.env.NODE_ENV || 'development',
  },

  kakao: {
    channelId:     process.env.KAKAO_CHANNEL_ID     || '',
    channelSecret: process.env.KAKAO_CHANNEL_SECRET  || '',
    webhookVerify: process.env.KAKAO_WEBHOOK_VERIFY_TOKEN || 'jhc_honey_2026',
    // 카카오 i 오픈빌더 스킬 서버 응답 형식 사용
    responseType: 'skill',  // 'skill' | 'direct'
  },

  chroma: {
    host:        process.env.CHROMA_HOST        || 'localhost',
    port:        parseInt(process.env.CHROMA_PORT) || 8000,
    persistPath: process.env.CHROMA_PERSIST_PATH || './data/chromadb',
    collections: {
      faq:    'jhc_faq_v2',
      policy: 'jhc_policy_v2',
    },
  },

  sqlite: {
    path: process.env.SQLITE_PATH || './data/jhc_chatbot.db',
  },

  persona: {
    name:        process.env.BOT_NAME      || 'Honey',
    company:     process.env.COMPANY_NAME  || 'J Health Care',
    companyShort: 'JHC',
    greeting:    '안녕하세요, Honey예요! 😊\n자주 묻는 질문은 즉시 안내드리고, 복잡한 건 담당자 즉시 연결할게요!',
    followGreeting: '채널 추가해 주셔서 감사해요! 💚\nJ Health Care Honey CS 챗봇이에요.\n주문·배송·환불·성분 무엇이든 물어봐 주세요!',
    tone:    '발랄·트렌디',
    emoji:   true,
    honorific: '님',
  },

  policy: {
    refundDays:         7,
    logRetentionYears:  5,
    exchangeDays:       7,
    cardRefundDays:     5,
    accountRefundDays:  3,
    delivery: {
      standard: '1~3일',
      island:   '3~5일 추가',
      jeju:     '제주 3,000원 추가',
    },
  },

  search: {
    minScore:      parseFloat(process.env.SEARCH_MIN_SCORE)   || 0.25,
    topK:          parseInt(process.env.SEARCH_TOP_K)         || 3,
    exactBonus:    parseFloat(process.env.TFIDF_EXACT_BONUS)  || 2.0,
    keywordBonus:  parseFloat(process.env.TFIDF_KEYWORD_BONUS)|| 1.5,
  },

  channel: {
    kakao: { maxLength: 200,  emojiMax: 1  },
    email: { maxLength: 1500, emojiMax: 2  },
  },

  cache: {
    ttl:     parseInt(process.env.CACHE_TTL_SECONDS) || 300,
    maxKeys: parseInt(process.env.CACHE_MAX_KEYS)    || 1000,
  },

  escalation: {
    avgMinutes:  parseInt(process.env.ESCALATION_AVG_MIN) || 3,
    department:  '고객지원팀',
    hours:       '월~금 09:00~18:00 (공휴일 제외)',
  },

  compliance: {
    minorAge: 14,
    logYears: 5,
    // 화장품법 단정 금지 성분 키워드
    sensitiveKeywords: ['부작용발생률', '임산부가능', '효능보장', '천연인증단정'],
  },

  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000,
    max:      parseInt(process.env.RATE_LIMIT_MAX)        || 30,
  },

  log: {
    level: process.env.LOG_LEVEL || 'info',
    path:  process.env.LOG_PATH  || './logs',
  },
};

module.exports = settings;
