# Implementation Plan: 방명록

**Branch**: `003-guestbook` | **Date**: 2026-07-31 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-guestbook/spec.md`

## Summary

방문자가 방명록 책장에서 이름과 한마디를 남기면, 걸러진 글만 방명록에 쌓인다.

정적 사이트는 그대로 두고 **경량 Node API 컨테이너를 옆에 붙인다.** 방명록 책도 다른 책과
똑같이 3D 로 연다 — 캔버스에 입력칸을 못 놓는 제약은 3D 가 한 면을 통째로 비우고 그 자리에
진짜 `<form>` 을 얹어 푼다(R-2 는 2026-08-01 에 뒤집혔다). 방문자 글은 서브셋 글꼴이 아니라
시스템 글꼴로 렌더한다(R-3). 방어는 세 겹이다 — 봇 거르기, 규칙, Claude 판정. 어느 겹에서든
걸린 글은 공개되지 않고 보류함으로 간다.

데이터는 oneBite 가 쓰는 PostgreSQL 인스턴스에 **계정과 데이터베이스를 나눠** 넣는다.
배포는 oneBite 와 같은 라인이되, **001 의 Phase 6 로 정적 사이트를 먼저 띄운 뒤** 그 위에
API 를 얹는다(R-1).

## Technical Context

**Language/Version**: TypeScript 5.5 · Node.js 22 LTS (API) · 사이트는 기존 Next.js 16 정적 export

**Primary Dependencies**: Fastify 5 · `pg` (node-postgres) · `@fastify/rate-limit` · Anthropic SDK

**Storage**: PostgreSQL 18 — oneBite 인스턴스를 공유하되 `portfolio` 롤·데이터베이스로 분리.
접속 `postgres.onebite.svc.cluster.local:5432`

**Testing**: Vitest (검증 규칙·필터·판정 응답 처리) · Playwright (방명록 남기기 E2E) ·
axe-core (폼 접근성)

**Target Platform**: 정적 파일 → `nginx:alpine`, API → `node:22-alpine`. 둘 다 linux/amd64 +
linux/arm64 멀티아치. k8s (라즈베리파이 arm64 3노드)

**Project Type**: 정적 웹 사이트 + 작은 API 서비스

**Performance Goals**: 001 의 예산을 그대로 승계(LCP < 2.5s · CLS < 0.1 · INP < 200ms).
방명록은 책을 열 때만 불러오므로 초기 로드 예산에 들어가지 않는다. 남긴 글이 화면에
나타나기까지 3초 이내(SC-002)

**Constraints**: WCAG 2.2 AA · 320px 이상 가로 스크롤 없음 · 방명록이 죽어도 나머지 책 열람
100% 유지(FR-019) · API 상주 메모리 100MB 이하 · arm64 이미지 필수

**Scale/Scope**: 개인 사이트. 글 수천 건, 동시 방문자 소수, 하루 글 몇 건. API 엔드포인트 5개

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 원칙 | 판정 | 근거 |
|---|---|---|
| I. Content-First, Static by Default | **조건부 통과** | 런타임 서버와 데이터베이스를 도입한다. 원칙 I 은 이를 금지하되 *정적으로 충족할 수 없는 사용자 요구*가 있으면 허용하고 근거를 Complexity Tracking 에 기록하도록 요구한다. 방명록은 정의상 정적으로 충족할 수 없다. 아래 표에 두 건(런타임 도입·방문자 글의 서버 렌더 불가)을 기록했다. 사이트 본문(책)은 여전히 전부 빌드 시점 정적 HTML 이고, API 가 죽어도 그대로 읽힌다. |
| II. Accessibility Is Non-Negotiable | **통과** | 폼은 새 인터랙티브 컴포넌트이므로 키보드 경로를 손으로 걷고 axe 를 0 위반으로 통과시킨다. 라벨·오류 안내·전송 결과를 낭독기에 알리고(`aria-live`), 목록이 늘어날 때 초점을 잃지 않게 한다. 3D 로 열지만 폼은 캔버스가 아니라 그 위에 얹힌 진짜 `<form>` 이므로 IME·붙여넣기·낭독기가 그대로 동작한다. 3D 를 못 띄우는 환경에서는 같은 마크업이 평면 폴백이 된다. |
| III. Performance Budgets Are Gates | **통과** | 방명록 자산과 요청은 방명록 책을 열 때만 발생해 초기 로드 지표에 영향이 없다. CLS 주의점: 목록이 도착하며 높이가 튀지 않도록 자리를 미리 잡는다. 시스템 글꼴을 쓰므로 글꼴 요청이 늘지 않는다. |
| IV. Pragmatic Verification | **통과** | 입력 검증·필터 규칙·판정 응답 처리·정화는 모두 "비자명하게 틀릴 수 있는 로직"이라 REQUIRED 대상이다. Vitest 로 덮는다. 폼의 겉모습은 검사 도구와 리뷰로 대체한다. |
| V. One Design System | **통과** | 폼·목록·보류 안내는 기존 토큰(`--page-*`, `--space-*`, `--text-*`)만 쓴다. 새 컴포넌트는 입력칸·목록 항목 둘로 최소화하고 라이트·다크 양쪽을 정의한다. |

**기술·플랫폼 제약 점검**

| 제약 | 판정 | 근거 |
|---|---|---|
| 정적 산출물로 배포 가능해야 함 | 통과 | 사이트 빌드는 그대로 `output: 'export'`. API 는 별개 컨테이너다. |
| 벤더 런타임이 핵심 콘텐츠를 좌우하면 안 됨 | 통과 | 방명록은 핵심 콘텐츠가 아니다. FR-019 로 명시적으로 분리한다. |
| 의존성마다 대안과 함께 기록 | 통과 | research.md R-4·R-5·R-7 에 기록. |
| 시크릿 커밋 금지 | 통과 | DB 비밀번호·판정 API 키·관리 토큰 모두 k8s Secret. 예시 파일만 커밋한다. |
| 개인정보 최소화 | **주의** | 방문자가 적은 이름·내용만 저장한다. 접속 식별값은 자발적 제출이 아니므로 원문 대신 소금 섞은 해시로 짧게만 보관한다(FR-020). 판정을 위해 글이 제3자에게 전달되는 점은 FR-014 로 고지한다. 아래 판단 참조. |
| 320px 이상 가로 스크롤 없음 | 통과 | 폼과 목록에 대해 E2E 로 검사한다. |

**제3자 전송이 헌장 개정을 요구하는가 — 판단**

요구하지 않는다. 제약이 금지하는 것은 "방문자를 **추적**하는 제3자 분석·임베드"다. 판정
호출은 추적이 아니고, 브라우저에 심는 임베드도 아니며(서버 대 서버), 방문자를 식별하지
않는다. 다만 방문자가 적은 글이 제3자에게 전달되는 것은 사실이므로 **남기기 전에 고지**
한다(FR-014). 이것으로 "최소화하고 다른 목적으로 쓰지 않는다"는 취지는 지켜진다.

**게이트 결과**: 원칙 I 은 자체 예외 경로를 통해 조건부 통과이며, 그 조건(Complexity
Tracking 기록)을 아래에서 충족했다. 나머지 넷은 통과.

## Project Structure

### Documentation (this feature)

```text
specs/003-guestbook/
├── plan.md              # 이 파일
├── spec.md              # 기능 명세
├── research.md          # Phase 0 출력 — 결정 10건
├── data-model.md        # Phase 1 출력
├── quickstart.md        # Phase 1 출력 — 검증·운영 절차
├── contracts/
│   └── guestbook-api.md # Phase 1 출력 — 엔드포인트 계약
├── checklists/
│   └── requirements.md  # 명세 품질 체크리스트
└── tasks.md             # /speckit.tasks 출력 (이 명령이 만들지 않는다)
```

### Source Code (repository root)

```text
api/                                 # 새로 생기는 방명록 API (별도 컨테이너)
├── src/
│   ├── server.ts                    # Fastify 인스턴스·플러그인 등록
│   ├── routes/
│   │   ├── entries.ts               # 목록 조회·남기기
│   │   └── admin.ts                 # 보류함·공개·삭제
│   ├── guard/
│   │   ├── bot.ts                   # 1층 — 숨은 칸·제출 속도
│   │   ├── rules.ts                 # 2층 — 링크 수·길이·반복·중복
│   │   └── verdict.ts               # 3층 — Claude 판정, 실패 시 보류
│   ├── db/
│   │   ├── pool.ts                  # pg 커넥션 풀
│   │   ├── entries.ts               # 질의
│   │   └── migrate.ts               # 번호 붙은 SQL 러너
│   └── config.ts                    # 환경변수 읽기·검증
├── migrations/
│   └── 001_init.sql
├── tests/
│   ├── guard.test.ts
│   └── routes.test.ts
├── Dockerfile
├── package.json
└── tsconfig.json

src/                                 # 기존 사이트
├── components/book/
│   ├── BookController.tsx           # 책마다 리더 방식 선택(방명록은 평면)
│   └── Guestbook.tsx                # 새로 — 폼 + 목록 (클라이언트 컴포넌트)
├── content/books/guestbook/
│   └── about-guestbook.md           # 안내문 문구 갱신
├── lib/
│   └── guestbook-client.ts          # 새로 — API 호출
└── styles/
    └── guestbook.css                # 새로 — 폼·목록 (기존 토큰만 사용)

deploy/                              # 001 Phase 6 에서 시작, 003 이 확장
├── nginx.conf                       # 001
├── k8s/
│   ├── 00-namespace.yaml            # 001
│   ├── 10-secret.example.yaml       # 003 — DB·판정 키·관리 토큰
│   ├── 15-config.yaml               # 003
│   ├── 50-web.yaml                  # 001 — 정적 nginx
│   ├── 60-api.yaml                  # 003 — 방명록 API
│   └── 70-shared-ingress.yaml       # 001 에서 생성, 003 이 /api 경로 추가
└── ...

Dockerfile                           # 001 — 사이트 정적 빌드 → nginx
.github/workflows/deploy.yml         # 001 에서 생성, 003 이 API 이미지 추가
```

**Structure Decision**: 사이트와 API 를 같은 저장소의 형제 디렉터리로 둔다. 별도 저장소로
나누면 콘텐츠와 API 계약이 어긋날 때 두 곳을 오가야 하고, 개인 사이트에 그만한 분리 이득이
없다. 컨테이너와 배포 단위는 나뉘므로 런타임 결합은 없다.

`api/` 는 사이트 빌드에 포함되지 않는다. 루트 `package.json` 과 별개의 의존성을 가지며,
사이트의 번들 크기에 영향을 주지 않는다.

## 배포 구성 (oneBite 패턴 준용)

| 항목 | oneBite | 이 프로젝트 | 비고 |
|---|---|---|---|
| 네임스페이스 | `onebite` | `portfolio` | 동일 방식 |
| 공용 인그레스 연결 | `default` 의 ExternalName 다리 | 동일 | `jgbak-portfolio-client-service`, `jgbak-portfolio-api-service` |
| 도메인 | `onebite.jgbak-land.com` | `portfolio.jgbak-land.com` | 같은 루트 도메인 |
| TLS | cert-manager `prod-issuer` | 동일 | tls 항목만 추가하면 자동 발급 |
| 이미지 | GHCR `:latest` + `:sha` | 동일 | `ghcr.io/parkjgn/portfolio-web`, `-api` |
| 빌드 | Actions buildx 멀티아치 | 동일 | amd64 + arm64 |
| 데이터베이스 | `onebite` 롤·DB | `portfolio` 롤·DB | **같은 인스턴스, 계정 분리** |
| 기동 대기 | startupProbe 30×10s (JVM 90초) | 불필요 | Node 는 1초 안쪽 |

**경로 분기**: 인그레스에서 `/api` 는 API 서비스로, 나머지는 정적 웹으로 보낸다. oneBite 와
같은 형태다.

**선행 조건**: 001 의 T039–T046 이 끝나 `portfolio.jgbak-land.com` 에 정적 사이트가 떠 있어야
한다(R-1). 003 의 배포 작업은 그 위에 `60-api.yaml` 과 인그레스 `/api` 경로를 더하는 것이다.

## Complexity Tracking

> 원칙 I 이 요구하는 기록이다.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| 런타임 서버와 데이터베이스 도입 (원칙 I) | 방명록은 방문자가 남긴 글을 받아 저장하고 다시 보여줘야 한다. 빌드 시점에 존재하지 않는 데이터라 정적 산출물로는 어떤 방법으로도 충족할 수 없다. 사이트 본문은 그대로 정적이고, API 가 죽어도 책 열람은 영향받지 않는다(FR-019). | **외부 서비스 임베드**(Giscus 등) — 서버를 만들지 않아도 되지만 방명록 내용이 제3자 서비스에 살게 되어 "콘텐츠가 제3자 서비스에만 존재해서는 안 된다"는 제약을 정면으로 어긴다. iframe 이라 책 안의 디자인과도 섞이지 않는다. **정적 재빌드**(글이 올 때마다 CI 로 사이트를 다시 빌드) — 정적을 유지하지만 글이 뜨기까지 몇 분이 걸려 SC-002(3초)를 못 맞추고, 방문자 글이 저장소 커밋으로 남아 삭제가 이력에 영원히 남는다. |
| 방문자 글이 서버 렌더 HTML 로 존재하지 않음 (원칙 I) | 원칙 I 은 읽는 사람을 향한 모든 내용이 전달된 문서 안에 서버 렌더 HTML 로 있기를 요구한다. 런타임에 도착하는 글은 빌드 시점에 없으므로 불가능하다. 잃는 것은 검색 색인이며, 방문자 방명록은 색인될 가치가 낮다. **접근성은 잃지 않는다** — 낭독기는 소스가 아니라 실행 후 DOM 을 읽으므로, 받아 온 글을 DOM 에 넣으면 그대로 읽힌다. | **글을 빌드 시점에 마크다운으로 커밋** — 위와 같은 이유로 기각. **첫 화면에 서버 렌더로 일부라도 넣기** — 정적 export 라 빌드 이후 갱신 수단이 없어 항상 낡은 목록을 보여주게 된다. |

## 설계 후 헌장 재점검

Phase 1 산출물(data-model.md · contracts/ · quickstart.md)을 작성한 뒤 다시 본 결과, 위
판정에서 달라진 것이 없다. 확인한 것:

- **원칙 II** — 계약에 담긴 오류 응답이 모두 사람이 읽을 문구를 포함한다. 폼은 라벨·설명·
  오류를 프로그램적으로 연결하고, 전송 결과를 `aria-live` 로 알린다.
- **원칙 IV** — 계약의 검증 규칙이 그대로 Vitest 대상이 된다. 세 겹 방어는 각각 순수 함수로
  분리해 외부 호출 없이 테스트할 수 있게 설계했다(3층만 경계에서 모킹).
- **원칙 V** — 데이터 모델에 표시용 값을 넣지 않았다. 상태는 `공개·보류·삭제` 세 값이고
  화면 문구는 사이트 쪽 토큰과 문자열로 정한다.
- **개인정보** — 데이터 모델에 원문 IP 컬럼이 없다. 해시와 만료 시각만 있다.
