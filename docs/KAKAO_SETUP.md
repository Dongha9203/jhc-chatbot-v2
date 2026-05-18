# 카카오톡 채널 무료 설정 완전 가이드

## 1. 카카오 비즈니스 채널 개설 (무료)

### 1.1 채널 생성
1. https://business.kakao.com 접속
2. 로그인 (개인 카카오계정 사용 가능)
3. "채널 관리자센터" → "새 채널 만들기"
4. 채널 설정:
   - 채널명: `JHC Honey CS`
   - 카테고리: `헬스·뷰티 > 화장품`
   - 소개: `J Health Care 고객지원 챗봇 Honey`
5. "채널 공개" 설정 → 검색 허용

### 1.2 채널 ID 확인
- 채널 관리자센터 → 설정 → 기본 정보
- `채널 ID` 복사 → `.env` 파일 `KAKAO_CHANNEL_ID`에 입력

---

## 2. 카카오 i 오픈빌더 설정 (무료)

### 2.1 봇 생성
1. https://i.kakao.com/openbuilder 접속
2. "봇 만들기" → 봇 이름: `Honey`
3. 카카오톡 채널 연결 (위에서 만든 채널 선택)

### 2.2 스킬 서버 등록
1. 오픈빌더 → "스킬" 탭 → "스킬 추가"
2. 스킬 이름: `JHC-Honey-CS`
3. 스킬 서버 URL:
   - 개발: `https://[ngrok-url]/webhook/kakao`
   - 운영: `https://[render-url]/webhook/kakao`
4. 메서드: `POST`
5. "저장"

### 2.3 시나리오 설정 (Fallback)
1. 오픈빌더 → "시나리오" → "폴백 블록"
2. "스킬 데이터 사용" 선택
3. 위에서 만든 스킬(`JHC-Honey-CS`) 연결
4. → 모든 입력을 스킬 서버로 전달

### 2.4 채널 추가(follow) 이벤트
1. "이벤트" 탭 → "채널 추가 이벤트"
2. 스킬 서버로 follow 이벤트 전달 설정

---

## 3. 대안: 순수 Webhook 방식 (오픈빌더 불필요)

카카오 채널 메시지 API를 직접 사용하는 방식:

```
채널 관리자센터 → 설정 → 채팅방 연결 → Webhook URL 등록
POST /webhook/kakao
```

> **주의**: 이 방식은 카카오 측 심사 필요, 오픈빌더 방식이 더 간단

---

## 4. ngrok으로 로컬 개발 테스트 (무료)

```bash
# ngrok 설치 (https://ngrok.com 무료 회원가입)
brew install ngrok  # macOS
# 또는 https://ngrok.com/download

# 인증 (무료 계정 필요)
ngrok config add-authtoken [토큰]

# 터널 시작
ngrok http 3000
# → https://xxxx.ngrok-free.app 발급

# 이 URL을 오픈빌더 스킬 서버 URL로 등록
```

> **무료 플랜 제한**: 세션당 2시간, URL 매번 변경
> **해결**: Render/Railway 무료 배포로 영구 URL 획득

---

## 5. Render 무료 배포 (영구 HTTPS URL)

```bash
# 1. https://render.com 무료 가입
# 2. "New Web Service" → GitHub 연결
# 3. 설정:
#    Name: jhc-honey-bot
#    Runtime: Node
#    Build: npm install
#    Start: node src/api/server.js
# 4. 환경변수 추가:
#    NODE_ENV=production
#    KAKAO_CHANNEL_ID=...
#    KAKAO_CHANNEL_SECRET=...
#    CHROMA_HOST=[별도 chromadb 서비스 주소]
#    PORT=3000
# 5. 배포 완료 → https://jhc-honey-bot.onrender.com
# 6. 이 URL을 카카오 오픈빌더 스킬 URL로 등록
```

> **무료 플랜**: 750시간/월, 15분 미사용 시 슬립 (첫 메시지 지연 ~30초)

---

## 6. ChromaDB Render 배포

```bash
# render.yaml 또는 별도 Docker 서비스로 배포
# 또는 Fly.io 무료 플랜 활용

# docker-compose 로컬 실행
docker-compose -f deploy/docker-compose.yml up -d
```

---

## 7. 채널 추가 버튼 HTML (웹사이트 삽입)

```html
<!-- 카카오 채널 추가 버튼 (무료) -->
<script src="https://developers.kakao.com/sdk/js/kakao.min.js"></script>
<script>
  Kakao.init('YOUR_APP_KEY');
</script>

<div id="kakao-add-channel"></div>
<script>
  Kakao.Channel.createAddChannelButton({
    container: '#kakao-add-channel',
    channelPublicId: '_xxxxx',  // 채널 ID
  });
</script>
```

---

## 8. 카카오 채널 추가 URL (직접 링크)

```
https://pf.kakao.com/_xxxxx          (채널 홈)
https://pf.kakao.com/_xxxxx/friend   (채널 추가)
https://pf.kakao.com/_xxxxx/chat     (1:1 채팅)
```

이 URL을 QR코드로 생성하거나 마케팅에 활용 가능 (무료).

---

## 9. 메시지 유형별 무료 한도

| 유형 | 무료 여부 | 설명 |
|------|-----------|------|
| 상담톡 응답 | ✅ 무료 | 고객이 먼저 보낸 메시지에 응답 |
| 알림톡 | ❌ 유료 | 기업이 먼저 보내는 메시지 |
| 채널 소식 | ✅ 무료 | 채널 소식 발행 (팔로워에게) |
| 챗봇 응답 | ✅ 무료 | 오픈빌더 스킬 서버 응답 |

**결론**: 고객이 먼저 채팅을 시작하는 챗봇 방식은 **완전 무료**.
