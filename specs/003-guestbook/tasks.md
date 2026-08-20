---

description: "Task list for 003 방명록"
---

# Tasks: 방명록

**Input**: Design documents from `/specs/003-guestbook/`

**Prerequisites**: plan.md · spec.md · research.md · data-model.md · contracts/guestbook-api.md · quickstart.md

**Tests**: 포함한다. 사용자가 따로 요청해서가 아니라 **헌장 원칙 IV** 가 요구하기 때문이다 —
"입력 검증과 제출, 데이터 변환, 라우팅, 공용 유틸리티"는 REQUIRED 대상이다. 방명록의 세 겹
방어와 입력 검증이 정확히 그 범주다. 반면 폼과 목록의 겉모습은 테스트하지 않고 검사 도구와
리뷰로 대체한다(같은 원칙).

**Organization**: 사용자 이야기별로 묶어 각각 따로 만들고 따로 검증할 수 있게 한다.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 병렬 가능(다른 파일, 선행 의존 없음)
- **[Story]**: 어느 사용자 이야기에 속하는가 (US1, US2, US3)
- 설명에 정확한 파일 경로를 적는다

## Path Conventions

- **API**(새로 생김): `api/src/`, `api/tests/`, `api/migrations/`
- **사이트**(기존): `src/`, `tests/e2e/`
- **배포**: `deploy/k8s/`, `.github/workflows/`

---

## Phase 0: 선행 — 001 배포 파이프라인

**Purpose**: 방명록을 얹을 바닥을 먼저 깐다. 위험을 분리하기 위해서다(research.md R-1) —
DNS·인증서·인그레스가 막히는 것과 API·DB 가 막히는 것을 같이 겪지 않는다.

**⚠️ 이 단계가 끝나기 전에는 Phase 6(배포)을 시작할 수 없다.** Phase 1~5(개발)는 로컬에서
진행할 수 있으므로 병행해도 된다.

- [ ] T001 001 의 배포 파이프라인 T039–T046 을 수행하고 `specs/001-room-bookshelf-shell/tasks.md` 에 체크 — 여기서 다시 나열하지 않는다(진실의 출처는 그 파일 하나)
- [ ] T002 `portfolio.jgbak-land.com` 에서 정적 사이트 표시와 인증서 발급을 확인하고 결과를 `specs/003-guestbook/quickstart.md` 의 검증 7 표에 기록

**Checkpoint**: 도메인에 사이트가 떠 있다. 이제 새로 생기는 변수는 API 하나뿐이다.

---

## Phase 1: Setup (API 뼈대)

**Purpose**: `api/` 를 만들고 도구를 건다. 사이트 빌드와는 완전히 분리된 별개 패키지다.

- [x] T003 [P] `api/` 를 만들고 Node 22 · ESM · TypeScript 5.5 로 초기화 — `api/package.json`, `api/tsconfig.json`
- [x] T004 [P] 런타임 의존성 설치(fastify 5, @fastify/cors, @fastify/rate-limit, pg, @anthropic-ai/sdk)와 개발 의존성(typescript, tsx, vitest) — `api/package.json`
- [x] T005 [P] 린트·포맷을 루트 규칙과 맞춘다 — `api/eslint.config.mjs`
- [x] T006 [P] Vitest 설정(노드 환경, `api/tests/**`) — `api/vitest.config.ts`
- [x] T007 [P] 환경변수 예시 작성(DB 접속·ANTHROPIC_API_KEY·ADMIN_TOKEN·CLIENT_HASH_SALT·ALLOWED_ORIGIN) — `api/.env.example`
- [x] T008 [P] 멀티스테이지 Dockerfile(`node:22-alpine`, 비루트 사용자, 프로덕션 의존성만) — `api/Dockerfile`

---

## Phase 2: Foundational (모든 이야기의 전제)

**Purpose**: 데이터베이스에 닿고 서버가 뜨는 최소 골격. 어느 이야기도 이것 없이는 못 만든다.

**⚠️ CRITICAL**: 이 단계가 끝나기 전에는 사용자 이야기 작업을 시작할 수 없다.

- [ ] T009 (클러스터 접근 필요 — 로컬 DB 로는 검증 완료 — 로컬 대체물 `api/docker-compose.dev.yml` 은 준비됨) 공유 PostgreSQL 에 `portfolio` 롤과 데이터베이스를 만든다(`quickstart.md` 준비 1단계). 초기화 스크립트는 최초 기동에만 도므로 수동 절차다 — 절차를 `deploy/k8s/60-api.yaml` 주석에도 남긴다
- [x] T010 환경변수를 읽고 검증한다. 하나라도 없으면 기동을 실패시킨다 — `api/src/config.ts`
- [x] T011 pg 커넥션 풀과 종료 처리 — `api/src/db/pool.ts`
- [x] T012 번호 붙은 SQL 을 순서대로 적용하는 마이그레이션 러너(`schema_migrations` 대조) — `api/src/db/migrate.ts`
- [x] T013 초기 스키마 — `api/migrations/001_init.sql` (`guestbook_entry`·`abuse_mark`·인덱스, data-model.md 그대로)
- [x] T014 Fastify 인스턴스와 플러그인 등록, CORS 는 `ALLOWED_ORIGIN` 만 허용 — `api/src/server.ts`
- [x] T015 공통 오류 응답 규격(`error`·`message`·`retryAfter`). `message` 는 방문자에게 그대로 보여도 되는 문구여야 한다 — `api/src/errors.ts`
- [x] T016 `GET /api/health` — DB 에 닿으면 200, 못 닿으면 503 — `api/src/routes/health.ts`
- [x] T017 로깅 설정 — **글 내용과 이름을 로그에 남기지 않는다**(지워도 로그에 남는다) — `api/src/server.ts`

**Checkpoint**: `npm run dev` 로 서버가 뜨고 `/api/health` 가 `{"ok":true}` 를 준다.

---

## Phase 3: User Story 1 - 한마디 남기고 바로 확인한다 (Priority: P1) 🎯 MVP

**Goal**: 방문자가 방명록 책장에서 글을 남기면 새로고침 없이 목록에 나타나고, 다시 와도 남아 있다.

**Independent Test**: 로컬에서 글을 남기고 새로고침·API 재시작 후에도 남아 있는지 확인
(`quickstart.md` 검증 1). 스크립트를 적어 남겨도 실행되지 않는지 확인(검증 2).

### Tests for User Story 1

- [x] T018 [P] [US1] 입력 검증 테스트 — 길이 경계(1·20·21자, 1·500·501자), 앞뒤 공백 제거, 필수값 누락 — `api/tests/validation.test.ts`
- [x] T019 [P] [US1] 목록·남기기 라우트 계약 테스트 — 응답 형태, 커서 이어 읽기, 오류 코드 — `api/tests/routes.entries.test.ts`

### Implementation for User Story 1

- [x] T020 [P] [US1] 글 질의 — 목록(`status='visible'`, `before` 커서, `limit`), 삽입 — `api/src/db/entries.ts`
- [x] T021 [US1] 요청 본문 JSON Schema 와 정규화(앞뒤 공백 제거) — `api/src/routes/entries.ts`
- [x] T022 [US1] `GET /api/guestbook/entries` 구현 — `api/src/routes/entries.ts`
- [x] T023 [US1] `POST /api/guestbook/entries` 구현 — 이 단계에서는 방어 없이 저장한다(방어는 US2) — `api/src/routes/entries.ts`
- [x] T024 [US1] 책 프론트매터에 리더 방식 필드를 더한다(`reader: '3d' | 'flat'`, 기본 `3d`) — `src/lib/schema.ts`
- [x] T025 [US1] 방명록 책만 3D 를 켜지 않고 평면 모달로 열도록 분기 — `src/components/book/BookController.tsx` (research.md R-2)
  - ~~되돌림 (2026-08-01)~~ — R-2 가 뒤집혀 방명록도 3D 로 연다. 분기(`readerMode === 'flat'`)
    자체는 남아 있으나 **이 값을 쓰는 책은 이제 없다.** 3D 가 한 면을 비우고 그 위에 폼을
    얹는 방식으로 바뀌었다(T024 의 `reader` 필드도 같은 이유로 쓰이지 않는다).
- [x] T026 [P] [US1] API 호출 모듈(목록·남기기, 실패 구분) — `src/lib/guestbook-client.ts`
- [x] T027 [US1] 폼과 목록 컴포넌트 — 글은 `textContent` 로 넣고, 결과를 `aria-live` 로 알리고, 실패해도 적던 내용을 보존한다 — `src/components/book/Guestbook.tsx`
- [x] T028 [US1] 방명록 책 본문에 컴포넌트를 배치 — `src/components/book/BookContent.tsx`
- [x] T029 [P] [US1] 폼·목록 스타일. **방문자 글과 입력칸만 시스템 글꼴**로 둔다(서브셋에 없는 글자가 빈 네모가 되므로) — `src/styles/guestbook.css` (research.md R-3)
- [x] T030 [US1] 안내문을 현재 상태에 맞게 고친다 — "준비가 끝나면 진짜 방명록이 놓인다"는 약속이 지켜졌다 — `src/content/books/guestbook/about-guestbook.md`
- [x] T031 [P] [US1] E2E — 남기고 새로고침 후에도 목록에 있다 — `tests/e2e/guestbook.spec.ts`
- [x] T032 [US1] E2E — 스크립트·태그·마크다운을 적어 남겨도 글자 그대로 보인다 — `tests/e2e/guestbook.spec.ts`

**Checkpoint**: 방명록이 동작한다. **다만 아직 공개 배포하지 않는다** — 방어 없는 공개
쓰기 엔드포인트는 며칠이면 광고로 뒤덮인다. 공개의 전제는 User Story 2 다.

---

## Phase 4: User Story 2 - 스팸과 욕설이 저절로 걸러진다 (Priority: P2)

**Goal**: 봇·광고·욕설이 방문자 눈에 닿기 전에 걸러지고, 애매한 것만 보류로 모인다.

**Independent Test**: 봇처럼 동작하는 요청과 광고성·욕설 문구를 넣어 어느 것도 목록에
나타나지 않는지 확인(`quickstart.md` 검증 3). **판정 키를 일부러 틀리게 하고 멀쩡한 글이
보류로 가는지**가 이 이야기에서 가장 중요한 확인이다.

### Tests for User Story 2

- [x] T033 [P] [US2] 1층 테스트 — 숨은 칸이 채워진 요청, 폼을 연 지 3초 미만 제출 — `api/tests/guard.bot.test.ts`
- [x] T034 [P] [US2] 2층 테스트 — 링크 3개, 같은 문자 30회 반복, 24시간 내 중복 — `api/tests/guard.rules.test.ts`
- [x] T035 [P] [US2] 3층 테스트 — 판정 실패·시간 초과가 **공개가 아니라 보류**로 떨어지는지 (FR-013) — `api/tests/guard.verdict.test.ts`

### Implementation for User Story 2

- [x] T036 [P] [US2] 1층 봇 판별(순수 함수) — `api/src/guard/bot.ts`
- [x] T037 [P] [US2] 2층 규칙(순수 함수, data-model.md 의 검증 규칙) — `api/src/guard/rules.ts`
- [x] T038 [US2] 3층 Claude 판정 — 구조화된 `공개/보류/차단`과 사유를 받고, 시간 초과·오류는 보류로 — `api/src/guard/verdict.ts`
- [x] T039 [US2] 남용 기록 질의 — 소금 섞은 해시 저장·시간당 집계·만료 정리 (원문 주소를 저장하지 않는다) — `api/src/db/abuse.ts`
- [x] T040 [US2] `@fastify/rate-limit` 등록(순간 폭주)과 DB 기반 시간당 제한(재시작 후에도 유지) — `api/src/server.ts`, `api/src/routes/entries.ts`
- [x] T041 [US2] POST 경로에 세 겹을 연결 — 봇은 201 을 주되 저장하지 않고, 규칙·판정에 걸리면 `held` 로 저장 — `api/src/routes/entries.ts`
- [x] T042 [US2] 폼에 숨은 칸(`website`)과 `openedAt` 을 넣고, **판정을 위해 외부로 전송된다는 고지**를 남기기 전에 보이게 한다 (FR-014) — `src/components/book/Guestbook.tsx`
- [x] T043 [P] [US2] E2E — 규칙 위반 글이 목록에 나타나지 않는다 — `tests/e2e/guestbook.spec.ts`

**Checkpoint**: 공개 배포해도 되는 상태다.

---

## Phase 5: User Story 3 - 주인이 안전망을 손본다 (Priority: P3)

**Goal**: 보류된 글을 확인해 공개하거나 지우고, 공개된 글도 지울 수 있다.

**Independent Test**: 보류된 글을 만들어 두고 토큰으로 공개·삭제해 보고, **토큰 없이는 401**
인지 확인(`quickstart.md` 검증 4).

### Tests for User Story 3

- [x] T044 [P] [US3] 관리 라우트 인증 테스트 — 토큰 없음·틀린 토큰이 401, 없는 글이 404, 잘못된 상태 전이가 409 — `api/tests/routes.admin.test.ts`

### Implementation for User Story 3

- [x] T045 [US3] 관리 토큰 확인 훅 — `api/src/routes/admin.ts`
- [x] T046 [US3] `GET /api/guestbook/held` — 보류 사유와 판정 점수를 함께 준다 — `api/src/routes/admin.ts`
- [x] T047 [US3] `POST /api/guestbook/entries/:id/publish` 와 `DELETE /api/guestbook/entries/:id` — 상태 전이는 data-model.md 를 따른다 — `api/src/routes/admin.ts`
- [x] T048 [P] [US3] 관리 화면 — 토큰을 붙여 넣어 브라우저에 보관하고 보류함을 다룬다 — `src/app/admin/page.tsx`
- [x] T049 [P] [US3] 관리 화면 스타일(기존 토큰만 사용) — `src/styles/guestbook.css`

**Checkpoint**: 세 이야기가 모두 독립적으로 동작한다.

---

## Phase 6: 배포와 마무리

**Purpose**: 만든 것을 띄우고, 여러 이야기에 걸친 마무리를 한다.

**선행**: Phase 0 이 끝나 있어야 한다.

- [x] T050 [P] API 매니페스트 — Deployment(자원 상한·프로브·비루트)와 Service(80→8080) — `deploy/k8s/60-api.yaml`
- [x] T051 [P] Secret 예시와 ConfigMap — 실제 값은 커밋하지 않는다 — `deploy/k8s/10-secret.example.yaml`, `deploy/k8s/15-config.yaml`
- [x] T052 중앙 인그레스에 `/api` 경로와 `jgbak-portfolio-api-service` ExternalName 다리를 더한다 — `deploy/k8s/70-shared-ingress.yaml`
- [x] T053 CI 에 API 이미지 빌드·푸시를 더한다(멀티아치 amd64+arm64, `:latest`·`:sha`) — `.github/workflows/deploy.yml`
- [x] T054 [P] 만료된 남용 기록을 주기적으로 지운다 — `api/src/db/abuse.ts`
- [x] T055 [P] 방명록 화면 axe 검사를 더한다 — `tests/e2e/a11y.spec.ts`
- [x] T056 목록이 도착하며 높이가 튀지 않는지(CLS) 확인하고 필요하면 자리를 미리 잡는다 — `src/styles/guestbook.css`, `lighthouserc.json`
- [ ] T057 `quickstart.md` 의 검증 1~7 을 처음부터 끝까지 수행하고 확인 기록 표를 채운다 — `specs/003-guestbook/quickstart.md`
- [x] T058 [P] README 에 API 실행·마이그레이션·배포 절을 더한다 — `README.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 0 (선행 배포)**: 즉시 시작 가능. **Phase 6 을 막는다.** Phase 1~5 와는 병행 가능
- **Phase 1 (Setup)**: 즉시 시작 가능
- **Phase 2 (Foundational)**: Phase 1 이후. **모든 사용자 이야기를 막는다**
- **Phase 3~5 (사용자 이야기)**: Phase 2 이후. 우선순위대로 또는 병렬
- **Phase 6 (배포·마무리)**: Phase 0 과 원하는 이야기들이 끝난 뒤

### User Story Dependencies

- **US1 (P1)**: Phase 2 이후 바로. 다른 이야기에 의존하지 않는다
- **US2 (P2)**: Phase 2 이후 시작 가능하지만, T041(세 겹 연결)과 T042(폼)는 **US1 의 T023·T027 이 있어야** 붙일 자리가 생긴다. 방어 로직 자체(T036~T039)는 순수 함수라 US1 과 무관하게 만들고 테스트할 수 있다
- **US3 (P3)**: Phase 2 이후 바로. 보류된 글을 다루므로 검증에는 US2 가 만든 상태가 편하지만, 손으로 `held` 행을 넣으면 US2 없이도 검증된다

### Within Each User Story

- 테스트를 먼저 쓰고 실패를 확인한 뒤 구현한다
- 질의 → 라우트 → 화면 순서
- 순수 함수(방어 로직)를 먼저, 경계에 붙이는 것을 나중에

### Parallel Opportunities

- Phase 1 의 T003~T008 은 전부 병렬
- Phase 3 의 테스트 둘(T018·T019)은 병렬
- Phase 4 의 테스트 셋(T033~T035)과 순수 함수 둘(T036·T037)은 병렬
- Phase 6 의 T050·T051·T054·T055·T058 은 병렬
- 사람이 여럿이면 Phase 2 이후 US1·US2 방어 로직·US3 을 나눠 맡을 수 있다

---

## Parallel Example: User Story 2

```bash
# 방어 계층 테스트를 함께 띄운다 (서로 다른 파일, 의존 없음)
Task: "1층 테스트 in api/tests/guard.bot.test.ts"
Task: "2층 테스트 in api/tests/guard.rules.test.ts"
Task: "3층 테스트 in api/tests/guard.verdict.test.ts"

# 순수 함수 둘을 함께 만든다
Task: "1층 봇 판별 in api/src/guard/bot.ts"
Task: "2층 규칙 in api/src/guard/rules.ts"
```

---

## Implementation Strategy

### MVP (User Story 1 까지)

1. Phase 1 Setup
2. Phase 2 Foundational — **모든 것을 막으므로 여기서 멈추지 않는다**
3. Phase 3 User Story 1
4. **멈추고 검증**: `quickstart.md` 검증 1·2 를 수행한다
5. **공개 배포하지 않는다.** 로컬 또는 비공개로만 확인한다

### 공개까지 (User Story 2)

6. Phase 4 User Story 2
7. **멈추고 검증**: 검증 3 — 특히 판정 실패가 보류로 떨어지는지
8. Phase 0 이 끝나 있으면 Phase 6 의 배포 작업으로 공개한다

### 마무리 (User Story 3)

9. Phase 5 User Story 3 — 오탐이 나기 시작하면 바로 필요해진다
10. Phase 6 의 나머지, 검증 1~7 전체 수행

---

## Notes

- [P] 는 다른 파일이고 선행 의존이 없다는 뜻이다
- 각 이야기는 따로 완성하고 따로 검증할 수 있어야 한다
- 테스트가 실패하는 것을 확인한 뒤 구현한다
- 작업 하나 또는 논리적 묶음마다 커밋한다
- **소스나 콘텐츠에 한글을 추가하면 `npm run fonts:build` 를 돌려야 폰트 서브셋 테스트가 통과한다**
- 실제 시크릿 값은 어떤 파일에도 커밋하지 않는다
