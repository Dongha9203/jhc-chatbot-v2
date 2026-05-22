'use strict';
require('dotenv').config({ path: './config/.env' });

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function reloadSchema() {
  // Supabase Management API — schema reload
  const projectRef = url.replace('https://', '').replace('.supabase.co', '');
  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/postgrest/reload`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
  });
  if (res.ok) {
    console.log('✅ PostgREST 스키마 캐시 리로드 완료');
    return;
  }
  // 대안: REST API HEAD 요청으로 캐시 갱신 유도
  const res2 = await fetch(`${url}/rest/v1/trap_events?limit=1`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
  });
  const body = await res2.text();
  console.log('trap_events 접근 테스트 →', res2.status, body.substring(0, 100));
}

reloadSchema().catch(e => { console.error(e.message); process.exit(1); });
