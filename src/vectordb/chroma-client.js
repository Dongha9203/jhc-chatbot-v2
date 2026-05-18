'use strict';

/**
 * ChromaDB HTTP 클라이언트 (API v2)
 * chromadb 1.x 이상 — /api/v2 엔드포인트 사용
 * AI API 미사용
 */

const settings = require('../../config/settings');
const { logger } = require('../utils/logger');

const DEFAULT_TENANT   = 'default_tenant';
const DEFAULT_DATABASE = 'default_database';

class ChromaClient {
  constructor() {
    this.baseUrl    = `http://${settings.chroma.host}:${settings.chroma.port}`;
    this.apiBase    = `${this.baseUrl}/api/v2`;
    this.colBase    = `${this.apiBase}/tenants/${DEFAULT_TENANT}/databases/${DEFAULT_DATABASE}/collections`;
    this.collections = settings.chroma.collections;
  }

  // ── HTTP 요청 헬퍼 ──
  async _request(method, url, body) {
    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`ChromaDB ${method} ${url}: ${res.status} ${err}`);
      }
      const text = await res.text();
      return text ? JSON.parse(text) : null;
    } catch (e) {
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
      await this._request('GET', `${this.apiBase}/heartbeat`);
      return true;
    } catch { return false; }
  }

  // ── 컬렉션 생성 or 가져오기 (cosine 공간 보장) ──
  async getOrCreateCollection(name) {
    const list = await this._request('GET', this.colBase);
    const existing = list.find(c => c.name === name);

    // 이미 cosine 공간으로 존재하면 그대로 사용
    if (existing) {
      const space = existing.configuration_json?.hnsw?.space;
      if (space === 'cosine') return existing;
      // L2 등 잘못된 공간 → 삭제 후 재생성
      logger.warn(`컬렉션 "${name}" 공간이 ${space}입니다. cosine으로 재생성합니다.`);
      await this.deleteCollection(name);
    }

    return await this._request('POST', this.colBase, {
      name,
      metadata: { 'hnsw:space': 'cosine' },
    });
  }

  // ── 컬렉션 삭제 (재인덱싱용) ──
  async deleteCollection(name) {
    try {
      await this._request('DELETE', `${this.colBase}/${name}`);
      logger.info(`컬렉션 삭제: ${name}`);
    } catch { /* 없으면 무시 */ }
  }

  // ── 컬렉션 ID 조회 ──
  async _getCollectionId(name) {
    const list = await this._request('GET', this.colBase);
    const col = list.find(c => c.name === name);
    if (!col) throw new Error(`컬렉션 없음: ${name}`);
    return col.id;
  }

  // ── 문서 추가 ──
  async add(collectionName, { ids, embeddings, documents, metadatas }) {
    const id = await this._getCollectionId(collectionName);
    return await this._request('POST', `${this.colBase}/${id}/add`, {
      ids, embeddings, documents, metadatas,
    });
  }

  // ── 벡터 검색 ──
  async query(collectionName, { queryEmbeddings, nResults = 3, where }) {
    const id = await this._getCollectionId(collectionName);
    const body = {
      query_embeddings: queryEmbeddings,
      n_results: nResults,
      include: ['documents', 'metadatas', 'distances', 'embeddings'],
    };
    if (where) body.where = where;
    return await this._request('POST', `${this.colBase}/${id}/query`, body);
  }

  // ── 전체 문서 조회 ──
  async getAll(collectionName) {
    const id = await this._getCollectionId(collectionName);
    return await this._request('POST', `${this.colBase}/${id}/get`, {
      include: ['documents', 'metadatas'],
    });
  }

  // ── 컬렉션 문서 수 ──
  async count(collectionName) {
    try {
      const id = await this._getCollectionId(collectionName);
      return await this._request('GET', `${this.colBase}/${id}/count`);
    } catch { return 0; }
  }
}

const chromaClient = new ChromaClient();
module.exports = { chromaClient, ChromaClient };
