FROM node:20-alpine

WORKDIR /app

# Python (ChromaDB 초기화 스크립트용)
RUN apk add --no-cache python3 py3-pip curl

# 의존성 설치
COPY package.json .
RUN npm install --production

# Python 의존성
COPY requirements.txt .
RUN pip3 install --break-system-packages chromadb --quiet

# 소스 복사
COPY src ./src
COPY config ./config
COPY scripts ./scripts

# 디렉토리 생성
RUN mkdir -p data logs

# 포트 노출
EXPOSE 3000

# 헬스 체크
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# 시작
CMD ["node", "src/api/server.js"]
