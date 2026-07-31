# 포트폴리오 사이트 — 멀티스테이지. 결과 이미지에는 nginx 와 정적 파일만 남는다 (001 T040).
#
# Node 를 상주시키지 않는다. 서버 로직이 없고, arm64 라즈베리파이의 메모리를 아끼며,
# 헌장 원칙 I(Static by Default)에 부합한다 (plan.md 배포 구성 절).

# ── 빌드 ──
FROM node:22-alpine AS build
WORKDIR /app

# 의존성 레이어를 소스와 분리해, 소스만 바뀔 때 npm ci 를 다시 돌지 않게 한다.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# 방명록이 API 를 어디로 부를지는 **빌드 시점에 번들에 박힌다**(정적 export 라 런타임
# 환경변수가 없다). 운영은 같은 도메인의 /api 라 비워 두면 상대 경로가 되어 그대로 맞는다.
# 비워 둘 수 있게 기본값을 빈 문자열로 두었다.
ARG NEXT_PUBLIC_GUESTBOOK_API=""
ENV NEXT_PUBLIC_GUESTBOOK_API=$NEXT_PUBLIC_GUESTBOOK_API

RUN npm run build

# ── 실행 ──
# 비루트 변종을 쓴다. 보통 nginx 이미지는 80 을 잡으려고 루트로 시작해 워커만 내린다.
# 이 변종은 처음부터 UID 101 로 돌고 8080 을 들으며, 캐시·임시 디렉터리 권한이 맞춰져 있다.
# plan.md 는 nginx:alpine 이라고 적었는데, 같은 nginx alpine 계열이고 다른 점은 권한뿐이다.
FROM nginxinc/nginx-unprivileged:alpine AS runtime

# 기본 서버 블록을 우리 것으로 바꾼다.
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf

COPY --from=build /app/out /usr/share/nginx/html

EXPOSE 8080

# HEALTHCHECK 을 두지 않는다. 쿠버네티스가 프로브로 판단하므로, 두 곳에서 같은 판단을
# 하면 어긋날 때 어느 쪽 말이 맞는지 헷갈린다 (api/Dockerfile 과 같은 이유).
