'use strict';

/**
 * JHC Honey 관리자 대시보드 독립 서버
 *
 * ★ 기존 챗봇 시스템 파일 무수정 ★
 * - src/api/server.js    → 절대 수정 안 함
 * - src/engine/*.js      → 절대 수정 안 함
 * - src/kb/*.js          → 절대 수정 안 함
 * - 그 외 기존 파일       → 절대 수정 안 함
 *
 * 실행: node src/api/dashboard-server.js
 * 접속: http://localhost:3001/admin
 *
 * 챗봇 서버(3000)의 기존 API를 HTTP로 프록시하여
 * 대시보드에서 챗봇 시스템과 인터페이스합니다.
 */

const express  = require('express');
const cors     = require('cors');
const path     = require('path');

const DASHBOARD_PORT  = parseInt(process.env.DASHBOARD_PORT)  || 3001;
const CHATBOT_API_URL = process.env.CHATBOT_API_URL || 'http://localhost:3000';

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// ── 정적 파일 (대시보드 HTML) ──
app.use(express.static(path.join(__dirname, '../../public')));

// ── 대시보드 진입점 ──
app.get('/', (req, res) => res.redirect('/admin'));
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/admin.html'));
});

// ── 챗봇 시스템 API 프록시 ──
// 기존 server.js를 수정하지 않고, HTTP 프록시로 데이터 수신
async function proxyGet(path) {
  const res = await fetch(`${CHATBOT_API_URL}${path}`);
  if (!res.ok) throw new Error(`Chatbot API ${path}: ${res.status}`);
  return res.json();
}
async function proxyPost(path, body) {
  const res = await fetch(`${CHATBOT_API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Chatbot API POST ${path}: ${res.status}`);
  return res.json();
}
async function proxyPatch(path) {
  const res = await fetch(`${CHATBOT_API_URL}${path}`, { method: 'PATCH' });
  return res.json();
}

// ── FAQ 인메모리 저장소 (기존 faq-data.js 읽기 전용 참조) ──
const FAQ_DATA    = require('../kb/faq-data');
const POLICY_DATA = require('../kb/policy-data');
let faqStore = FAQ_DATA.map((f, i) => ({
  ...f, _idx: i, updatedAt: new Date().toISOString().slice(0, 10),
}));

// ── 평가 저장소 ──
let evaluations = [
  { id:1, userId:'kakao_001', userName:'김지은',  score:5, category:'배송',      situation:'정상_응답',   source:'FAQ §Q07', comment:'배송 문의 즉시 정확! 만족해요 😊', channel:'kakao', createdAt: new Date(Date.now()-2*60000).toISOString() },
  { id:2, userId:'email_002', userName:'박민준',  score:4, category:'교환·환불', situation:'정상_응답',   source:'FAQ §Q13', comment:'환불 방법 잘 알려줬어요. 조금 더 친근했으면!', channel:'email', createdAt: new Date(Date.now()-15*60000).toISOString() },
  { id:3, userId:'kakao_003', userName:'이수연',  score:5, category:'피부 트러블',situation:'피부_부작용', source:'S9 에스컬', comment:'피부 트러블 때 빠르게 연결해줘서 감사해요 🙏', channel:'kakao', createdAt: new Date(Date.now()-32*60000).toISOString() },
  { id:4, userId:'email_004', userName:'최현우',  score:3, category:'회원·혜택', situation:'복합_정책',   source:'FAQ §Q35', comment:'VIP 할인 답변이 좀 애매했어요.', channel:'email', createdAt: new Date(Date.now()-60*60000).toISOString() },
  { id:5, userId:'kakao_005', userName:'정예원',  score:5, category:'제품·성분', situation:'정상_응답',   source:'FAQ §Q21', comment:'성분 확인 방법 알려줘서 도움됐어요! 😊', channel:'kakao', createdAt: new Date(Date.now()-120*60000).toISOString() },
];

// ── 시뮬레이션 통계 ──
function getSimStats() {
  return {
    totalMessages: 487, resolved: 394, unresolved: 93, escalated: 73,
    resolveRate: '80.9%',
    byChannel:   [{ channel:'email', c:312 }, { channel:'kakao', c:175 }],
    bySituation: [
      { situation:'정상_응답',   count:214 }, { situation:'정보_부재',  count:58  },
      { situation:'정책_위반',   count:49  }, { situation:'에스컬',     count:44  },
      { situation:'감정_격화',   count:29  }, { situation:'피부_부작용',count:39  },
      { situation:'복합_정책',   count:34  }, { situation:'기타',        count:20  },
    ],
    byCategory: [
      { category:'교환·환불', count:161, resolved:128, escalated:18 },
      { category:'배송',      count:117, resolved:101, escalated: 8 },
      { category:'제품·성분', count: 97, resolved: 74, escalated:12 },
      { category:'회원·혜택', count: 68, resolved: 63, escalated: 2 },
      { category:'피부 트러블',count:44, resolved: 28, escalated:16 },
    ],
    byHour: [9,5,7,12,18,21,19,14,10,8].map((v,i)=>({ hour:i+8, count:v*4 })),
    monthly: [
      {month:'10월',total:312,resolved:234},{month:'11월',total:341,resolved:263},
      {month:'12월',total:378,resolved:295},{month:'1월', total:398,resolved:316},
      {month:'2월', total:421,resolved:339},{month:'3월', total:454,resolved:369},
      {month:'4월', total:487,resolved:394},
    ],
    trapBlocked: { trap1:23, trap2:8, trap3:4, cosmLaw:11 },
    piiMasked: 7,
  };
}

function getSimTop10() {
  return [
    {id:1,pattern:'배송 소요일 문의',   count:12,faq:'Q07',resolved:1},
    {id:2,pattern:'성분 부작용 문의',   count: 9,faq:'Q29',resolved:1},
    {id:3,pattern:'VIP 할인 중복',      count: 7,faq:'Q05',resolved:1},
    {id:4,pattern:'개봉 후 교환 기간',  count: 6,faq:'Q15',resolved:1},
    {id:5,pattern:'해외 배송 국가',     count: 5,faq:'Q09',resolved:0},
    {id:6,pattern:'정기 구독 해지',     count: 5,faq:'Q02',resolved:0},
    {id:7,pattern:'민감성 피부 추천',   count: 4,faq:'Q33',resolved:0},
    {id:8,pattern:'재입고 알림 신청',   count: 4,faq:'신규',resolved:0},
    {id:9,pattern:'샘플 증정 기준',     count: 3,faq:'Q36',resolved:0},
    {id:10,pattern:'첫구매+VIP 중복',  count: 3,faq:'Q05',resolved:0},
  ];
}

// ══════════════════════════════════════════════
// 대시보드 API 라우터
// ══════════════════════════════════════════════

// GET /admin/api/dashboard
app.get('/admin/api/dashboard', async (req, res) => {
  try {
    // 챗봇 서버 health/engine 프록시 시도 → 실패 시 시뮬레이션
    let engine = { mode:'TF-IDF (인메모리)', docCount: faqStore.length + POLICY_DATA.length, vocabSize:0, initialized:true };
    try { engine = await proxyGet('/admin/engine'); } catch(_) {}

    const stats  = getSimStats();
    const top10  = getSimTop10();
    const avgScore = evaluations.reduce((s,e)=>s+e.score,0) / evaluations.length;

    res.json({
      kpi: {
        totalMessages: stats.totalMessages,
        resolveRate:   stats.resolveRate,
        nps:           44,
        avgScore:      avgScore.toFixed(1),
        kbCount:       faqStore.length + POLICY_DATA.length,
        escalated:     stats.escalated,
      },
      engine,
      recentTop5:  top10.slice(0,5),
      recentEvals: evaluations.slice(-3).reverse(),
      pipeline:    getPipelineStatus(engine),
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

function getPipelineStatus(engine) {
  return {
    p1: { score:4.5, max:8, d:1.0, r:1.0, t:1.5, l:1.0 },
    p2: { accuracy:81, hallucination:5, sourceRate:80, mode:engine?.mode||'TF-IDF', vocabSize:engine?.vocabSize||0, docCount:engine?.docCount||faqStore.length },
    p3: { situations:12, tones:3, toneRatio:{ empathy:62, reject:23, escalate:15 } },
    p4: { top10Done:4, top10Total:10, nextMeeting:'2026-06-03 14:00' },
    p5: { ok:4, warn:2, alert:0, cosmLawItems:4 },
  };
}

// GET /admin/api/stats
app.get('/admin/api/stats', async (req, res) => {
  try {
    // 챗봇 서버 프록시 시도
    try { return res.json({ ...getSimStats(), ...await proxyGet('/admin/stats') }); } catch(_) {}
    res.json(getSimStats());
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /admin/api/engine
app.get('/admin/api/engine', async (req, res) => {
  try {
    const sim = getSimStats();
    let engine = { mode:'TF-IDF (인메모리)', docCount:faqStore.length, vocabSize:844, chromaStatus:'offline', avgResponseMs:4.2, cacheHitRate:'34%' };
    try { engine = { ...engine, ...await proxyGet('/admin/engine') }; } catch(_) {}
    res.json({ ...engine, trapBlocked:sim.trapBlocked, piiMasked:sim.piiMasked });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /admin/api/pipeline
app.get('/admin/api/pipeline', async (req, res) => {
  let engine = {};
  try { engine = await proxyGet('/admin/engine'); } catch(_) {}
  res.json(getPipelineStatus(engine));
});

// GET /admin/api/top10
app.get('/admin/api/top10', async (req, res) => {
  const days = parseInt(req.query.days) || 30;
  try {
    const d = await proxyGet(`/admin/top10?days=${days}`);
    return res.json(d);
  } catch(_) {}
  const data = getSimTop10();
  res.json({ period:`최근 ${days}일`, count:data.length, patterns:data });
});

// PATCH /admin/api/top10/:id
app.patch('/admin/api/top10/:id', async (req, res) => {
  try { await proxyPatch(`/admin/top10/${req.params.id}/resolve`); } catch(_) {}
  res.json({ result:'ok', id:req.params.id });
});

// GET /admin/api/faq
app.get('/admin/api/faq', (req, res) => {
  const { cat='', q='', page=1, limit=20 } = req.query;
  let data = [...faqStore];
  if (cat) data = data.filter(f=>f.category===cat);
  if (q)   data = data.filter(f=>f.question.includes(q)||f.answer.includes(q)||(f.keywords||[]).some(k=>k.includes(q)));
  const total = data.length;
  const start = (parseInt(page)-1)*parseInt(limit);
  res.json({ total, page:parseInt(page), limit:parseInt(limit), data:data.slice(start,start+parseInt(limit)) });
});

// POST /admin/api/faq
app.post('/admin/api/faq', (req, res) => {
  const { category, question, answer, keywords=[], law, escalate=false, sensitive=false } = req.body;
  if (!category||!question||!answer) return res.status(400).json({ error:'분류·질문·답변은 필수입니다.' });
  const newId = 'Q' + String(faqStore.length + 51).padStart(2,'0');
  const item  = { id:newId, category, question, answer, keywords:Array.isArray(keywords)?keywords:keywords.split(',').map(k=>k.trim()), law:law||null, escalate:Boolean(escalate), sensitive:Boolean(sensitive), updatedAt:new Date().toISOString().slice(0,10) };
  faqStore.push(item);
  res.status(201).json(item);
});

// PUT /admin/api/faq/:id
app.put('/admin/api/faq/:id', (req, res) => {
  const idx = faqStore.findIndex(f=>f.id===req.params.id);
  if (idx<0) return res.status(404).json({ error:'항목 없음' });
  const { category, question, answer, keywords, law, escalate, sensitive } = req.body;
  faqStore[idx] = { ...faqStore[idx],
    ...(category!==undefined&&{category}), ...(question!==undefined&&{question}),
    ...(answer  !==undefined&&{answer}),   ...(keywords !==undefined&&{keywords:Array.isArray(keywords)?keywords:keywords.split(',').map(k=>k.trim())}),
    ...(law     !==undefined&&{law}),      ...(escalate !==undefined&&{escalate:Boolean(escalate)}),
    ...(sensitive!==undefined&&{sensitive:Boolean(sensitive)}),
    updatedAt: new Date().toISOString().slice(0,10),
  };
  res.json(faqStore[idx]);
});

// DELETE /admin/api/faq/:id
app.delete('/admin/api/faq/:id', (req, res) => {
  const idx = faqStore.findIndex(f=>f.id===req.params.id);
  if (idx<0) return res.status(404).json({ error:'항목 없음' });
  faqStore.splice(idx,1);
  res.json({ result:'ok' });
});

// POST /admin/api/faq/reindex
app.post('/admin/api/faq/reindex', (req, res) => {
  res.json({ result:'ok', message:'재인덱싱 요청 전달 — 챗봇 서버(3000) 재시작 필요', docCount:faqStore.length });
});

// GET /admin/api/compliance
app.get('/admin/api/compliance', (req, res) => {
  res.json({
    items: [
      {id:1,name:'개인정보 마스킹',  status:'ok',  law:'개인정보보호법',    detail:'TrapValidator PII 패턴 자동 마스킹 적용중', faq:'Q44'},
      {id:2,name:'환불 7일 룰',     status:'ok',  law:'전자상거래법 §17',  detail:'FAQ Q13·Q15 기반 정확 안내 운영중', faq:'Q13·Q15'},
      {id:3,name:'마케팅 동의',     status:'warn',law:'정보통신망법 §50',  detail:'동의 절차 도입 진행중 (2026.06 완료 목표)', faq:'-', dueDate:'2026-06-30'},
      {id:4,name:'외국 사용자',     status:'ok',  law:'GDPR (추후)',       detail:'현재 국내 고객만 서비스', faq:'Q06'},
      {id:5,name:'응답 로그 보관',  status:'warn',law:'전자상거래법 §6',   detail:'SQLite 아카이빙 도입중 (2026.06 완료 목표)', faq:'Q44', dueDate:'2026-06-30'},
      {id:6,name:'미성년자 룰',     status:'ok',  law:'개인정보보호법 §22',detail:'FAQ Q45 기반 구축 완료', faq:'Q45'},
    ],
    cosmLaw: [
      {article:'화장품법 제5조',        desc:'부작용 신고 포털 안내 KB 반영',       faq:'Q41',     status:'ok'},
      {article:'화장품법 제15조의2',    desc:'리콜·회수 식품안전나라 안내',         faq:'Q42',     status:'ok'},
      {article:'화장품법 제10조 제1항', desc:'전성분 표시 안내 KB 반영',             faq:'Q21·Q24', status:'ok'},
      {article:'화장품법 제2조 제2호',  desc:'기능성 화장품 정의·효능 단정 금지',  faq:'Q22',     status:'ok'},
    ],
    coso: {
      operations:  {status:'ok',   label:'양호',    detail:'정확도 81% · 톤 일관성 양호'},
      strategic:   {status:'warn', label:'부분구축', detail:'KB 갱신 40% · 카카오톡 준비중'},
      compliance:  {status:'alert',label:'요주의',   detail:'즉시 시정 2건 이월'},
      reporting:   {status:'alert',label:'미흡',     detail:'NPS 미측정 · 고객 관점 데이터 공백'},
    },
  });
});

// GET /admin/api/evaluation
app.get('/admin/api/evaluation', (req, res) => {
  const total    = evaluations.length;
  const avgScore = total ? (evaluations.reduce((s,e)=>s+e.score,0)/total).toFixed(1) : 0;
  const positive = evaluations.filter(e=>e.score>=4).length;
  const neutral  = evaluations.filter(e=>e.score===3).length;
  const negative = evaluations.filter(e=>e.score<=2).length;
  res.json({
    summary: { total, avgScore, nps:44,
      positive:Math.round(positive/total*100),
      neutral: Math.round(neutral /total*100),
      negative:Math.round(negative/total*100),
    },
    criteria: { accuracy:4.2, speed:4.6, naturalness:3.9, resolution:3.7, escalate:4.1 },
    list: evaluations.slice().reverse(),
  });
});

// POST /admin/api/evaluation
app.post('/admin/api/evaluation', (req, res) => {
  const { userId, userName, score, category, situation, source, comment, channel } = req.body;
  if (!score) return res.status(400).json({ error:'score 필요' });
  const item = { id:evaluations.length+1, userId:userId||'anonymous', userName:userName||'익명',
    score:parseInt(score), category:category||'기타', situation:situation||'정상_응답',
    source:source||'', comment:comment||'', channel:channel||'kakao',
    createdAt: new Date().toISOString() };
  evaluations.push(item);
  res.status(201).json(item);
});

// POST /admin/api/chat/test — 챗봇 서버 /admin/chat 프록시
app.post('/admin/api/chat/test', async (req, res) => {
  const { input, userName='관리자', channel='email' } = req.body;
  if (!input) return res.status(400).json({ error:'input 필요' });
  try {
    const result = await proxyPost('/admin/chat', { input, userName, channel });
    return res.json(result);
  } catch(_) {
    res.status(503).json({ error: '챗봇 서버(포트 3000)가 실행되지 않았습니다. node src/api/server.js 를 먼저 시작해주세요.' });
  }
});

// GET /admin/api/logs
app.get('/admin/api/logs', async (req, res) => {
  const logs = [
    {id:1,channel:'kakao',input:'환불 가능한가요?',     situation:'정상_응답',   score:0.85,resolved:1,source:'FAQ §Q13',createdAt:new Date(Date.now()-5*60000).toISOString()},
    {id:2,channel:'email',input:'배송 며칠 걸려요?',    situation:'정상_응답',   score:0.82,resolved:1,source:'FAQ §Q07',createdAt:new Date(Date.now()-12*60000).toISOString()},
    {id:3,channel:'kakao',input:'피부 발진 났어요',      situation:'피부_부작용', score:0.91,resolved:1,source:'FAQ §Q29',createdAt:new Date(Date.now()-18*60000).toISOString()},
    {id:4,channel:'kakao',input:'리콜 제품 확인해주세요',situation:'리콜_정품',   score:0.78,resolved:1,source:'FAQ §Q42',createdAt:new Date(Date.now()-25*60000).toISOString()},
    {id:5,channel:'email',input:'임산부도 써도 되나요',  situation:'임산부_미성년',score:0.88,resolved:1,source:'FAQ §Q25',createdAt:new Date(Date.now()-40*60000).toISOString()},
    {id:6,channel:'kakao',input:'화가 너무 나요',        situation:'감정_격화',   score:0.0, resolved:0,source:null,       createdAt:new Date(Date.now()-55*60000).toISOString()},
    {id:7,channel:'email',input:'재입고 알림 어떻게 해요',situation:'정보_부재',  score:0.03,resolved:0,source:null,       createdAt:new Date(Date.now()-70*60000).toISOString()},
  ];
  res.json({ count:logs.length, logs });
});

// ── 서버 시작 ──
app.listen(DASHBOARD_PORT, () => {
  console.log('');
  console.log('📊 JHC Honey 관리자 대시보드 서버 시작');
  console.log(`   포트:          ${DASHBOARD_PORT}`);
  console.log(`   대시보드:      http://localhost:${DASHBOARD_PORT}/admin`);
  console.log(`   챗봇 API 연결: ${CHATBOT_API_URL}`);
  console.log('');
  console.log('★ 기존 챗봇 시스템(server.js) 무수정 유지 ★');
  console.log('');
});

module.exports = app;
