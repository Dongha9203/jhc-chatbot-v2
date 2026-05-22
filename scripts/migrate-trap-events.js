'use strict';

/**
 * Supabase trap_events 테이블 생성 마이그레이션
 * 실행: node scripts/migrate-trap-events.js
 */

require('dotenv').config({ path: './config/.env' });
const { createClient } = require('@supabase/supabase-js');

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 미설정');
  process.exit(1);
}

const client = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function migrate() {
  console.log('trap_events 테이블 생성 중...');

  const sql = `
    CREATE TABLE IF NOT EXISTS trap_events (
      id         BIGSERIAL PRIMARY KEY,
      trap_type  TEXT        NOT NULL,
      log_id     BIGINT      REFERENCES chat_logs(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_trap_events_type ON trap_events(trap_type);
    CREATE INDEX IF NOT EXISTS idx_trap_events_date ON trap_events(created_at DESC);
  `;

  const { error } = await client.rpc('exec_sql', { sql });

  if (error) {
    // exec_sql RPC 없을 경우 — Supabase 대시보드 SQL 에디터에서 직접 실행 안내
    console.warn('RPC exec_sql 없음 — Supabase SQL 에디터에서 아래 SQL을 직접 실행하세요:\n');
    console.log(sql);
    console.log('\n👉 https://supabase.com/dashboard → SQL Editor');
    process.exit(0);
  }

  console.log('✅ trap_events 테이블 생성 완료');
  process.exit(0);
}

migrate().catch(e => { console.error(e); process.exit(1); });
