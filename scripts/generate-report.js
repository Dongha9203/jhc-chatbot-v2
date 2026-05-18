'use strict';

/**
 * P4 폐곡선 월간 SOP — 미해결 Top10 리포트 생성
 * 실행: node scripts/generate-report.js
 */

require('../config/settings'); // .env 로드
const { logManager } = require('../src/loop/log-manager');

function main() {
  const stats = logManager.getMonthlyStats();
  const top10 = stats.top10Unresolved;

  console.log('\n' + '='.repeat(60));
  console.log('JHC Honey CS 챗봇 — 월간 폐곡선 리포트');
  console.log('P4 미해결 Top10 분석 (KB 갱신 트리거)');
  console.log('='.repeat(60));

  console.log(`\n📊 운영 현황 (${stats.period})`);
  console.log(`  총 대화: ${stats.totalMessages}건`);
  console.log(`  해결: ${stats.resolved}건`);
  console.log(`  미해결: ${stats.unresolved}건`);
  console.log(`  에스컬: ${stats.escalated}건`);
  console.log(`  해결률: ${stats.resolveRate}`);

  console.log('\n🔴 미해결 Top10 (KB 갱신 대상)');
  console.log('-'.repeat(60));

  if (top10.length === 0) {
    console.log('  미해결 패턴 없음 — KB 커버리지 우수!');
  } else {
    top10.forEach((item, i) => {
      const type = item.count >= 10 ? '[유형1-정책부재]' : item.count >= 5 ? '[유형2-KB미흡]' : '[유형4-신규]';
      console.log(`\n  ${i + 1}. ${type}`);
      console.log(`     패턴: "${item.pattern}"`);
      console.log(`     발생: ${item.count}회 | 최근: ${item.last_seen}`);
      console.log(`     KB 갱신 액션: NotebookLM에 관련 FAQ §추가 권장`);
    });
  }

  console.log('\n📅 월간 SOP 일정');
  console.log('  매월 첫째 주 화요일 14:00~15:30 (90분)');
  console.log('  참석: CS 팀장 + KB 분석 담당자');
  console.log('  Agenda:');
  console.log('    1. 본 리포트 검토 (15분)');
  console.log('    2. KB 갱신 우선순위 확정 (30분)');
  console.log('    3. ChromaDB 재인덱싱 (20분)');
  console.log('    4. 다음 달 KPI 확정 (10분)');

  console.log('\n✅ Argyris Double-Loop 전환 체크');
  const resolveRate = parseFloat(stats.resolveRate);
  if (resolveRate >= 80) {
    console.log('  🟢 Double-Loop 작동 중 — KB 갱신 + NPS 동시 개선');
  } else if (resolveRate >= 60) {
    console.log('  🟡 Single-Loop 전환 중 — KB 갱신 가속 필요');
  } else {
    console.log('  🔴 Single-Loop 회귀 주의 — Top10 즉시 KB 반영 필요');
  }

  console.log('\n' + '='.repeat(60));

  logManager.close();
}

main();
