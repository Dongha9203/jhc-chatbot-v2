'use strict';

// Render 무료 플랜은 IPv6 아웃바운드 미지원 → Supabase 연결 시 ENETUNREACH 방지
require('dns').setDefaultResultOrder('ipv4first');

/**
 * JHC Honey 챗봇 v2 — 메인 진입점
 *
 * 실행 모드:
 *   npm start          → Express API 서버 (카카오 Webhook)
 *   npm run dev        → 서버 (watch 모드)
 *   npm run chat       → CLI 대화 테스트 (터미널 직접 대화)
 */

const args = process.argv.slice(2);
const mode = args.find(a => a.startsWith('--mode='))?.split('=')[1] || 'server';

if (mode === 'cli') {
  // ── CLI 대화 테스트 모드 ──
  startCLI();
} else {
  // ── 서버 모드 (기본) ──
  require('./api/server');
}

// ─────────────────────────────────────
// CLI 대화 테스트
// ─────────────────────────────────────
async function startCLI() {
  const readline      = require('readline');
  const { chatPipeline } = require('./engine/chat-pipeline');
  const settings         = require('../config/settings');

  console.log('\n' + '='.repeat(55));
  console.log(`  🍯 ${settings.persona.name} CS 챗봇 CLI 테스트`);
  console.log(`  ${settings.persona.company}`);
  console.log('  종료: Ctrl+C 또는 "exit" 입력');
  console.log('='.repeat(55));
  console.log(settings.persona.greeting);
  console.log('');

  // 검색 엔진 초기화
  process.stdout.write('KB 로딩 중...');
  await chatPipeline.init();
  console.log(' 완료!\n');

  const rl = readline.createInterface({
    input:  process.stdin,
    output: process.stdout,
    prompt: '고객 > ',
  });

  rl.prompt();

  rl.on('line', async (line) => {
    const input = line.trim();

    if (!input) { rl.prompt(); return; }
    if (input.toLowerCase() === 'exit') {
      console.log('\n🍯 Honey: 이용해 주셔서 감사해요! 💚\n');
      process.exit(0);
    }

    // 특수 명령어
    if (input === '/stats') {
      const { searchEngine } = require('./engine/tfidf-search');
      console.log('\n[검색 엔진 통계]', searchEngine.getStats(), '\n');
      rl.prompt(); return;
    }
    if (input === '/help') {
      console.log('\n[명령어] /stats — 엔진 통계 | /report — 미해결 Top10 | exit — 종료\n');
      rl.prompt(); return;
    }
    if (input === '/report') {
      const { logManager } = require('./loop/log-manager');
      const top10 = logManager.getUnresolvedTop10();
      console.log('\n[미해결 Top10]');
      top10.forEach((t, i) => console.log(`  ${i+1}. "${t.pattern}" — ${t.count}회`));
      console.log('');
      rl.prompt(); return;
    }

    try {
      const result = await chatPipeline.process({
        input,
        userId:   'cli_user',
        userName: '테스트',
        channel:  'email',
        history:  [],
      });

      console.log(`\n🍯 Honey: ${result.response}`);
      if (result.source) console.log(`   📎 ${result.source}`);
      console.log(`   [${result.situation} | 점수: ${result.searchScore?.toFixed(3)} | ${result.resolved ? '✅해결' : '❌미해결'} | ${result.elapsed}ms]`);
      console.log('');
    } catch (err) {
      console.error('오류:', err.message);
    }

    rl.prompt();
  });

  rl.on('close', () => {
    console.log('\n종료합니다.\n');
    process.exit(0);
  });
}
