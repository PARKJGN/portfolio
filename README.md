# 포트폴리오

방 안의 책장에서 책을 꺼내 읽는 형태의 개인 포트폴리오. 책을 누르면 3D 로 펼쳐진다.
방명록도 마찬가지로 3D 로 열리는데, 그 책은 한 면을 비워 두고 그 자리에 진짜 입력칸을
얹어 방문자가 글을 남긴다.

두 갈래로 되어 있다.

| | 무엇 | 어디 | 어떻게 뜨나 |
|---|---|---|---|
| **사이트** | Next.js 정적 export | `src/`, `public/` | 빌드 결과(`out/`)를 nginx 가 그대로 서빙. 런타임 서버 없음 |
| **API** | Fastify + PostgreSQL | `api/` | 방명록에만 필요하다. 정적 사이트 옆에 별도 컨테이너로 붙는다 |

사이트만 고칠 거라면 API 는 띄우지 않아도 된다. 방명록 책만 "지금은 닿을 수 없습니다" 로
보이고 나머지는 평소와 같다.

---

## 필요한 것

- Node 22 이상 (API 는 `engines` 에 명시, 사이트도 같은 버전으로 쓴다)
- 방명록을 손댈 때만: Docker (로컬 PostgreSQL)

---

## 사이트

```bash
npm install
npm run dev            # 개발 서버 http://localhost:3000
```

배포되는 것은 개발 서버가 아니라 정적 산출물이다. 확인은 그쪽으로 한다.

```bash
npm run build          # out/ 생성
npm run serve          # out/ 을 3000 번으로 서빙
```

방명록이 API 를 어디로 부를지는 **빌드 시점에 박힌다.** 운영은 같은 도메인의 `/api` 라 비워
두면 되고, 로컬은 포트가 갈리므로 넣어 준다.

```bash
NEXT_PUBLIC_GUESTBOOK_API=http://localhost:8080 npm run build
```

### 한글을 추가했다면

글꼴은 콘텐츠에 실제로 쓰인 글자만 담은 서브셋이다. **소스나 콘텐츠에 새 한글이 들어가면
다시 만들어야 한다.** 안 하면 화면에 빈 네모가 뜨고 `npm test` 가 막는다.

```bash
npm run fonts:build
```

`.fontsrc/NotoSerifKR.ttf` 가 없으면 `npm run fonts:fetch` 를 먼저 돌린다.

---

## API (방명록)

`api/` 안에서 돈다. 아래 명령은 전부 그 디렉터리 기준이다.

### 1. 데이터베이스

운영에서는 oneBite 의 PostgreSQL 인스턴스를 공유하되 롤과 데이터베이스를 분리한다. 로컬은
같은 이름의 일회용 인스턴스를 띄운다 — 구조를 같게 맞춰 둬야 "로컬에선 됐는데" 를 피한다.

```bash
docker compose -f docker-compose.dev.yml up -d
```

처음부터 다시 하려면 `down -v` 로 볼륨까지 지운다.

### 2. 환경변수

```bash
cp .env.example .env
```

`.env` 는 커밋되지 않는다(`.gitignore`). 채워야 하는 값은 `.env.example` 에 설명과 함께
있다. 특히 셋:

| 이름 | 만드는 법 |
|---|---|
| `ADMIN_TOKEN` | `openssl rand -hex 32` — 보류함 조회·삭제에 쓴다 |
| `CLIENT_HASH_SALT` | `openssl rand -hex 32` — 접속 식별값을 해시할 때 섞는다 |
| `ANTHROPIC_API_KEY` | 유해성 판정용. **없으면 글이 공개되지 않고 전부 보류로 간다** |

마지막 항목은 실수가 아니라 설계다. 판정을 받지 못하면 공개하지 않는다 — 방어의 실패는
닫히는 쪽으로 향해야 한다.

### 3. 마이그레이션

번호 붙은 SQL 을 순서대로 한 번씩 적용한다. 적용 기록은 `schema_migrations` 표에 남는다.

```bash
npm run migrate         # 개발 (tsx 로 직접 실행)
npm run migrate:prod    # 빌드된 dist/ 로 실행 — 컨테이너 안에서 쓴다
```

규칙 둘:

- 파일 이름은 `001_설명.sql` 처럼 번호로 시작한다. 이름순이 곧 적용 순서다.
- **이미 적용한 파일은 고치지 않는다.** 바꿀 것이 생기면 새 번호로 추가한다.

### 4. 실행

```bash
npm run dev             # 자동 재시작 (tsx watch)
npm run build && npm start
```

기본 포트는 8080. 없는 환경변수가 있으면 **뜨지 않고 무엇이 없는지 말한다** — 절반만
설정된 채로 떠서 첫 요청에 500 을 내는 것보다 낫다.

---

## 테스트

```bash
npm test                # 사이트 단위 테스트
npm run test:e2e        # E2E (Playwright)
cd api && npm test      # API — 실제 PostgreSQL 을 쓴다
```

API 테스트는 `portfolio_test` 데이터베이스를 따로 만들어 쓴다. 개발용 `portfolio` 는 건드리지
않는다. 인메모리 흉내를 쓰지 않는 이유는 CHECK 제약과 SQL 방언을 검증할 수 없기 때문이다.

E2E 중 `tests/e2e/guestbook.spec.ts` 만 **서버 셋(DB·판정 대역·API)이 떠 있어야** 돈다. 없으면
그 파일만 통째로 건너뛰므로, 도커 없이 돌려도 나머지는 정상이다. 띄우는 방법은
`specs/003-guestbook/quickstart.md` 의 검증 6 에 있다.

---

## 배포

**아직 아무것도 띄우지 않았다.** 매니페스트는 일부 있고, 클러스터에 적용하는 일은 남아
있다.

| | 상태 |
|---|---|
| `Dockerfile` (사이트 → nginx) · `api/Dockerfile` | 있음 |
| `deploy/nginx.conf` | 있음 |
| `deploy/k8s/` 여섯 파일 (네임스페이스·설정·시크릿 예시·web·api·인그레스 다리) | 있음 |
| `.github/workflows/deploy.yml` (검사 → GHCR 멀티아치 푸시) | 있음 |
| `deploy/grafana/portfolio-dashboard.json` | 있음 |
| 공유 PostgreSQL 의 `portfolio` 롤 생성 | 안 함 — 수동 절차, 클러스터 접근 필요 |
| 중앙 인그레스 등록·DNS·인증서 | 안 함 |
| `kubectl apply` | 안 함 |

사이트 이미지는 **로컬에서 빌드해 돌려 확인했다** — 비루트(UID 101)로 뜨고, `/`·`/admin`
이 200, 없는 주소는 우리 404, 모든 응답에 보안 헤더 셋과 `Cache-Control` 하나, 접근 로그가
JSON 으로 나온다.

쿠버네티스 매니페스트는 **적용해 본 적이 없다.** 클러스터에 붙을 수 없어 YAML 구조와 앱이
읽는 환경변수 이름 일치까지만 확인했다 — `kubectl apply --dry-run` 조차 스키마 검증에
서버를 요구한다.

이미지 만들어 보기:

```bash
docker build -t portfolio-web:local .          # 사이트
docker build -t portfolio-api:local ./api      # API
docker run --rm -p 8099:8080 portfolio-web:local
```

정해진 것은 다음과 같고, oneBite 와 같은 라인을 따른다.

- 이미지는 GHCR, GitHub Actions buildx 로 멀티아치(amd64 + arm64) — 클러스터가 라즈베리파이
  arm64 3노드다
- 앱 전용 네임스페이스에 올리고, `default` 네임스페이스의 중앙 인그레스에 ExternalName
  다리로 연결한다. TLS 는 cert-manager 가 발급한다
- 도메인은 `portfolio.jgbak-land.com`, API 는 같은 도메인의 `/api`
- 데이터베이스는 `postgres.onebite.svc.cluster.local:5432` 를 공유하되 롤과 데이터베이스를
  분리한다. **롤 생성은 수동 절차다** — 그 파드의 초기화 스크립트는 데이터 디렉터리가 빈
  최초 기동에서만 돌기 때문에, 돌고 있는 인스턴스에 직접 붙어 만들어야 한다
- 비밀값은 커밋하지 않는다. Secret 예시 파일만 저장소에 둔다

절차와 확인 항목은 `specs/003-guestbook/quickstart.md` 에 있다.

---

## 문서

작업은 [Spec Kit](https://github.com/github/spec-kit) 흐름을 따른다. 명세 → 계획 → 작업 →
구현 순이고, 산출물은 `specs/` 아래에 남는다.

- **헌장**(모든 결정에 우선): `.specify/memory/constitution.md`
- **001 방·책장·책 모달**: `specs/001-room-bookshelf-shell/`
- **003 방명록**: `specs/003-guestbook/` — 계약은 `contracts/guestbook-api.md`, 검증 절차는
  `quickstart.md`

작업할 때 알아 두면 좋은 결정 몇 가지:

- 책은 JS 가 있어야 열린다. 무JS 폴백도, 딥링크도, 책마다의 정적 페이지도 없다(헌장 3.0.0)
- 방명록 글은 **마크다운도 HTML 도 해석하지 않는다.** 순수 텍스트로 저장하고 텍스트로 넣는다
  — 허용하지 않으면 정화할 것이 없다
- 글 내용과 이름은 **로그에 남기지 않는다.** 지운 글도 로그에는 남기 때문이다
- 방문자의 접속 주소는 원문으로 저장하지 않는다. 소금 섞은 해시와 만료 시각만 남긴다
