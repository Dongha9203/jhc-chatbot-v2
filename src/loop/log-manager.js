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
  async save({ userId, channel, input, response, situation, searchScore, resolved, source, escalated, category, issues }) {
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

      const logId = data?.id;
      if (!resolved) await this._aggregateUnresolved(input);
      if (issues?.length) await this.saveTrapEvents(issues, logId);

      const autoScore = escalated ? 3 : (resolved ? 5 : 4);
      await this.saveEvaluation({
        logId, userId, channel,
        score: autoScore, situation, source,
      });
    } catch (err) {
      logger.error('로그 저장 오류', err);
    }
  }

  // ── 함정 이벤트 저장 ──
  async saveTrapEvents(issues, logId) {
    if (!this.client || !issues?.length) return;
    const TRAP_TYPES = new Set(['TRAP1_HALLUCINATION','TRAP2_DEFINITE','TRAP3_SINGLE_ANSWER','COSM_LAW_VIOLATION','PII_MASKED','SECURITY']);
    const rows = issues
      .filter(i => TRAP_TYPES.has(i.type))
      .map(i => ({
        trap_type: i.type,
        log_id:    logId || null,
      }));
    if (!rows.length) return;
    const { error } = await this.client.from('trap_events').insert(rows);
    if (error) logger.error('함정 이벤트 저장 오류', error);
  }

  // ── 함정 차단 통계 조회 ──
  async getTrapStats(days = 30) {
    if (!this.client) return null;
    try {
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await this.client
        .from('trap_events')
        .select('trap_type')
        .gte('created_at', since);
      if (error) throw error;

      const counts = { trap1: 0, trap2: 0, trap3: 0, cosmLaw: 0, piiMasked: 0, security: 0 };
      for (const row of data || []) {
        if (row.trap_type === 'TRAP1_HALLUCINATION')  counts.trap1++;
        else if (row.trap_type === 'TRAP2_DEFINITE')       counts.trap2++;
        else if (row.trap_type === 'TRAP3_SINGLE_ANSWER')  counts.trap3++;
        else if (row.trap_type === 'COSM_LAW_VIOLATION')   counts.cosmLaw++;
        else if (row.trap_type === 'PII_MASKED')           counts.piiMasked++;
        else if (row.trap_type === 'SECURITY')             counts.security++;
      }
      return counts;
    } catch (err) {
      logger.error('함정 통계 조회 오류', err);
      return null;
    }
  }

  // ── 미해결 패턴 집계 (atomic upsert via RPC) ──
  async _aggregateUnresolved(input) {
    const key = input.substring(0, 50).trim();
    // 인코딩 깨진 입력(EUC-KR 혼입, U+FFFD 대체 문자) 저장 차단
    if (!key || key.includes('�') || key.includes('￾') || key.length < 2) return;
    const { error } = await this.client.rpc('increment_unresolved_pattern', { pattern_key: key });
    if (error) logger.error('미해결 패턴 집계 오류', error);
  }

  // ── 미해결 Top10 조회 (resolved=0 만) ──
  async getUnresolvedTop10(days = 30) {
    if (!this.client) return [];
    try {
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await this.client
        .from('unresolved_patterns')
        .select('id, pattern, count, first_seen, last_seen')
        .eq('resolved', 0)
        .gte('last_seen', since)
        .order('count', { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data || []).map(r => ({ ...r, resolved: 0 }));
    } catch (err) {
      logger.error('Top10 조회 오류', err);
      return [];
    }
  }

  // ── 전체 패턴 조회 (resolved 포함) ──
  async getAllPatterns(days = 30) {
    if (!this.client) return [];
    try {
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await this.client
        .from('unresolved_patterns')
        .select('id, pattern, count, first_seen, last_seen, resolved')
        .gte('last_seen', since)
        .order('count', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data || [];
    } catch (err) {
      logger.error('전체 패턴 조회 오류', err);
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
        byCategory:      s.byCategory   || [],
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

  // ── P4 top10 완료/전체 요약 ──
  async getTop10Summary(days = 30) {
    if (!this.client) return null;
    try {
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await this.client
        .from('unresolved_patterns')
        .select('resolved')
        .gte('last_seen', since);
      if (error) throw error;
      if (!data || data.length === 0) return { done: 0, total: 0 };
      return {
        done:  data.filter(r => r.resolved).length,
        total: data.length,
      };
    } catch (err) {
      logger.error('Top10 요약 오류', err);
      return null;
    }
  }

  // ── NPS 계산 (evaluations 기반) ──
  async getNps() {
    if (!this.client) return null;
    try {
      const { data: summaryData, error } = await this.client.rpc('get_eval_summary');
      if (error) throw error;
      const s = Array.isArray(summaryData) ? summaryData[0] : summaryData;
      if (!s) return null;
      const total = (s.positive || 0) + (s.neutral || 0) + (s.negative || 0);
      if (!total) return null;
      const nps = Math.round(((s.positive - s.negative) / total) * 100);
      return Math.max(-100, Math.min(100, nps));
    } catch (err) {
      logger.error('NPS 계산 오류', err);
      return null;
    }
  }

  // ── P2 정확도 집계 ──
  async getAccuracyStats(days = 30) {
    if (!this.client) return null;
    try {
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await this.client
        .from('chat_logs')
        .select('resolved, search_score')
        .gte('created_at', since);
      if (error) throw error;
      if (!data || data.length === 0) return null;

      const total      = data.length;
      const resolved   = data.filter(r => r.resolved).length;
      const accuracy   = Math.round(resolved / total * 100);
      const avgScore   = data.reduce((s, r) => s + (r.search_score || 0), 0) / total;
      const hallucination = Math.round(data.filter(r => !r.resolved && (r.search_score || 0) < 0.25).length / total * 100);
      const sourceRate = Math.round(data.filter(r => r.resolved).length / total * 100);

      return { accuracy, hallucination, sourceRate, avgScore: avgScore.toFixed(3), total };
    } catch (err) {
      logger.error('정확도 통계 오류', err);
      return null;
    }
  }

  // ── P3 톤 비율 집계 ──
  async getToneStats(days = 30) {
    if (!this.client) return null;
    try {
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await this.client
        .from('chat_logs')
        .select('situation, escalated')
        .gte('created_at', since);
      if (error) throw error;
      if (!data || data.length === 0) return null;

      const REJECT_SITUATIONS = new Set(['정책_위반', '단순_거절', '복합_정책']);
      let empathy = 0, reject = 0, escalate = 0;
      for (const row of data) {
        if (row.escalated) { escalate++; }
        else if (REJECT_SITUATIONS.has(row.situation)) { reject++; }
        else { empathy++; }
      }
      const total = empathy + reject + escalate || 1;
      return {
        empathy:  Math.round(empathy  / total * 100),
        reject:   Math.round(reject   / total * 100),
        escalate: Math.round(escalate / total * 100),
        total,
      };
    } catch (err) {
      logger.error('톤 통계 오류', err);
      return null;
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
