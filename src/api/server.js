'use strict';

/**
 * JHC Honey 챗봇 Express 서버
 * - POST /webhook/kakao      — 카카오톡 Webhook 수신
 * - GET  /health             — 헬스 체크
 * - GET  /admin              — 관리자 대시보드 UI
 * - /admin/api/*             — 대시보드 API (admin-router.js)
 * - GET  /admin/stats        — 운영 통계 (레거시 호환)
 * - GET  /admin/top10        — 미해결 Top10 (레거시 호환)
 * - POST /admin/chat         — CLI 테스트 (레거시 호환)
 */

const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const path       = require('path');
const rateLimit  = require('express-rate-limit');
const settings   = require('../../config/settings');
const { webhookHandler } = require('../kakao/webhook-handler');
const { chatPipeline }   = require('../engine/chat-pipeline');
const { logManager }     = require('../loop/log-manager');
const { searchEngine }   = require('../engine/tfidf-search');
const { logger }         = require('../utils/logger');
const adminRouter        = require('./admin-router');

const app = express();

// ── 정적 파일 (관리자 대시보드 HTML) ──
app.use(express.static(path.join(__dirname, '../../public')));

// ── 미들웨어 ──
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());

// Raw body 저장 (카카오 서명 검증용)
app.use('/webhook', express.raw({ type: '*/*' }), (req, res, next) => {
  req.rawBody = req.body;
  req.body    = JSON.parse(req.body.toString());
  next();
});

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate Limiting
const limiter = rateLimit({
  windowMs: settings.rateLimit.windowMs,
  max:      settings.rateLimit.max,
  message:  { error: '요청이 너무 많습니다. 잠시 후 시도해 주세요.' },
});
app.use('/webhook', limiter);

// ── 헬스 체크 ──
app.get('/health', async (req, res) => {
  const engineStats = searchEngine.getStats();
  res.json({
    status:  'ok',
    version: '2.0.0',
    persona: settings.persona.name,
    engine:  engineStats,
    uptime:  Math.floor(process.uptime()) + 's',
    time:    new Date().toISOString(),
  });
});

// ── 관리자 대시보드 진입점 ──
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/admin.html'));
});

// ── 대시보드 API 라우터 ──
app.use('/admin/api', adminRouter);

// ── 카카오톡 Webhook ──
app.post('/webhook/kakao', async (req, res) => {
  // 서명 검증 (운영 환경)
  if (settings.server.env === 'production') {
    const sig = req.headers['x-kakao-signature'] || '';
    if (!webhookHandler.verifySignature(req.rawBody, sig)) {
      logger.warn('카카오 서명 검증 실패');
      return res.status(401).json({ error: '인증 실패' });
    }
  }
  return webhookHandler.handle(req, res);
});

// ── 관리자 API ──

// 운영 통계
app.get('/admin/stats', async (req, res) => {
  const stats = await logManager.getMonthlyStats();
  res.json(stats);
});

// 미해결 Top10 (P4 폐곡선 월간 SOP)
app.get('/admin/top10', async (req, res) => {
  const days = parseInt(req.query.days) || 30;
  const top10 = await logManager.getUnresolvedTop10(days);
  res.json({
    period:   `최근 ${days}일`,
    count:    top10.length,
    patterns: top10,
    sop:      '매월 첫째 주 화요일 14:00 KB 갱신 미팅에서 검토',
  });
});

// 미해결 패턴 해결 표시
app.patch('/admin/top10/:id/resolve', async (req, res) => {
  await logManager.markResolved(req.params.id);
  res.json({ result: 'ok', message: 'KB 갱신 후 해결 표시 완료' });
});

// 검색 엔진 통계
app.get('/admin/engine', (req, res) => {
  res.json(searchEngine.getStats());
});

// CLI/테스트용 채팅
app.post('/admin/chat', async (req, res) => {
  const { input, userName, channel } = req.body;
  if (!input) return res.status(400).json({ error: '입력 필요' });

  const result = await chatPipeline.process({
    input,
    userId:   'admin_test',
    userName: userName || '테스트',
    channel:  channel || 'email',
    history:  [],
  });
  res.json(result);
});

// ── 404 처리 ──
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

// ── 오류 처리 ──
app.use((err, req, res, next) => {
  logger.error('서버 오류', err);
  res.status(500).json({ error: '서버 오류가 발생했습니다.' });
});

// ── 서버 시작 ──
async function startServer() {
  await chatPipeline.init();

  app.listen(settings.server.port, () => {
    logger.info(`🍯 JHC Honey 챗봇 서버 시작`);
    logger.info(`포트: ${settings.server.port}`);
    logger.info(`환경: ${settings.server.env}`);
    logger.info(`검색 엔진: ${searchEngine.getStats().mode}`);
    logger.info(`Webhook: POST /webhook/kakao`);
    logger.info(`대시보드: GET /admin`);
    logger.info(`관리자 API: /admin/api/*`);
  });
}

startServer().catch(err => {
  logger.error('서버 시작 실패', err);
  process.exit(1);
});

module.exports = { app };
