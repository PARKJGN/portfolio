---

description: "Task list for 방·책장·책 모달 골격"
---

# Tasks: 방·책장·책 모달 골격

**Input**: Design documents from `/specs/001-room-bookshelf-shell/`

**Prerequisites**: plan.md · spec.md · research.md · data-model.md · contracts/ · quickstart.md · design-notes.md

**Tests**: 테스트 과제가 포함되어 있다. 이 프로젝트에서는 선택 사항이 아니다 — 헌장 원칙 IV가
로직(스키마 검증·슬러그 해석·모드 상태)에 대한 자동 테스트를 요구하고, 원칙 II·III가 접근성·성능
검사를 머지 게이트로 못 박았기 때문이다. 다만 표현용 마크업의 스냅샷 테스트는 만들지 않는다.

**Organization**: 사용자 스토리별로 묶어, 각 스토리를 독립적으로 구현하고 검증할 수 있게 한다.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 병렬 실행 가능 (다른 파일, 선행 의존 없음)
- **[Story]**: 소속 사용자 스토리 (US1, US2, US3)
- 설명에 정확한 파일 경로를 포함한다

## Path Conventions

단일 프로젝트 구조. 저장소 루트 기준 `src/`, `tests/`, `deploy/`, `scripts/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: 프로젝트 초기화

- [x] T001 Next.js 14 프로젝트를 App Router·TypeScript로 초기화하고 `output: 'export'`를 설정 — `package.json`, `next.config.mjs`, `tsconfig.json`
- [x] T002 [P] Tailwind CSS 3.4 설치 및 설정 — `tailwind.config.js`, `postcss.config.mjs`
- [x] T003 [P] ESLint·Prettier 설정에 **임의값 클래스 금지 규칙**(`bg-[#...]` 형태 차단) 추가 — `.eslintrc.json` (헌장 원칙 V)
- [x] T004 [P] Vitest 설정 — `vitest.config.ts`
- [x] T005 [P] Playwright와 axe-core 설정 — `playwright.config.ts`
- [x] T006 [P] `.gitignore`에 `node_modules/`, `.next/`, `out/` 반영 확인 — `.gitignore`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 모든 사용자 스토리가 의존하는 기반

**⚠️ CRITICAL**: 이 단계가 끝나기 전에는 어떤 사용자 스토리도 시작할 수 없다

### 🚨 성능 예산 게이트 — 다른 모든 작업보다 먼저

- [x] T007 **폐기용 최소 스텁 페이지**를 만들어 정적 export로 빌드하고 `/`와 `/books/[slug]`의 First Load JS와 압축 크기를 실측한 뒤, 결과를 `specs/001-room-bookshelf-shell/research.md`의 R-1에 기록 — `src/app/page.tsx`, `src/app/books/[slug]/page.tsx`
  - **이 스텁은 측정 전용이다.** 실제 방과 책 페이지는 T021·T022에서 만든다. 여기서는 클라이언트 컴포넌트 1개(책 창을 흉내낸 빈 `<dialog>`)를 포함한 최소 형태로만 만들어, 실제 구성에 근접한 번들 크기를 잰다
  - **100KB 이하** → 헌장 유지. T016에서 이 수치를 예산으로 고정
  - **초과** → 클라이언트 컴포넌트 축소 여지를 먼저 확인하고, 그래도 넘으면 **여기서 작업을 멈추고** 실측값을 근거로 헌장 원칙 III의 MAJOR 개정 여부를 결정한다. 초과 상태로 T008 이후를 진행하지 않는다
  - **개정을 택한 경우 후속 처리까지 이 태스크에 포함된다**: `.specify/memory/constitution.md` 개정(버전 상승 + Sync Impact Report 갱신), `plan.md`의 헌장 점검 표와 설계 후 재점검 표에서 원칙 III 판정 갱신, T016의 예산 수치 조정. 셋 중 하나라도 빠지면 문서와 실제가 어긋난다

### 디자인 토큰과 콘텐츠 기반

- [x] T008 `design-notes.md`의 책등 색 9종과 목재·양피지 색을 이름 있는 토큰으로 정의(라이트/다크 모두) — `src/styles/tokens.css`
- [x] T009 Tailwind 테마가 `tokens.css`의 변수를 참조하도록 매핑 — `tailwind.config.js`
- [ ] T010 [P] 콘텐츠에서 사용된 글자만 추출해 한글 폰트를 서브셋하는 빌드 스크립트 작성 — `scripts/subset-fonts.mjs` (R-4)
- [x] T011 [P] `contracts/content-schema.md`의 규칙을 Zod 스키마로 구현(책장 3개, slug 고유, 허용 토큰, 빈 본문 금지) — `src/lib/schema.ts`
- [x] T012 책장·책 마크다운을 읽고 파생 데이터(책장별 목록, 이전/다음, 정적 경로)를 계산하는 로더 — `src/lib/content.ts`
- [x] T013 [P] 스키마 검증 단위 테스트 — `tests/unit/schema.test.ts`
- [x] T014 [P] 콘텐츠 로더 단위 테스트(slug 중복·order 중복·빈 본문이 빌드를 실패시키는지) — `tests/unit/content.test.ts`
- [x] T015 루트 레이아웃에 `lang="ko"`, 서브셋 폰트, 토큰 스타일 연결 — `src/app/layout.tsx`
- [x] T016 Lighthouse CI 설정에 헌장 원칙 III 수치(LCP < 2.5s · CLS < 0.1 · INP < 200ms)를 예산으로 고정 — `lighthouserc.json` (JS 용량 상한은 v2.0.0에서 삭제되어 게이트에 넣지 않는다)

**Checkpoint**: 기반 완료 — 사용자 스토리 착수 가능

---

## Phase 3: User Story 1 — 방에 들어와 책을 열어보기 (Priority: P1) 🎯 MVP

**Goal**: 방문자가 책장 세 개를 알아보고, 책을 열어 읽고, 닫고 돌아온다

**Independent Test**: 사전 설명 없이 링크만 받은 사람에게 "자기소개를 찾아보라"고 요청해, 안내 없이 책장을 고르고 책을 열어 내용에 도달하는지 관찰한다

### 콘텐츠

- [x] T017 [P] [US1] 책장 3개(프로필·프로젝트·방명록) 정의 파일 작성 — `src/content/shelves/profile.md`, `project.md`, `guestbook.md`
- [ ] T018 [US1] 프로필 책 1권을 실제 내용으로 작성 — `src/content/books/profile/<slug>.md` (FR-022)

### 화면

- [x] T019 [P] [US1] 책등 컴포넌트(세로 조판, 연도·청구기호, 높이·너비 변주) — `src/components/room/BookSpine.tsx`
- [x] T020 [P] [US1] 책장 컴포넌트(제목, 책 목록, **빈 상태 처리**) — `src/components/room/Shelf.tsx` (FR-014)
- [x] T021 [US1] 방 페이지에 책장 3개 배치와 배경 표현 — `src/app/page.tsx` (FR-001, FR-002, FR-003)
- [x] T022 [US1] 책 단독 페이지와 `generateStaticParams` 구현 — `src/app/books/[slug]/page.tsx` (FR-012, R-3)
- [x] T023 [US1] 네이티브 `<dialog>` 기반 책 창 — `src/components/book/BookDialog.tsx` (FR-004, FR-005, FR-006, FR-013)
  - `showModal()`로 열어 Esc 닫기·포커스 트랩·배경 비활성화·초점 복원을 브라우저에 맡긴다
  - **닫기 버튼과 바깥 영역 클릭 닫기는 직접 구현해야 한다.** `<dialog>`는 `::backdrop` 클릭을 처리하지 않는다 (research.md R-5). 이 둘을 빠뜨리면 FR-005의 세 방법 중 두 개가 누락된다
- [x] T024 [US1] 책 링크를 가로채 모달로 띄우고 `history.pushState`로 주소를 바꾸는 향상 — `src/components/book/BookLinkInterceptor.tsx` (R-3)

### 검증

- [x] T025 [P] [US1] E2E: JavaScript를 끈 상태에서 모든 책 내용에 도달하는지 — `tests/e2e/no-js.spec.ts` (quickstart 검증 2, 헌장 원칙 I)
- [x] T026 [P] [US1] E2E: 열기·Esc 닫기·초점 복원·딥링크 진입 — `tests/e2e/book-open.spec.ts`

**Checkpoint**: US1만으로도 공유 가능한 사이트가 된다 — 여기서 멈추고 배포해도 된다

---

## Phase 4: User Story 2 — 읽는 방식 고르기 (Priority: P2)

**Goal**: 한 장씩 넘기기와 전체 이어보기를 오가며, 선택이 다음 책에도 유지된다

**Independent Test**: 책을 연 뒤 두 방식을 번갈아 전환하며 같은 내용이 빠짐없이 보이는지, 다른 책을 열었을 때 선택이 유지되는지 확인한다

- [x] T027 [P] [US2] 두 보기 모드를 CSS 다단 + 스크롤 스냅으로 구현(같은 DOM, 클래스만 전환) — `src/styles/book-view.css` (R-2, FR-007, FR-011)
- [x] T028 [US2] 보기 모드 전환 UI와 `localStorage` 저장·복원 — `src/components/book/ViewModeToggle.tsx` (FR-008, FR-009)
- [x] T029 [US2] 현재 위치와 전체 분량 표시, 앞뒤 이동 수단 — `src/components/book/PageIndicator.tsx` (FR-010)
- [x] T030 [US2] 표·이미지가 단 경계를 넘지 않도록 `break-inside: avoid` 적용 — `src/styles/book-view.css` (R-2 잔여 위험)
- [x] T031 [P] [US2] 모드 상태 단위 테스트(기본값, 알 수 없는 값 복구, `localStorage` 불가 환경) — `tests/unit/view-mode.test.ts`
- [x] T032 [P] [US2] E2E: 두 모드 전환·다른 책에서 유지·창 크기 변경 시 읽던 위치 보존 — `tests/e2e/view-mode.spec.ts`

**Checkpoint**: US1과 US2가 각각 독립적으로 동작한다

---

## Phase 5: User Story 3 — 마우스 없이, 작은 화면에서도 읽기 (Priority: P3)

**Goal**: 키보드·낭독기·320px 화면에서 동일한 내용에 도달한다

**Independent Test**: 마우스를 뽑고 방 진입부터 특정 책의 마지막 장까지 도달해 보고, 낭독기로 같은 경로를 따라간다

- [ ] T033 [P] [US3] 좁은 화면에서 책장 가로 스와이프를 CSS 스크롤 스냅으로 구현 — `src/components/room/ShelfCarousel.tsx` (FR-018, R-6)
- [ ] T034 [US3] 책장 바로가기 링크 목록으로 키보드 이동 경로 확보, 현재 위치 표시 — `src/components/room/ShelfNav.tsx` (FR-019)
- [ ] T035 [P] [US3] `prefers-reduced-motion`에서 책 열기·장 넘김 연출 제거 — `src/styles/motion.css` (FR-016)
- [ ] T036 [US3] 320px~1920px 전 구간에서 페이지 가로 스크롤이 없도록 조정 — `src/app/page.tsx`, `src/styles/` (FR-017)
- [ ] T037 [P] [US3] E2E: 키보드만으로 방 진입 → 책장 이동 → 책 열기 → 마지막 장 → 닫기 — `tests/e2e/keyboard.spec.ts`
- [ ] T038 [P] [US3] E2E: axe 접근성 검사를 방·책 페이지·열린 모달 각각에 적용해 위반 0건 확인 — `tests/e2e/a11y.spec.ts` (헌장 원칙 II)

**Checkpoint**: 세 스토리 모두 독립적으로 동작한다

---

## Phase 6: 배포와 방문 기록

**Purpose**: 라즈베리파이 arm64 클러스터에 올리고 접근 기록을 남긴다 (oneBite 패턴 준용, R-9)

- [ ] T039 중앙 인그레스의 기존 호스트 목록을 확인해 `portfolio` 이름 충돌 여부 점검 (`kubectl -n default get ingress ingress-host -o yaml`) 후 결과를 `specs/001-room-bookshelf-shell/plan.md` 배포 절에 기록
- [ ] T040 [P] 멀티스테이지 Dockerfile 작성(빌드 → 정적 산출물을 `nginx:alpine`으로) — `Dockerfile`
- [ ] T041 [P] nginx 설정에 정적 export 경로 처리와 접근 로그 형식 정의(stdout 출력) — `deploy/nginx.conf` (R-9)
- [ ] T042 k8s 매니페스트 작성(Namespace `portfolio`, Deployment, Service 80→80) — `deploy/k8s/00-namespace.yaml`, `deploy/k8s/50-web.yaml`
- [ ] T043 `default` 네임스페이스 ExternalName 다리와 중앙 인그레스에 추가할 host·tls 블록을 주석으로 명시 — `deploy/k8s/60-shared-ingress.yaml` (도메인 `portfolio.jpark-playground.com`)
- [ ] T044 GitHub Actions 워크플로 작성(GHCR 푸시, buildx **linux/amd64 + linux/arm64**, `:latest`와 `:sha` 두 태그) — `.github/workflows/deploy.yml`
- [ ] T045 Grafana에 방문 기록 대시보드 생성(경로별 요청 수, 시간대별 추이, 책별 열람 수) — `deploy/grafana/portfolio-dashboard.json` (R-9)
- [ ] T046 배포 후 확인: 도메인 접속, 인증서 발급, `/books/<slug>` 직접 접속 시 정상 응답 — `specs/001-room-bookshelf-shell/quickstart.md`의 배포 확인 절 수행

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T047 실제 화면 완성 후 LCP·CLS·INP 재측정하고 LHCI 게이트 최종 고정 — `lighthouserc.json`
- [ ] T048 `quickstart.md`의 검증 1~7을 처음부터 끝까지 수행하고 결과 기록 — `specs/001-room-bookshelf-shell/quickstart.md`
- [ ] T049 새 책 1권을 파일 하나만 추가해 방에 나타나는지 확인(FR-015·SC-007 검증) — `src/content/books/profile/`
- [ ] T050 [P] 낭독기로 방·책 모달을 수동 확인(자동 검사가 못 잡는 순서·맥락) — 수동 검증
- [ ] T051 [P] 프로젝트 README 작성(개발·빌드·배포·콘텐츠 추가 방법) — `README.md`

### 사용자 관찰 테스트 (자동화 불가 — 사람이 해야 한다)

- [ ] T052 사전 설명 없이 링크만 받은 사람 5명에게 관찰 테스트를 수행하고 결과를 기록 — `specs/001-room-bookshelf-shell/quickstart.md`에 결과 절 추가 (SC-001, SC-002)
  - 각 참가자에게 URL만 전달하고 아무 설명도 하지 않는다
  - **측정 1 (SC-001)**: 첫 책을 여는 데 걸린 시간. 5명 중 4명 이상이 10초 이내여야 한다
  - **측정 2 (SC-002)**: 세 책장이 각각 무엇에 관한 것인지 물어 맞히는지 확인. 5명 중 4명 이상이 셋 다 맞혀야 한다
  - 기준 미달 시 어디서 막혔는지 기록한다 — 책장 제목의 가시성, 책이 눌리는 요소로 보이는지, 첫 화면 정보량이 주된 후보다
- [ ] T053 T052 결과가 기준에 미달한 경우 방 화면을 조정하고 재측정 — `src/app/page.tsx`, `src/components/room/` (SC-001, SC-002)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: 의존 없음 — 즉시 시작
- **Foundational (Phase 2)**: Setup 완료 후 — **모든 사용자 스토리를 막는다**
  - **T007이 Phase 2 안에서도 최우선이다.** 결과에 따라 프로젝트 전체 방향이 바뀔 수 있다
- **User Stories (Phase 3~5)**: Foundational 완료 후 — 우선순위 순서(P1 → P2 → P3) 또는 병렬
- **배포 (Phase 6)**: US1 완료 후면 언제든 가능 — MVP를 먼저 띄우고 US2·US3를 이어 붙여도 된다
- **Polish (Phase 7)**: 원하는 스토리가 모두 끝난 뒤

### User Story Dependencies

- **US1 (P1)**: Foundational 이후 시작. 다른 스토리에 의존하지 않는다
- **US2 (P2)**: Foundational 이후 시작 가능. 책 창(T023)이 있어야 실제로 확인되므로 US1과 함께 보는 편이 자연스럽다
- **US3 (P3)**: Foundational 이후 시작 가능. 방(T021)과 책 창(T023)에 접근성 경로를 덧붙이는 성격이라 US1 이후가 효율적이다

### Within Each User Story

- 콘텐츠 → 컴포넌트 → 페이지 조립 → E2E 검증
- 단위 테스트는 대상 로직과 함께, E2E는 화면이 붙은 뒤

### Parallel Opportunities

- Setup: T002·T003·T004·T005·T006 동시 가능
- Foundational: T010·T011·T013·T014 동시 가능 (단 T007 통과 후)
- US1: T017·T019·T020 동시 가능 / T025·T026 동시 가능
- US2: T031·T032 동시 가능
- US3: T033·T035 동시 가능 / T037·T038 동시 가능
- 배포: T040·T041 동시 가능

---

## Parallel Example: User Story 1

```bash
# 콘텐츠와 표현 컴포넌트를 동시에
Task: "책장 3개 정의 파일 작성 in src/content/shelves/"
Task: "책등 컴포넌트 in src/components/room/BookSpine.tsx"
Task: "책장 컴포넌트 in src/components/room/Shelf.tsx"

# 페이지가 붙은 뒤 E2E 두 개를 동시에
Task: "E2E JS 없이 읽기 in tests/e2e/no-js.spec.ts"
Task: "E2E 열기·닫기·초점 in tests/e2e/book-open.spec.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1만)

1. Phase 1 Setup 완료
2. Phase 2 Foundational 완료 — **T007에서 예산을 통과해야 계속 진행**
3. Phase 3 US1 완료
4. **멈추고 검증**: 사전 설명 없는 사람에게 링크를 주고 자기소개를 찾게 한다
5. Phase 6으로 건너뛰어 배포해도 된다 — 이 시점의 사이트는 이미 공유 가능하다

### Incremental Delivery

1. Setup + Foundational → 기반 완성
2. US1 추가 → 독립 검증 → 배포 (**MVP**)
3. US2 추가 → 독립 검증 → 배포
4. US3 추가 → 독립 검증 → 배포
5. 각 단계가 이전 단계를 깨지 않는다

---

## Notes

- **T007은 게이트다.** 예산을 넘으면 다음 작업으로 넘어가지 말고 헌장 개정 여부를 먼저 결정한다. 헌장은 예산 완화를 MAJOR 개정으로 규정하고 있다. 개정을 택하면 헌장·plan·T016 세 곳을 함께 갱신해야 한다
- **T052는 자동화할 수 없다.** SC-001·SC-002는 "처음 보는 사람이 안내 없이 알아보는가"를 묻기 때문에, 이미 구조를 아는 사람이 하면 측정 자체가 무의미해진다. 실제 참가자 5명이 필요하다
- 두 보기 모드(T027)를 CSS로 처리하기로 한 결정 덕분에 접근성 대안 경로를 따로 만들 필요가 없다. 이 결정을 JS 기반으로 되돌리면 US3의 작업량이 늘어난다
- 네이티브 `<dialog>`(T023)를 직접 만든 오버레이로 바꾸면 FR-005·FR-006·FR-013을 각각 구현해야 한다
- 방 배경을 이미지로 낼지 CSS로 그릴지는 T021에서 결정한다 (research.md 미해결 항목)
- 방명록 책장은 001에서 비어 있는 상태로 둔다. 저장소가 필요한 글쓰기는 003의 몫이다
- 커밋은 작업 단위 또는 논리적 묶음마다
