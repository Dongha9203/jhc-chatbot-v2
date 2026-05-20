'use strict';

/**
 * ChromaDB HTTP 클라이언트
 * 무료 오픈소스 벡터DB — AI API 미사용
 * ChromaDB REST API v1 연동
 */

const settings = require('../../config/settings');
const { logger } = require('../utils/logger');

const CHROMA_TENANT = 'default_tenant';
const CHROMA_DATABASE = 'default_database';

class ChromaClient {
  constructor() {
    this.baseUrl = `http://${settings.chroma.host}:${settings.chroma.port}`;
    this.collections = settings.chroma.collections;
    this.colBase = `/api/v2/tenants/${CHROMA_TENANT}/databases/${CHROMA_DATABASE}/collections`;
  }

  // ── HTTP 요청 헬퍼 ──
  async _request(method, path, body) {
    const url = `${this.baseUrl}${path}`;
    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`ChromaDB ${method} ${path}: ${res.status} ${err}`);
      }
      const text = await res.text();
      return text ? JSON.parse(text) : null;
    } catch (e) {
      // ChromaDB 서버 미실행 시 폴백 처리
      if (e.code === 'ECONNREFUSED') {
        logger.warn('ChromaDB 미연결 — TF-IDF 폴백 모드로 전환');
        throw { code: 'CHROMA_OFFLINE' };
      }
      throw e;
    }
  }

  // ── 헬스 체크 ──
  async ping() {
    try {
      await this._request('GET', '/api/v2/heartbeat');
      return true;
    } catch { return false; }
  }

  // ── 컬렉션 생성 or 가져오기 ──
  async getOrCreateCollection(name, metadata = {}) {
    try {
      return await this._request('GET', `${this.colBase}/${name}`);
    } catch {
      return await this._request('POST', this.colBase, {
        name,
        metadata: { hnsw_space: 'cosine', ...metadata },
      });
    }
  }

  // ── 컬렉션 삭제 (재인덱싱용) ──
  async deleteCollection(name) {
    try {
      await this._request('DELETE', `${this.colBase}/${name}`);
      logger.info(`컬렉션 삭제: ${name}`);
    } catch { /* 없으면 무시 */ }
  }

  // ── 문서 추가 ──
  async add(collectionName, { ids, embeddings, documents, metadatas }) {
    const col = await this._request('GET', `${this.colBase}/${collectionName}`);
    return await this._request('POST', `${this.colBase}/${col.id}/add`, {
      ids,
      embeddings,
      documents,
      metadatas,
    });
  }

  // ── 벡터 검색 ──
  async query(collectionName, { queryEmbeddings, nResults = 3, where }) {
    const col = await this._request('GET', `${this.colBase}/${collectionName}`);
    const body = {
      query_embeddings: queryEmbeddings,
      n_results: nResults,
      include: ['documents', 'metadatas', 'distances', 'embeddings'],
    };
    if (where) body.where = where;
    return await this._request('POST', `${this.colBase}/${col.id}/query`, body);
  }

  // ── 전체 문서 조회 ──
  async getAll(collectionName) {
    const col = await this._request('GET', `${this.colBase}/${collectionName}`);
    return await this._request('POST', `${this.colBase}/${col.id}/get`, {
      include: ['documents', 'metadatas'],
    });
  }

  // ── 컬렉션 통계 ──
  async count(collectionName) {
    try {
      const col = await this._request('GET', `${this.colBase}/${collectionName}`);
      return await this._request('GET', `${this.colBase}/${col.id}/count`);
    } catch { return 0; }
  }
}

// 싱글톤
const chromaClient = new ChromaClient();
module.exports = { chromaClient, ChromaClient };
