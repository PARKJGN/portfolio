# 방명록 API — 멀티스테이지. 결과 이미지는 실행에 필요한 것만 담는다.
#
# 베이스를 22 로 고정한 이유: 클러스터가 라즈베리파이 arm64 이고, LTS 를 벗어난
# 런타임을 파이에서 굴리고 싶지 않다. 코드는 Node 22 문법 안에서 쓴다.

# ── 빌드 ──
FROM node:22-alpine AS build
WORKDIR /app

# 의존성 레이어를 소스와 분리해, 소스만 바뀔 때 npm ci 를 다시 돌지 않게 한다.
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# 실행에 필요한 것만 남긴다(개발 의존성 제거).
RUN npm ci --omit=dev

# ── 실행 ──
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# 마이그레이션 SQL 은 런타임에 읽으므로 이미지에 넣는다.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json
COPY migrations ./migrations

# 루트로 돌리지 않는다. node 이미지에 이미 있는 비루트 사용자를 쓴다.
USER node

EXPOSE 8080

# 프로브는 /api/health 를 쓴다(계약 참조). 컨테이너 자체 HEALTHCHECK 은 두지 않는다 —
# 쿠버네티스가 프로브로 판단하므로 두 곳에서 같은 판단을 하면 어긋날 때 헷갈린다.
CMD ["node", "dist/server.js"]
