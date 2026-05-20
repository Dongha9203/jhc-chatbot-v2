'use strict';

/**
 * P4 폐곡선 — 대화 로그 관리 (SQLite 무료)
 * 미해결 Top10 자동 집계 → KB 갱신 트리거
 */

const { Database } = require('node-sqlite3-wasm');
const settings  = require('../../config/settings');
const { logger } = require('../utils/logger');
const fs        = require('fs');
const path      = require('path');

class LogManager {
  constructor() {
    const dir = path.dirname(settings.sqlite.path);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    this.db = new Database(settings.sqlite.path);
    this._initSchema();
  }

  _initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS chat_logs (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at  TEXT    DEFAULT (datetime('now','localtime')),
        user_id     TEXT    NOT NULL,
        channel     TEXT    NOT NULL DEFAULT 'kakao',
        input       TEXT    NOT NULL,
        response    TEXT,
        situation   TEXT,
        search_score REAL   DEFAULT 0,
        resolved    INTEGER DEFAULT 0,
        source      TEXT,
        escalated   INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS unresolved_patterns (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        pattern     TEXT    NOT NULL,
        count       INTEGER DEFAULT 1,
        category    TEXT,
        first_seen  TEXT    DEFAULT (datetime('now','localtime')),
        last_seen   TEXT    DEFAULT (datetime('now','localtime')),
        resolved    INTEGER DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_logs_created ON chat_logs(created_at);
      CREATE INDEX IF NOT EXISTS idx_logs_resolved ON chat_logs(resolved);
      CREATE INDEX IF NOT EXISTS idx_unresolved_count ON unresolved_patterns(count DESC);
    `);
    logger.info('SQLite DB 초기화 완료');
  }

  // ── 로그 저장 ──
  async save({ userId, channel, input, response, situation, searchScore, resolved, source, escalated }) {
    try {
      this.db.prepare(`
        INSERT INTO chat_logs (user_id, channel, input, response, situation, search_score, resolved, source, escalated)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run([userId, channel, input, response, situation, searchScore || 0, resolved ? 1 : 0, source || '', escalated ? 1 : 0]);

      // 미해결 패턴 집계
      if (!resolved) {
        this._aggregateUnresolved(input);
      }
    } catch (err) {
      logger.error('로그 저장 오류', err);
    }
  }

  // ── 미해결 패턴 집계 ──
  _aggregateUnresolved(input) {
    const key = input.substring(0, 50).trim();
    const existing = this.db.prepare(
      'SELECT id, count FROM unresolved_patterns WHERE pattern = ?'
    ).get([key]);

    if (existing) {
      this.db.prepare(
        'UPDATE unresolved_patterns SET count = count + 1, last_seen = datetime("now","localtime") WHERE id = ?'
      ).run([existing.id]);
    } else {
      this.db.prepare(
        'INSERT INTO unresolved_patterns (pattern) VALUES (?)'
      ).run([key]);
    }
  }

  // ── 미해결 Top10 조회 (월간 폐곡선 SOP) ──
  getUnresolvedTop10(days = 30) {
    return this.db.prepare(`
      SELECT pattern, count, first_seen, last_seen
      FROM unresolved_patterns
      WHERE resolved = 0
        AND last_seen >= datetime('now', '-${days} days', 'localtime')
      ORDER BY count DESC
      LIMIT 10
    `).all();
  }

  // ── 월간 통계 ──
  getMonthlyStats() {
    const total     = this.db.prepare("SELECT COUNT(*) as c FROM chat_logs WHERE created_at >= datetime('now','-30 days','localtime')").get();
    const resolved  = this.db.prepare("SELECT COUNT(*) as c FROM chat_logs WHERE resolved=1 AND created_at >= datetime('now','-30 days','localtime')").get();
    const escalated = this.db.prepare("SELECT COUNT(*) as c FROM chat_logs WHERE escalated=1 AND created_at >= datetime('now','-30 days','localtime')").get();
    const byChannel = this.db.prepare("SELECT channel, COUNT(*) as c FROM chat_logs WHERE created_at >= datetime('now','-30 days','localtime') GROUP BY channel").all();

    return {
      period:        '최근 30일',
      totalMessages: total.c,
      resolved:      resolved.c,
      unresolved:    total.c - resolved.c,
      escalated:     escalated.c,
      resolveRate:   total.c ? ((resolved.c / total.c) * 100).toFixed(1) + '%' : '0%',
      byChannel,
      top10Unresolved: this.getUnresolvedTop10(),
    };
  }

  // ── 미해결 패턴 해결 표시 ──
  markResolved(patternId) {
    this.db.prepare('UPDATE unresolved_patterns SET resolved = 1 WHERE id = ?').run(patternId);
  }

  close() {
    this.db.close();
  }
}

const logManager = new LogManager();
module.exports = { logManager, LogManager };
