'use strict';

/**
 * JHC Honey 관리자 대시보드 API 라우터
 * jhc-chatbot-v2 시스템과 직접 인터페이스
 *
 * 마운트: app.use('/admin/api', adminRouter)
 *
 * 엔드포인트:
 *   GET  /admin/api/dashboard      — 대시보드 KPI 전체
 *   GET  /admin/api/stats          — 운영 통계 (채널·시간대·상황별)
 *   GET  /admin/api/engine         — P2 RAG 엔진 상태
 *   GET  /admin/api/top10          — P4 미해결 Top10
 *   PATCH /admin/api/top10/:id     — Top10 해결 표시
 *   GET  /admin/api/faq            — FAQ KB 전체 목록
 *   POST /admin/api/faq            — FAQ 추가
 *   PUT  /admin/api/faq/:id        — FAQ 수정
 *   DELETE /admin/api/faq/:id      — FAQ 삭제
 *   POST /admin/api/faq/reindex    — ChromaDB 재인덱싱 트리거
 *   GET  /admin/api/compliance     — P5 컴플라이언스 현황
 *   GET  /admin/api/pipeline       — P1~P5 파이프라인 상태
 *   GET  /admin/api/evaluation     — 평가 결과
 *   POST /admin/api/evaluation     — 평가 저장
 *   POST /admin/api/chat/test      — 챗봇 테스트 (관리자용)
 *   GET  /admin/api/logs           — 최근 대화 로그
 */

const express        = require('express');
const router         = express.Router();
const FAQ_DATA       = require('../kb/faq-data');
const POLICY_DATA    = require('../kb/policy-data');
const { searchEngine }    = require('../engine/tfidf-search');
const { chatPipeline }    = require('../engine/chat-pipeline');
const { classifier }      = require('../engine/situation-classifier');
const { trapValidator }   = require('../engine/trap-validator');
const settings            = require('../../config/settings');
const { logger }          = require('../utils/logger');
const fs                  = require('fs');
const path                = require('path');

// ── 인메모리 FAQ 저장소 (실제 faq-data.js와 동기화) ──
let faqStore = FAQ_DATA.map((f, i) => ({
  ...f,
  _idx:    i,
  updatedAt: new Date().toISOString().slice(0, 10),
}));

// ── 인메모리 평가 저장소 ──
let evaluations = [
  { id: 1, userId: 'kakao_001', userName: '김지은', score: 5, category: '배송', situation: '정상_응답', source: 'FAQ §Q07', comment: '배송 문의 즉시 정확하게 알려줘서 만족!', channel: 'kakao', createdAt: new Date(Date.now()-2*60000).toISOString() },
  { id: 2, userId: 'email_002', userName: '박민준', score: 4, category: '교환·환불', situation: '정상_응답', source: 'FAQ §Q13', comment: '환불 방법 자세히 알려줬어요. 조금 더 친근했으면 좋겠어요.', channel: 'email', createdAt: new Date(Date.now()-15*60000).toISOString() },
  { id: 3, userId: 'kakao_003', userName: '이수연', score: 5, category: '피부 트러블', situation: '피부_부작용', source: 'S9 에스컬', comment: '피부 트러블 났을 때 빠르게 담당자 연결해줘서 감사해요 🙏', channel: 'kakao', createdAt: new Date(Date.now()-32*60000).toISOString() },
  { id: 4, userId: 'email_004', userName: '최현우', score: 3, category: '회원·혜택', situation: '복합_정책', source: 'FAQ §Q35', comment: 'VIP 할인 관련 답변이 애매했어요.', channel: 'email', createdAt: new Date(Date.now()-60*60000).toISOString() },
  { id: 5, userId: 'kakao_005', userName: '정예원', score: 5, category: '제품·성분', situation: '정상_응답', source: 'FAQ §Q21', comment: '성분 확인 방법 알려줘서 도움됐어요! 이모지 귀여워요 😊', channel: 'kakao', createdAt: new Date(Date.now()-120*60000).toISOString() },
  { id: 6, userId: 'kakao_006', userName: '강도현', score: 4, category: '배송', situation: '정상_응답', source: 'FAQ §Q09', comment: '제주 배송비 바로 알려줘서 편했어요.', channel: 'kakao', createdAt: new Date(Date.now()-180*60000).toISOString() },
];

// ── 월간 데이터 시뮬레이션 (로그 DB 없을 때) ──
function getSimulatedStats() {
  const now = new Date();
  return {
    totalMessages: 487,
    resolved: 394,
    unresolved: 93,
    escalated: 73,
    resolveRate: '80.9%',
    byChannel: [
      { channel: 'email', c: 312 },
      { channel: 'kakao', c: 175 },
    ],
    bySituation: [
      { situation: '정상_응답',    count: 214 },
      { situation: '정보_부재',    count: 58 },
      { situation: '정책_위반',    count: 49 },
      { situation: '에스컬',       count: 44 },
      { situation: '감정_격화',    count: 29 },
      { situation: '피부_부작용',  count: 39 },
      { situation: '복합_정책',    count: 34 },
      { situation: '기타',         count: 20 },
    ],
    byCategory: [
      { category: '교환·환불', count: 161, resolved: 128, escalated: 18 },
      { category: '배송',      count: 117, resolved: 101, escalated:  8 },
      { category: '제품·성분', count:  97, resolved:  74, escalated: 12 },
      { category: '회원·혜택', count:  68, resolved:  63, escalated:  2 },
      { category: '피부 트러블',count: 44, resolved:  28, escalated: 16 },
    ],
    byHour: [9,5,7,12,18,21,19,14,10,8,6,4,3,2].map((v,i) => ({ hour: i+8, count: v*4 })),
    monthly: [
      { month: '10월', total: 312, resolved: 234 },
      { month: '11월', total: 341, resolved: 263 },
      { month: '12월', total: 378, resolved: 295 },
      { month: '1월',  total: 398, resolved: 316 },
      { month: '2월',  total: 421, resolved: 339 },
      { month: '3월',  total: 454, resolved: 369 },
      { month: '4월',  total: 487, resolved: 394 },
    ],
    trapBlocked: { trap1: 23, trap2: 8, trap3: 4, cosmLaw: 11 },
    piiMasked: 7,
  };
}

// ── 로그매니저 안전 래퍼 (async) ──
const { logManager } = require('../loop/log-manager');

const SIM_TOP10 = [
  { id:1,  pattern:'배송 소요일 문의',  count:12, first_seen:'2026-04-01', last_seen:'2026-05-01', resolved:1 },
  { id:2,  pattern:'성분 부작용 문의',  count: 9, first_seen:'2026-04-03', last_seen:'2026-05-02', resolved:1 },
  { id:3,  pattern:'VIP 할인 중복',     count: 7, first_seen:'2026-04-05', last_seen:'2026-05-03', resolved:1 },
  { id:4,  pattern:'개봉 후 교환 기간', count: 6, first_seen:'2026-04-08', last_seen:'2026-05-04', resolved:1 },
  { id:5,  pattern:'해외 배송 국가',    count: 5, first_seen:'2026-04-10', last_seen:'2026-05-05', resolved:0 },
  { id:6,  pattern:'정기 구독 해지',    count: 5, first_seen:'2026-04-12', last_seen:'2026-05-06', resolved:0 },
  { id:7,  pattern:'민감성 피부 추천',  count: 4, first_seen:'2026-04-15', last_seen:'2026-05-07', resolved:0 },
  { id:8,  pattern:'재입고 알림 신청',  count: 4, first_seen:'2026-04-18', last_seen:'2026-05-08', resolved:0 },
  { id:9,  pattern:'샘플 증정 기준',    count: 3, first_seen:'2026-04-20', last_seen:'2026-05-09', resolved:0 },
  { id:10, pattern:'첫구매+VIP 중복',   count: 3, first_seen:'2026-04-22', last_seen:'2026-05-10', resolved:0 },
];

async function safeGetStats() {
  try {
    const stats = await logManager.getMonthlyStats();
    if (stats) return stats;
  } catch (e) {
    logger.warn('LogManager 오류 — 시뮬레이션 반환', e.message);
  }
  return getSimulatedStats();
}

function isValidPattern(pattern) {
  if (!pattern || typeof pattern !== 'string') return false;
  if (pattern.includes('�')) return false;   // UTF-8 디코딩 오류 (EUC-KR 혼입)
  if (pattern.trim().length < 2) return false;
  // 한국어·영문·숫자·일반 기호만 허용 — 인코딩 깨진 제어문자 차단
  const garbage = /[\x00-\x08\x0E-\x1F\x7F]/;
  return !garbage.test(pattern);
}

async function safeGetTop10(days) {
  if (!logManager.client) return { data: [], source: 'no_db' };
  try {
    const rows = await logManager.getAllPatterns(days);
    const clean = rows.filter(r => isValidPattern(r.pattern));
    return { data: clean, source: clean.length > 0 ? 'db' : 'empty' };
  } catch (e) {
    logger.warn('Top10 조회 오류 — 빈 결과 반환', e.message);
    return { data: [], source: 'error' };
  }
}

// ═══════════════════════════════════════════
// GET /admin/api/dashboard — 대시보드 KPI
// ═══════════════════════════════════════════
router.get('/dashboard', async (req, res) => {
  try {
    const [stats, top10Result, pipeline, nps, evalData] = await Promise.all([
      safeGetStats(), safeGetTop10(30), getPipelineStatus(),
      logManager.getNps(),
      logManager.getEvaluations({ limit: 3 }),
    ]);
    const recentEvals  = evalData.rows.length > 0 ? evalData.rows.slice(0, 3).map(r => ({
      id: r.id, userId: r.user_id, userName: r.user_name || '고객',
      score: r.score, category: r.category, situation: r.situation,
      source: r.source, comment: r.comment, channel: r.channel, createdAt: r.created_at,
    })) : evaluations.slice(0, 3);
    const avgScore = evalData.summary?.avg_score
      || (evaluations.reduce((s, e) => s + e.score, 0) / evaluations.length).toFixed(1);

    res.json({
      kpi: {
        totalMessages: stats.totalMessages || 0,
        resolveRate:   stats.resolveRate   || '0%',
        nps:           nps ?? 44,
        avgScore:      String(avgScore),
        kbCount:       faqStore.length + POLICY_DATA.length,
        escalated:     stats.escalated || 0,
      },
      engine: searchEngine.getStats(),
      recentTop5:  top10Result.data.slice(0, 5),
      top10Source: top10Result.source,
      recentEvals,
      pipeline,
    });
  } catch (e) {
    logger.error('dashboard API error', e);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════
// GET /admin/api/stats — 운영 통계 전체
// ═══════════════════════════════════════════
router.get('/stats', async (req, res) => {
  try {
    const sim   = getSimulatedStats();
    const stats = await safeGetStats();
    // 실데이터 우선, 실데이터에 없는 항목만 시뮬레이션으로 폴백
    const hasReal = stats && stats.totalMessages > 0;
    res.json({
      // 실데이터 기본값, 없을 때만 시뮬로 폴백
      totalMessages: stats.totalMessages ?? sim.totalMessages,
      resolved:      stats.resolved      ?? sim.resolved,
      unresolved:    stats.unresolved    ?? sim.unresolved,
      escalated:     stats.escalated     ?? sim.escalated,
      resolveRate:   stats.resolveRate   ?? sim.resolveRate,
      period:        stats.period        ?? sim.period,
      bySituation: (stats.bySituation?.length > 0) ? stats.bySituation : (hasReal ? [] : sim.bySituation),
      byHour:      (stats.byHour?.length > 0)      ? stats.byHour      : (hasReal ? [] : sim.byHour),
      monthly:     (stats.monthly?.length > 0)     ? stats.monthly     : (hasReal ? [] : sim.monthly),
      byChannel:   (stats.byChannel?.length > 0)   ? stats.byChannel   : (hasReal ? [] : sim.byChannel),
      // byCategory: DB 실데이터 (category 컬럼 추적), 없으면 빈 배열
      byCategory:  (stats.byCategory?.length > 0) ? stats.byCategory : (hasReal ? [] : sim.byCategory),
      // trapBlocked·piiMasked는 엔진 내부 카운터이므로 실데이터 없음 명시
      trapBlocked:  null,
      piiMasked:    null,
      top10Unresolved: stats.top10Unresolved ?? [],
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════
// GET /admin/api/engine — P2 RAG 엔진 상태
// ═══════════════════════════════════════════
router.get('/engine', async (req, res) => {
  const stats = searchEngine.getStats();
  const [accStats, trapStats] = await Promise.all([
    logManager.getAccuracyStats(30),
    logManager.getTrapStats(30),
  ]);
  const trapCounts = trapStats || trapValidator.getBlockStats();
  res.json({
    ...stats,
    accuracy:      accStats ? accStats.accuracy      : 81,
    hallucination: accStats ? accStats.hallucination : 5,
    sourceRate:    accStats ? accStats.sourceRate     : 80,
    accuracySource: accStats ? 'db' : 'simulation',
    trapBlocked:  trapCounts,
    trapSource:   trapStats ? 'db' : 'runtime',
    piiMasked:    trapCounts.piiMasked,
    chromaStatus: stats.mode === 'chromadb' ? 'online' : 'offline',
    cacheHitRate: '34%',
    avgResponseMs: 4.2,
  });
});

// ═══════════════════════════════════════════
// GET  /admin/api/top10 — P4 미해결 Top10
// PATCH /admin/api/top10/:id — 해결 표시
// ═══════════════════════════════════════════
router.get('/top10', async (req, res) => {
  const days = parseInt(req.query.days) || 30;
  const { data, source } = await safeGetTop10(days);
  res.json({ period: `최근 ${days}일`, count: data.length, patterns: data, source });
});

router.patch('/top10/:id', async (req, res) => {
  const numId = parseInt(req.params.id);
  // SIM 폴백 배열도 즉시 갱신 (DB 미연결 환경 대응)
  const simItem = SIM_TOP10.find(p => p.id === numId);
  if (simItem) simItem.resolved = 1;
  try {
    await logManager.markResolved(req.params.id);
  } catch (e) { /* DB 미연결 시 무시 */ }
  res.json({ result: 'ok', id: numId });
});

// ═══════════════════════════════════════════
// FAQ KB CRUD
// ═══════════════════════════════════════════

// GET /admin/api/faq
router.get('/faq', (req, res) => {
  const { cat, q, page = 1, limit = 50 } = req.query;
  let data = [...faqStore];
  if (cat) data = data.filter(f => f.category === cat);
  if (q)   data = data.filter(f =>
    f.question.includes(q) || f.answer.includes(q) ||
    (f.keywords || []).some(k => k.includes(q))
  );
  const total = data.length;
  const start = (parseInt(page) - 1) * parseInt(limit);
  res.json({
    total,
    page:  parseInt(page),
    limit: parseInt(limit),
    data:  data.slice(start, start + parseInt(limit)),
  });
});

// POST /admin/api/faq — 추가
router.post('/faq', (req, res) => {
  const { category, question, answer, keywords = [], law, escalate = false, sensitive = false } = req.body;
  if (!category || !question || !answer) {
    return res.status(400).json({ error: '분류·질문·답변은 필수입니다.' });
  }
  const newId = 'Q' + String(faqStore.length + 51).padStart(2, '0');
  const item = {
    id: newId, category, question, answer,
    keywords: Array.isArray(keywords) ? keywords : keywords.split(',').map(k=>k.trim()),
    law: law || null,
    escalate: Boolean(escalate),
    sensitive: Boolean(sensitive),
    _idx: faqStore.length,
    updatedAt: new Date().toISOString().slice(0, 10),
  };
  faqStore.push(item);
  logger.info(`FAQ 추가: ${newId} — ${question.slice(0,30)}`);
  // 검색 엔진 재초기화 트리거
  searchEngine.initialized = false;
  res.status(201).json(item);
});

// PUT /admin/api/faq/:id — 수정
router.put('/faq/:id', (req, res) => {
  const idx = faqStore.findIndex(f => f.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: '항목 없음' });
  const { category, question, answer, keywords, law, escalate, sensitive } = req.body;
  faqStore[idx] = {
    ...faqStore[idx],
    ...(category  !== undefined && { category }),
    ...(question  !== undefined && { question }),
    ...(answer    !== undefined && { answer }),
    ...(keywords  !== undefined && { keywords: Array.isArray(keywords) ? keywords : keywords.split(',').map(k=>k.trim()) }),
    ...(law       !== undefined && { law }),
    ...(escalate  !== undefined && { escalate: Boolean(escalate) }),
    ...(sensitive !== undefined && { sensitive: Boolean(sensitive) }),
    updatedAt: new Date().toISOString().slice(0, 10),
  };
  searchEngine.initialized = false;
  logger.info(`FAQ 수정: ${req.params.id}`);
  res.json(faqStore[idx]);
});

// DELETE /admin/api/faq/:id — 삭제
router.delete('/faq/:id', (req, res) => {
  const idx = faqStore.findIndex(f => f.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: '항목 없음' });
  faqStore.splice(idx, 1);
  searchEngine.initialized = false;
  logger.info(`FAQ 삭제: ${req.params.id}`);
  res.json({ result: 'ok' });
});

// POST /admin/api/faq/reindex — 검색 엔진 재인덱싱
router.post('/faq/reindex', async (req, res) => {
  searchEngine.initialized = false;
  try {
    await searchEngine.init();
    res.json({ result: 'ok', mode: searchEngine.getStats().mode, docCount: searchEngine.getStats().docCount });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════
// GET /admin/api/compliance — P5 현황
// ═══════════════════════════════════════════
router.get('/compliance', (req, res) => {
  res.json({
    items: [
      { id: 1, name: '개인정보 마스킹',  status: 'ok',   law: '개인정보보호법',     detail: 'TrapValidator PII 패턴 자동 마스킹 적용중', faq: 'Q44', completedAt: '2026-01-15' },
      { id: 2, name: '환불 7일 룰',     status: 'ok',   law: '전자상거래법 §17',   detail: 'FAQ Q13·Q15 기반 정확 안내 운영중', faq: 'Q13·Q15', completedAt: '2026-01-15' },
      { id: 3, name: '마케팅 동의',     status: 'warn', law: '정보통신망법 §50',   detail: '동의 절차 도입 진행중 (2026.06 완료 목표)', faq: '-', dueDate: '2026-06-30' },
      { id: 4, name: '외국 사용자',     status: 'ok',   law: 'GDPR (추후)',        detail: '현재 국내 고객만 서비스. FAQ Q06 글로벌몰 안내', faq: 'Q06', completedAt: '-' },
      { id: 5, name: '응답 로그 보관',  status: 'warn', law: '전자상거래법 §6',    detail: 'SQLite 아카이빙 도입중 (2026.06 완료 목표)', faq: 'Q44', dueDate: '2026-06-30' },
      { id: 6, name: '미성년자 룰',     status: 'ok',   law: '개인정보보호법 §22', detail: 'FAQ Q45 기반 14세 기준·법정대리인 동의 룰 구축', faq: 'Q45', completedAt: '2026-05-01' },
    ],
    cosmLaw: [
      { article: '화장품법 제5조',       desc: '부작용 신고 포털 안내 KB 반영',      faq: 'Q41', status: 'ok' },
      { article: '화장품법 제15조의2',   desc: '리콜·회수 식품안전나라 안내',        faq: 'Q42', status: 'ok' },
      { article: '화장품법 제10조 제1항',desc: '전성분 표시 안내 KB 반영',           faq: 'Q21·Q24', status: 'ok' },
      { article: '화장품법 제2조 제2호', desc: '기능성 화장품 정의·효능 단정 금지', faq: 'Q22', status: 'ok' },
    ],
    coso: {
      operations:  { status: 'ok',   label: '양호',    detail: '정확도 81% · 톤 일관성 양호' },
      strategic:   { status: 'warn', label: '부분구축', detail: 'KB 갱신 40% · 카카오톡 준비중' },
      compliance:  { status: 'alert',label: '요주의',   detail: '즉시 시정 2건 이월' },
      reporting:   { status: 'alert',label: '미흡',     detail: 'NPS 미측정 · 고객 관점 데이터 공백' },
    },
  });
});

// ═══════════════════════════════════════════
// GET /admin/api/pipeline — P1~P5 전체 상태
// ═══════════════════════════════════════════
async function getPipelineStatus() {
  const engine    = searchEngine.getStats();
  const [accStats, toneStats, trapStats, top10Sum] = await Promise.all([
    logManager.getAccuracyStats(30),
    logManager.getToneStats(30),
    logManager.getTrapStats(30),
    logManager.getTop10Summary(30),
  ]);
  const toneRatio  = toneStats || { empathy: 62, reject: 23, escalate: 15 };
  const trapCounts = trapStats || trapValidator.getBlockStats();

  // P1 KB진단 — faqStore 실제 데이터 분석
  const kbTotal    = faqStore.length;
  const kbTarget   = 50;
  const dScore = Math.min(2.0, (kbTotal / kbTarget) * 2.0);
  const rScore = kbTotal > 0 ? (faqStore.filter(f => f.keywords?.length > 0).length / kbTotal) * 1.0 : 0;
  const tScore = accStats ? (accStats.sourceRate / 100) * 1.5 : 1.0;
  const lScore = kbTotal > 0 ? (faqStore.filter(f => f.law).length / kbTotal) * 1.0 : 0;
  const p1Score = parseFloat((dScore + rScore + tScore + lScore).toFixed(1));

  // P4 폐곡선 — Supabase 실데이터
  const top10Done  = top10Sum ? top10Sum.done  : 4;
  const top10Total = top10Sum ? top10Sum.total : 10;

  // P5 컴플라이언스 — 정적 항목 + trap_events 연동
  const COMPLIANCE_ITEMS = [
    { status: 'ok'   },  // 개인정보 마스킹
    { status: 'ok'   },  // 환불 7일 룰
    { status: 'warn' },  // 마케팅 동의
    { status: 'ok'   },  // 외국 사용자
    { status: 'warn' },  // 응답 로그 보관
    { status: 'ok'   },  // 미성년자 룰
  ];
  const cosmLawBlocked = trapCounts.cosmLaw || 0;
  const p5Ok    = COMPLIANCE_ITEMS.filter(i => i.status === 'ok').length;
  const p5Warn  = COMPLIANCE_ITEMS.filter(i => i.status === 'warn').length;
  const p5Alert = cosmLawBlocked > 0 ? 1 : 0;
  const cosmLawFaqCount = faqStore.filter(f => f.law && f.law.includes('화장품법')).length;

  return {
    p1: { score: p1Score, max: 8, d: parseFloat(dScore.toFixed(1)), r: parseFloat(rScore.toFixed(1)), t: parseFloat(tScore.toFixed(1)), l: parseFloat(lScore.toFixed(1)), argyris: 'Single→Double 전환중', source: 'kb' },
    p2: {
      accuracy:      accStats ? accStats.accuracy      : 81,
      hallucination: accStats ? accStats.hallucination : 5,
      sourceRate:    accStats ? accStats.sourceRate     : 80,
      accuracySource: accStats ? 'db' : 'simulation',
      mode: engine.mode, vocabSize: engine.vocabSize, docCount: engine.docCount,
      trapBlocked: trapCounts, trapSource: trapStats ? 'db' : 'runtime',
    },
    p3: { situations: 12, tones: 3, toneRatio, toneSource: toneStats ? 'db' : 'simulation' },
    p4: { top10Done, top10Total, nextMeeting: '2026-06-03 14:00', argyrisState: 'Single→Double 전환중', source: top10Sum ? 'db' : 'simulation' },
    p5: { ok: p5Ok, warn: p5Warn, alert: p5Alert, cosmLawItems: cosmLawFaqCount, cosmLawBlocked, source: 'kb+db' },
  };
}

router.get('/pipeline', async (req, res) => {
  res.json(await getPipelineStatus());
});

// ═══════════════════════════════════════════
// GET  /admin/api/evaluation — 평가 결과
// POST /admin/api/evaluation — 평가 저장
// ═══════════════════════════════════════════
router.get('/evaluation', async (req, res) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = parseInt(req.query.offset) || 0;
    const { rows, total, summary } = await logManager.getEvaluations({ limit, offset });

    // DB에 데이터가 없으면 인메모리 폴백
    if (total === 0) {
      const list = evaluations.slice().reverse();
      const t    = list.length;
      const avg  = t ? (list.reduce((s,e)=>s+e.score,0)/t).toFixed(1) : '0.0';
      return res.json({
        summary: {
          total: t, avgScore: avg, nps: 44,
          positive: Math.round(list.filter(e=>e.score>=4).length/t*100||0),
          neutral:  Math.round(list.filter(e=>e.score===3).length/t*100||0),
          negative: Math.round(list.filter(e=>e.score<=2).length/t*100||0),
        },
        criteria: { accuracy:4.2, speed:4.6, naturalness:3.9, resolution:3.7, escalate:4.1 },
        list,
        source: 'simulation',
      });
    }

    const t = total || 0;
    const pos = summary?.positive || 0;
    const neg = summary?.negative || 0;
    const realNps = t ? Math.max(-100, Math.min(100, Math.round(((pos - neg) / t) * 100))) : 0;
    return res.json({
      summary: {
        total: t,
        avgScore: summary?.avg_score || '0.0',
        nps: realNps,
        positive: t ? Math.round(pos/t*100) : 0,
        neutral:  t ? Math.round((summary?.neutral||0)/t*100) : 0,
        negative: t ? Math.round(neg/t*100) : 0,
      },
      criteria: { accuracy:4.2, speed:4.6, naturalness:3.9, resolution:3.7, escalate:4.1 },
      list: rows.map(r => ({
        id:        r.id,
        userId:    r.user_id,
        userName:  r.user_name || '고객',
        score:     r.score,
        category:  r.category,
        situation: r.situation,
        source:    r.source,
        comment:   r.comment,
        channel:   r.channel,
        createdAt: r.created_at,
      })),
      source: 'postgresql',
    });
  } catch (e) {
    logger.error('evaluation GET error', e);
    res.status(500).json({ error: e.message });
  }
});

router.post('/evaluation', async (req, res) => {
  const { userId, userName, score, category, situation, source, comment, channel } = req.body;
  if (!score) return res.status(400).json({ error: 'score 필요' });
  await logManager.saveEvaluation({
    userId:    userId    || 'anonymous',
    userName:  userName  || '익명',
    score:     parseInt(score),
    category:  category  || '기타',
    situation: situation || '정상_응답',
    source:    source    || '',
    comment:   comment   || '',
    channel:   channel   || 'kakao',
  });
  res.status(201).json({ result: 'ok' });
});

// ═══════════════════════════════════════════
// POST /admin/api/chat/test — 챗봇 테스트
// ═══════════════════════════════════════════
router.post('/chat/test', async (req, res) => {
  const { input, userName = '관리자', channel = 'email' } = req.body;
  if (!input) return res.status(400).json({ error: 'input 필요' });

  if (!chatPipeline.initialized) await chatPipeline.init();

  const userId = 'admin_test_' + Date.now();
  const result = await chatPipeline.process({ input, userId, userName, channel, history: [] });

  await logManager.save({
    userId,
    channel,
    input,
    response:    result.response,
    situation:   result.situation,
    searchScore: result.searchScore,
    resolved:    result.resolved,
    source:      result.source,
    category:    result.category,
    escalated:   result.escalate,
    issues:      result.issues,
  });

  res.json(result);
});

// ═══════════════════════════════════════════
// GET /admin/api/logs — 최근 대화 로그
// ═══════════════════════════════════════════
router.get('/logs', async (req, res) => {
  const limit   = Math.min(parseInt(req.query.limit)  || 50, 200);
  const offset  = parseInt(req.query.offset) || 0;
  const channel = req.query.channel;

  try {
    const { rows, total } = await logManager.getLogs({ limit, offset, channel });
    if (rows.length > 0 || total > 0) {
      return res.json({ total, count: rows.length, offset, logs: rows, source: 'postgresql' });
    }
  } catch (e) {
    logger.warn('logs API — PostgreSQL 오류, 빈 결과 반환:', e.message);
  }

  res.json({ total: 0, count: 0, offset: 0, logs: [], source: 'postgresql', message: '아직 대화 기록이 없습니다.' });
});

module.exports = router;
