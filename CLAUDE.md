# JHC Honey 챗봇 v2 — Claude Code 완전 마스터 가이드

> **CoT/ToT 방법론** | 챗봇 20년 전문가 20인 협의 최종안  
> **기술 스택**: 카카오톡 무료 채널 + ChromaDB(무료 벡터DB) + Node.js + Redis(무료)  
> **AI API 미사용** — 순수 로컬 TF-IDF + 코사인 유사도 검색  
> **기반**: P1~P5 KB진단·RAG·3톤·폐곡선 + FAQ 50문항

---

## ❶ Claude Code 필수 시작 규칙

```
1. 이 파일(CLAUDE.md)을 먼저 완독한다
2. 외부 AI API(OpenAI·Anthropic·Google Gemini 등) 절대 호출 금지
3. 유료 서비스 절대 사용 금지 — 무료 오픈소스만 사용
4. 모든 소스코드는 /src 하위에 작성
5. 환경변수는 config/.env 에서만 관리, 하드코딩 금지
6. 작업 전 node --version (v18+), npm --version 확인
7. 신규 기능 → /tests 에 테스트 먼저 작성 (TDD)
8. 커밋 전 npm test 필수
9. 카카오톡 Webhook은 반드시 HTTPS (ngrok 무료 플랜 활용)
```

---

## ❷ 무료 기술 스택 선정 근거 (CoT 20인 협의)

```
CoT 1단계 — 요구사항 분해:
  ✓ 카카오톡 채널 → 무료 (카카오 i 오픈빌더 또는 카카오 채널 Webhook)
  ✓ 벡터DB → ChromaDB (Python 기반 완전 무료 오픈소스)
  ✓ 검색엔진 → TF-IDF + 코사인 유사도 (외부 API 불필요)
  ✓ 캐시 → Redis (무료 오픈소스) 또는 node-cache (순수 인메모리)
  ✓ 서버 → Express.js (무료)
  ✓ DB → SQLite (무료, 파일 기반)
  ✓ 로그 → Winston (무료)
  ✓ 터널 → ngrok 무료 플랜 (Webhook 수신)
  ✓ 배포 → Railway 무료 플랜 또는 Render 무료 플랜

CoT 2단계 — 아키텍처 결정:
  ChromaDB > FAISS > Qdrant 중 ChromaDB 선택
  이유: Python interop 쉬움, 로컬 파일 저장, 무료, 한국어 지원

CoT 3단계 — 리스크 검토:
  카카오톡 무료 채널: 메시지 발송 제한 없음 (Webhook 수신 기반)
  ChromaDB: 데이터 영속성 보장, 재시작 후 KB 유지
  ngrok 무료: 세션당 2시간, 프로덕션은 Render/Railway로 대체

ToT 최종 합의:
  모든 전문가 20인 만장일치 — 위 스택으로 확정
```

---

## ❸ 전체 아키텍처

```
┌─────────────────────────────────────────────────────────┐
│                   카카오톡 채널 (무료)                    │
│         고객이 채널 추가 → 메시지 전송                    │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTPS Webhook POST
                       ▼
┌─────────────────────────────────────────────────────────┐
│              Express.js API 서버 (무료)                   │
│  /webhook/kakao  /health  /admin/*  /api/*               │
└──────┬───────────────┬──────────────────────────────────┘
       │               │
       ▼               ▼
┌──────────┐   ┌───────────────────────────────────────┐
│  Redis   │   │         챗봇 처리 파이프라인             │
│ 무료캐시  │   │                                       │
│(node-    │   │  [전처리] 오타·줄임말·다국어·이모지       │
│ cache)   │   │      ↓                                 │
└──────────┘   │  [감정 감지] 격화키워드 12종 감지        │
               │      ↓                                 │
               │  [상황 분류] 12상황 자동 판단            │
               │      ↓                                 │
               │  [ChromaDB 검색] 코사인 유사도 검색      │
               │  + TF-IDF 보조 검색 (이중 검증)          │
               │      ↓                                 │
               │  [함정 검증기] 3종 차단 + 컴플 6항목     │
               │      ↓                                 │
               │  [3톤 엔진] 공감·거절·에스컬 자동 선택   │
               │      ↓                                 │
               │  [채널 포맷터] 카카오톡 200자 압축        │
               │      ↓                                 │
               │  [로그 기록] SQLite + 미해결 집계        │
               └───────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│              ChromaDB 벡터DB (무료 로컬)                  │
│  Collection: jhc_faq (50문항 임베딩)                     │
│  Collection: jhc_policy (정책 4건)                       │
│  저장 경로: ./data/chromadb/                             │
└─────────────────────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│                  카카오톡 응답 전송                        │
│  카카오 채널 Webhook Response (JSON)                     │
│  또는 카카오 i 오픈빌더 연동                              │
└─────────────────────────────────────────────────────────┘
```

---

## ❹ 디렉토리 구조

```
jhc-chatbot-v2/
├── CLAUDE.md                        ← Claude Code 진입점 (이 파일)
├── package.json                     ← Node.js 의존성
├── requirements.txt                 ← Python 의존성 (ChromaDB)
├── .gitignore
│
├── config/
│   ├── .env.example                 ← 환경변수 템플릿
│   ├── .env                         ← 실제 환경변수 (gitignore)
│   └── settings.js                  ← 전역 설정
│
├── src/
│   ├── index.js                     ← 메인 진입점
│   │
│   ├── kb/                          ← KB 데이터
│   │   ├── faq-data.js              ← FAQ 50문항 원본 데이터
│   │   ├── policy-data.js           ← 정책 4건 원본 데이터
│   │   └── kb-loader.js             ← KB 통합 로더
│   │
│   ├── vectordb/                    ← ChromaDB 연동
│   │   ├── chroma-client.js         ← ChromaDB Python 브리지
│   │   ├── embedder.js              ← 로컬 TF-IDF 임베딩
│   │   └── indexer.js               ← KB 인덱싱 실행
│   │
│   ├── engine/                      ← 검색·분류 엔진
│   │   ├── preprocessor.js          ← 전처리 (오타·이모지·다국어)
│   │   ├── tfidf-search.js          ← TF-IDF 로컬 검색
│   │   ├── situation-classifier.js  ← 12상황 분류기
│   │   └── trap-validator.js        ← 함정 3종 + 화장품법 검증
│   │
│   ├── tone/                        ← 3톤 분리 엔진
│   │   ├── tone-engine.js           ← 공감·거절·에스컬 선택
│   │   ├── response-builder.js      ← R-C-F-V 응답 조립
│   │   └── channel-formatter.js     ← 카카오톡 200자 포맷
│   │
│   ├── kakao/                       ← 카카오톡 연동
│   │   ├── webhook-handler.js       ← Webhook 수신 처리
│   │   ├── message-sender.js        ← 응답 전송
│   │   ├── channel-manager.js       ← 채널 추가 이벤트 처리
│   │   └── templates.js             ← 카카오톡 메시지 템플릿
│   │
│   ├── compliance/
│   │   └── compliance-checker.js    ← 컴플라이언스 6항목 검사
│   │
│   ├── loop/                        ← P4 폐곡선
│   │   ├── log-manager.js           ← 대화 로그 (SQLite)
│   │   └── unresolved-analyzer.js   ← 미해결 Top10 분석
│   │
│   ├── api/
│   │   ├── server.js                ← Express 서버
│   │   └── admin-router.js          ← 관리자 API
│   │
│   └── utils/
│       ├── korean-utils.js          ← 한국어 처리
│       ├── cache.js                 ← node-cache (무료 인메모리)
│       └── logger.js                ← Winston 로거
│
├── scripts/
│   ├── init-chromadb.py             ← ChromaDB 초기화 (Python)
│   ├── index-kb.js                  ← KB 인덱싱 실행
│   ├── generate-report.js           ← 미해결 리포트 생성
│   └── validate-kb.js              ← KB 유효성 검사
│
├── tests/
│   ├── engine.test.js
│   ├── tone.test.js
│   ├── kakao.test.js
│   ├── compliance.test.js
│   └── integration.test.js
│
├── deploy/
│   ├── Dockerfile                   ← Docker 설정
│   ├── docker-compose.yml           ← ChromaDB + App 통합
│   ├── railway.json                 ← Railway 무료 배포
│   └── render.yaml                  ← Render 무료 배포
│
├── data/
│   └── chromadb/                    ← ChromaDB 데이터 저장 경로
│
└── logs/
    ├── app.log
    └── unresolved.json
```

---

## ❺ 카카오톡 채널 무료 구성 (핵심)

```
[카카오 비즈니스 무료 설정 순서]

1. business.kakao.com 접속
2. "카카오톡 채널" 생성 (무료)
   - 채널명: JHC Honey CS
   - 카테고리: 헬스·뷰티 > 화장품
   - 채널 추가 버튼 URL 발급

3. "카카오 i 오픈빌더" 또는 Webhook 설정
   - 방법 A: 오픈빌더 (무료) → 폴백 Webhook URL 설정
   - 방법 B: 순수 Webhook → 카카오 비즈메시지 API (무료)

4. Webhook URL 등록:
   - 개발: https://[ngrok-url]/webhook/kakao
   - 운영: https://[render-url]/webhook/kakao

5. 채널 추가 이벤트:
   - 사용자가 "채널 추가" → follow 이벤트 → 자동 환영 메시지

[메시지 유형별 무료 한도]
- 상담톡 (1:1): 무료 (Webhook 응답)
- 알림톡: 유료 (사용 안 함)
- 채널 메시지: 무제한 (Webhook 응답 기반)
```

---

## ❻ ChromaDB 무료 벡터DB 설정

```python
# ChromaDB 특징 (무료 선택 이유)
- 완전 오픈소스 (Apache 2.0)
- 로컬 파일 저장 (./data/chromadb/)
- Python API (pip install chromadb)
- Node.js HTTP 클라이언트로 연동
- 한국어 TF-IDF 벡터 저장 가능
- 컬렉션 단위 관리
- 필터링 where 절 지원

# 설치
pip install chromadb

# 서버 실행 (포트 8000)
chroma run --path ./data/chromadb --port 8000

# Node.js에서 HTTP 호출
fetch('http://localhost:8000/api/v1/collections')
```

---

## ❼ 핵심 개발 원칙 (20인 최종 합의)

### R-C-F-V 4단 구조 (절대 준수)
```
[R] Role      → Honey 페르소나 + 발랄·트렌디 톤
[C] Constraint → KB 검색 우선, 추측 금지, 화장품법 준수
[F] Format    → 공감1줄 + 핵심응답 + 출처(FAQ§번호) + 에스컬
[V] Verify    → 발송 전 5개 항목 자가점검 (함정·컴플·마스킹)
```

### 함정 3종 차단 (절대 위반 금지)
```
함정1: KB 없는 정보 추측 → "해당 정보는 KB에 없어요. 담당자 연결 드릴까요?"
함정2: 책임 단정 → "케이스별로 담당자가 직접 확인 도와드릴게요!"
함정3: 복합 단답 → 항목별 분리: ① 환불 ② 쿠폰 ③ 적립금
```

### 화장품법 특화 단정 금지 목록
```
금지: 부작용 발생률 수치 / 기능성 효능 단정 / 임산부 가능 단정
금지: 천연·유기농 인증 단정 / 의료적 효과 주장
대안: 전문의 상담 권유 / 공인 인증 마크 확인 안내
```

---

## ❽ 실행 명령어

```bash
# 1. 의존성 설치
npm install
pip install chromadb

# 2. ChromaDB 서버 시작 (터미널 1)
npm run chromadb

# 3. KB 인덱싱 (최초 1회)
npm run index-kb

# 4. 개발 서버 시작 (터미널 2)
npm run dev

# 5. ngrok 터널 (터미널 3, 카카오 Webhook용)
npm run tunnel

# 6. 테스트
npm test

# 7. 미해결 리포트 (월간 폐곡선)
npm run report

# Docker 통합 실행
docker-compose up
```

---

## ❾ 무료 배포 옵션

```
옵션 A — Render 무료 플랜 (권장)
  - Node.js 앱 무료 배포
  - 750시간/월 무료
  - HTTPS 자동 제공
  - 환경변수 설정 가능
  - 단점: 15분 미사용 시 슬립

옵션 B — Railway 무료 플랜
  - $5 크레딧/월 무료
  - HTTPS 자동
  - ChromaDB 별도 서비스로 배포 가능

옵션 C — Fly.io 무료 플랜
  - 3개 VM 무료
  - 볼륨 스토리지 무료

ChromaDB 배포:
  Docker 컨테이너로 같은 플랫폼에 배포
  또는 Fly.io 별도 앱으로 배포
```
