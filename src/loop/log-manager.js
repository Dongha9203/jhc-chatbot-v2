'use strict';

/**
 * P4 폐곡선 — 대화 로그 관리 (Supabase PostgreSQL)
 * 미해결 Top10 자동 집계 → KB 갱신 트리거
 */

const { Pool }   = require('pg');
const { logger } = require('../utils/logger');

class LogManager {
  constructor() {
    this.pool = null;
    this._init();
  }

  _init() {
    const url = process.env.DATABASE_URL;
    if (!url) {
      logger.warn('DATABASE_URL 미설정 — PostgreSQL 로그 비활성화');
      return;
    }
    this.pool = new Pool({
      connectionString: url,
      ssl: { rejectUnauthorized: false },
      max: 5,
      idleTimeoutMillis: 30000,
    });
    this.pool.on('error', err => logger.error('PostgreSQL 풀 오류', err));
    logger.info('PostgreSQL 연결 풀 초기화 완료');
  }

  // ── 로그 저장 ──
  async save({ userId, channel, input, response, situation, searchScore, resolved, source, escalated }) {
    if (!this.pool) return;
    try {
      const { rows } = await this.pool.query(
        `INSERT INTO chat_logs
           (user_id, channel, input, response, situation, search_score, resolved, source, escalated)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         RETURNING id`,
        [userId, channel, input, response, situation,
         searchScore || 0, resolved ? 1 : 0, source || '', escalated ? 1 : 0]
      );
      if (!resolved) await this._aggregateUnresolved(input);
      // 대화 결과 기반 자동 평가 저장 (에스컬=3, 미해결=4, 해결=5)
      const autoScore = escalated ? 3 : (resolved ? 5 : 4);
      await this.saveEvaluation({
        logId: rows[0]?.id, userId, channel,
        score: autoScore, situation, source,
      });
    } catch (err) {
      logger.error('로그 저장 오류', err);
    }
  }

  // ── 미해결 패턴 집계 ──
  async _aggregateUnresolved(input) {
    const key = input.substring(0, 50).trim();
    const { rows } = await this.pool.query(
      'SELECT id FROM unresolved_patterns WHERE pattern = $1', [key]
    );
    if (rows.length > 0) {
      await this.pool.query(
        'UPDATE unresolved_patterns SET count = count + 1, last_seen = NOW() WHERE id = $1',
        [rows[0].id]
      );
    } else {
      await this.pool.query(
        'INSERT INTO unresolved_patterns (pattern) VALUES ($1)', [key]
      );
    }
  }

  // ── 미해결 Top10 조회 ──
  async getUnresolvedTop10(days = 30) {
    if (!this.pool) return [];
    try {
      const { rows } = await this.pool.query(
        `SELECT pattern, count, first_seen, last_seen
         FROM unresolved_patterns
         WHERE resolved = 0
           AND last_seen >= NOW() - ($1 || ' days')::INTERVAL
         ORDER BY count DESC
         LIMIT 10`,
        [days]
      );
      return rows;
    } catch (err) {
      logger.error('Top10 조회 오류', err);
      return [];
    }
  }

  // ── 월간 통계 ──
  async getMonthlyStats() {
    if (!this.pool) return null;
    try {
      const [total, resolved, escalated, byChannel, bySituation, byHour, monthly, top10] = await Promise.all([
        this.pool.query("SELECT COUNT(*)::int AS c FROM chat_logs WHERE created_at >= NOW() - INTERVAL '30 days'"),
        this.pool.query("SELECT COUNT(*)::int AS c FROM chat_logs WHERE resolved=1 AND created_at >= NOW() - INTERVAL '30 days'"),
        this.pool.query("SELECT COUNT(*)::int AS c FROM chat_logs WHERE escalated=1 AND created_at >= NOW() - INTERVAL '30 days'"),
        this.pool.query("SELECT channel, COUNT(*)::int AS c FROM chat_logs WHERE created_at >= NOW() - INTERVAL '30 days' GROUP BY channel"),
        this.pool.query("SELECT situation, COUNT(*)::int AS count FROM chat_logs WHERE situation IS NOT NULL AND created_at >= NOW() - INTERVAL '30 days' GROUP BY situation ORDER BY count DESC"),
        this.pool.query("SELECT EXTRACT(HOUR FROM created_at AT TIME ZONE 'Asia/Seoul')::int AS hour, COUNT(*)::int AS count FROM chat_logs WHERE created_at >= NOW() - INTERVAL '30 days' GROUP BY hour ORDER BY hour"),
        this.pool.query("SELECT TO_CHAR(DATE_TRUNC('month', created_at AT TIME ZONE 'Asia/Seoul'), 'MM월') AS month, COUNT(*)::int AS total, COUNT(CASE WHEN resolved=1 THEN 1 END)::int AS resolved FROM chat_logs GROUP BY DATE_TRUNC('month', created_at AT TIME ZONE 'Asia/Seoul') ORDER BY DATE_TRUNC('month', created_at AT TIME ZONE 'Asia/Seoul')"),
        this.getUnresolvedTop10(),
      ]);
      const t = total.rows[0].c;
      const r = resolved.rows[0].c;
      return {
        period:          '최근 30일',
        totalMessages:   t,
        resolved:        r,
        unresolved:      t - r,
        escalated:       escalated.rows[0].c,
        resolveRate:     t ? ((r / t) * 100).toFixed(1) + '%' : '0%',
        byChannel:       byChannel.rows,
        bySituation:     bySituation.rows,
        byHour:          byHour.rows,
        monthly:         monthly.rows,
        top10Unresolved: top10,
      };
    } catch (err) {
      logger.error('월간 통계 오류', err);
      return null;
    }
  }

  // ── 평가 저장 ──
  async saveEvaluation({ logId, userId, userName, channel, score, category, situation, source, comment }) {
    if (!this.pool) return;
    try {
      await this.pool.query(
        `INSERT INTO evaluations (log_id, user_id, user_name, channel, score, category, situation, source, comment)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [logId || null, userId || 'anonymous', userName || '고객', channel || 'kakao',
         score || 3, category || null, situation || null, source || '', comment || '']
      );
    } catch (err) {
      logger.error('평가 저장 오류', err);
    }
  }

  // ── 평가 조회 ──
  async getEvaluations({ limit = 50, offset = 0 } = {}) {
    if (!this.pool) return { rows: [], total: 0, summary: null };
    try {
      const [rows, count, summary] = await Promise.all([
        this.pool.query('SELECT * FROM evaluations ORDER BY created_at DESC LIMIT $1 OFFSET $2', [Math.min(limit, 200), offset]),
        this.pool.query('SELECT COUNT(*)::int AS c FROM evaluations'),
        this.pool.query(`SELECT
          ROUND(AVG(score)::numeric, 1) AS avg_score,
          COUNT(CASE WHEN score>=4 THEN 1 END)::int AS positive,
          COUNT(CASE WHEN score=3  THEN 1 END)::int AS neutral,
          COUNT(CASE WHEN score<=2 THEN 1 END)::int AS negative
          FROM evaluations`),
      ]);
      return { rows: rows.rows, total: count.rows[0].c, summary: summary.rows[0] };
    } catch (err) {
      logger.error('평가 조회 오류', err);
      return { rows: [], total: 0, summary: null };
    }
  }

  // ── 최근 로그 조회 ──
  async getLogs({ limit = 50, offset = 0, channel } = {}) {
    if (!this.pool) return { rows: [], total: 0 };
    try {
      const params = [];
      let where = '';
      if (channel) { where = 'WHERE channel = $1'; params.push(channel); }

      const dataParams  = [...params, Math.min(limit, 200), offset];
      const lIdx = params.length + 1;
      const oIdx = params.length + 2;

      const [rows, count] = await Promise.all([
        this.pool.query(
          `SELECT * FROM chat_logs ${where} ORDER BY created_at DESC LIMIT $${lIdx} OFFSET $${oIdx}`,
          dataParams
        ),
        this.pool.query(`SELECT COUNT(*)::int AS c FROM chat_logs ${where}`, params),
      ]);
      return { rows: rows.rows, total: count.rows[0].c };
    } catch (err) {
      logger.error('로그 조회 오류', err);
      return { rows: [], total: 0 };
    }
  }

  // ── 미해결 패턴 해결 표시 ──
  async markResolved(patternId) {
    if (!this.pool) return;
    await this.pool.query('UPDATE unresolved_patterns SET resolved = 1 WHERE id = $1', [patternId]);
  }

  close() {
    if (this.pool) this.pool.end();
  }
}

const logManager = new LogManager();
module.exports = { logManager, LogManager };
