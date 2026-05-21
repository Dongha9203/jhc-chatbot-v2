'use strict';

/**
 * P4 폐곡선 — 대화 로그 관리 (Supabase JS client, HTTPS)
 * pg 직접 연결 대신 @supabase/supabase-js 사용 → Render 무료 플랜 IPv4 호환
 */

const { createClient } = require('@supabase/supabase-js');
const { logger } = require('../utils/logger');

class LogManager {
  constructor() {
    this.client = null;
    this._init();
  }

  _init() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      logger.warn('SUPABASE_URL/SERVICE_ROLE_KEY 미설정 — DB 로그 비활성화');
      return;
    }
    this.client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    logger.info('Supabase 클라이언트 초기화 완료');
  }

  // ── 로그 저장 ──
  async save({ userId, channel, input, response, situation, searchScore, resolved, source, escalated, category }) {
    if (!this.client) return;
    try {
      const { data, error } = await this.client
        .from('chat_logs')
        .insert({
          user_id:      userId,
          channel,
          input,
          response,
          situation,
          search_score: searchScore || 0,
          resolved:     resolved  ? 1 : 0,
          source:       source   || '',
          escalated:    escalated ? 1 : 0,
          category:     category || null,
        })
        .select('id')
        .single();

      if (error) throw error;

      if (!resolved) await this._aggregateUnresolved(input);

      const autoScore = escalated ? 3 : (resolved ? 5 : 4);
      await this.saveEvaluation({
        logId: data?.id, userId, channel,
        score: autoScore, situation, source,
      });
    } catch (err) {
      logger.error('로그 저장 오류', err);
    }
  }

  // ── 미해결 패턴 집계 (atomic upsert via RPC) ──
  async _aggregateUnresolved(input) {
    const key = input.substring(0, 50).trim();
    const { error } = await this.client.rpc('increment_unresolved_pattern', { pattern_key: key });
    if (error) logger.error('미해결 패턴 집계 오류', error);
  }

  // ── 미해결 Top10 조회 ──
  async getUnresolvedTop10(days = 30) {
    if (!this.client) return [];
    try {
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await this.client
        .from('unresolved_patterns')
        .select('pattern, count, first_seen, last_seen')
        .eq('resolved', 0)
        .gte('last_seen', since)
        .order('count', { ascending: false })
        .limit(10);
      if (error) throw error;
      return data || [];
    } catch (err) {
      logger.error('Top10 조회 오류', err);
      return [];
    }
  }

  // ── 월간 통계 (RPC 단일 호출) ──
  async getMonthlyStats() {
    if (!this.client) return null;
    try {
      const [statsRes, top10] = await Promise.all([
        this.client.rpc('get_monthly_stats'),
        this.getUnresolvedTop10(),
      ]);

      if (statsRes.error) throw statsRes.error;
      const s = statsRes.data;

      return {
        period:          '최근 30일',
        totalMessages:   s.total,
        resolved:        s.resolved,
        unresolved:      s.total - s.resolved,
        escalated:       s.escalated,
        resolveRate:     s.total ? ((s.resolved / s.total) * 100).toFixed(1) + '%' : '0%',
        byChannel:       s.byChannel    || [],
        bySituation:     s.bySituation  || [],
        byHour:          s.byHour       || [],
        monthly:         s.monthly      || [],
        top10Unresolved: top10,
      };
    } catch (err) {
      logger.error('월간 통계 오류', err);
      return null;
    }
  }

  // ── 평가 저장 ──
  async saveEvaluation({ logId, userId, userName, channel, score, category, situation, source, comment }) {
    if (!this.client) return;
    try {
      const { error } = await this.client.from('evaluations').insert({
        log_id:    logId    || null,
        user_id:   userId   || 'anonymous',
        user_name: userName || '고객',
        channel:   channel  || 'kakao',
        score:     score    || 3,
        category:  category || null,
        situation: situation || null,
        source:    source    || '',
        comment:   comment   || '',
      });
      if (error) throw error;
    } catch (err) {
      logger.error('평가 저장 오류', err);
    }
  }

  // ── 평가 조회 ──
  async getEvaluations({ limit = 50, offset = 0 } = {}) {
    if (!this.client) return { rows: [], total: 0, summary: null };
    try {
      const lim = Math.min(limit, 200);
      const [rowsRes, countRes, summaryRes] = await Promise.all([
        this.client.from('evaluations').select('*').order('created_at', { ascending: false }).range(offset, offset + lim - 1),
        this.client.from('evaluations').select('*', { count: 'exact', head: true }),
        this.client.rpc('get_eval_summary'),
      ]);
      if (rowsRes.error)  throw rowsRes.error;
      if (countRes.error) throw countRes.error;

      return {
        rows:    rowsRes.data || [],
        total:   countRes.count || 0,
        summary: summaryRes.data || null,
      };
    } catch (err) {
      logger.error('평가 조회 오류', err);
      return { rows: [], total: 0, summary: null };
    }
  }

  // ── 최근 로그 조회 ──
  async getLogs({ limit = 50, offset = 0, channel } = {}) {
    if (!this.client) return { rows: [], total: 0 };
    try {
      const lim = Math.min(limit, 200);
      let query      = this.client.from('chat_logs').select('*').order('created_at', { ascending: false }).range(offset, offset + lim - 1);
      let countQuery = this.client.from('chat_logs').select('*', { count: 'exact', head: true });
      if (channel) {
        query      = query.eq('channel', channel);
        countQuery = countQuery.eq('channel', channel);
      }
      const [rowsRes, countRes] = await Promise.all([query, countQuery]);
      if (rowsRes.error)  throw rowsRes.error;
      if (countRes.error) throw countRes.error;
      return { rows: rowsRes.data || [], total: countRes.count || 0 };
    } catch (err) {
      logger.error('로그 조회 오류', err);
      return { rows: [], total: 0 };
    }
  }

  // ── 미해결 패턴 해결 표시 ──
  async markResolved(patternId) {
    if (!this.client) return;
    const { error } = await this.client
      .from('unresolved_patterns')
      .update({ resolved: 1 })
      .eq('id', patternId);
    if (error) logger.error('패턴 해결 표시 오류', error);
  }

  close() {
    // Supabase JS client has no persistent connection to close
  }
}

const logManager = new LogManager();
module.exports = { logManager, LogManager };
