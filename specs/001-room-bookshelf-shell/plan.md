# Implementation Plan: 방·책장·책 모달 골격

**Branch**: `001-room-bookshelf-shell` | **Date**: 2026-07-22 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-room-bookshelf-shell/spec.md`

## Summary

방문자가 책장 세 개(프로필·프로젝트·방명록)가 놓인 방에서 책을 골라 열고, "한 장씩 넘기기"와
"전체 이어보기" 두 방식으로 읽는 골격을 만든다. 프로필 책 1권을 실제 내용으로 채워 흐름을 검증한다.

기술적 접근은 **정적 우선**이다. Next.js를 `output: 'export'`로 정적 산출물만 뽑아 nginx 컨테이너로
서빙하고, 책은 각각 실제 페이지로 존재한다. 방에서의 책 열기는 그 페이지를 모달로 가로채는
점진적 향상으로 구현해, JS가 실패해도 모든 내용에 도달할 수 있게 한다. 브라우저 기본 기능
(`<dialog>`, CSS 다단, 스크롤 스냅)을 최대한 활용해 JS 사용량을 성능 예산 안에 묶는다.

배포는 oneBite 프로젝트의 구성을 그대로 따른다 — 앱 전용 네임스페이스, `default` 네임스페이스의
중앙 인그레스에 ExternalName 다리로 연결, cert-manager 자동 TLS, GHCR 이미지, GitHub Actions
멀티아치 빌드. 클러스터가 **라즈베리파이 arm64**라는 점이 여러 결정의 근거가 된다.

## Technical Context

**Language/Version**: TypeScript 5.5 · Node.js 20 (빌드 전용) · React 18.3

**Primary Dependencies**: Next.js 14 (App Router, `output: 'export'`) · Tailwind CSS 3.4 · Zod (콘텐츠 검증)

**Storage**: 없음. 콘텐츠는 저장소 내 마크다운 파일. 방명록의 데이터베이스는 003에서 도입한다.

**Testing**: Vitest (콘텐츠 스키마·장 나눔 로직) · Playwright (키보드 경로·두 보기 모드 E2E) ·
axe-core (접근성 자동 검사) · Lighthouse CI (성능 예산 게이트)

**Target Platform**: 정적 파일 → `nginx:alpine` 컨테이너 → k8s (라즈베리파이 **arm64**).
브라우저는 최신 2개 버전 + iOS Safari.

**Project Type**: 정적 웹 사이트 (단일 프로젝트)

**Performance Goals**: LCP < 2.5s · CLS < 0.1 · INP < 200ms (헌장 원칙 III)

**Constraints**: 페이지당 압축 JS ≤ 100KB — **Next.js 기저 번들 때문에 위험. Phase 0에서 실측 후
재평가한다.** · WCAG 2.2 AA · 320px 이상 가로 스크롤 없음 · 폰트 self-host + 서브셋 · arm64 이미지 필수

**Scale/Scope**: 책장 3개 · 책 약 10권 · 정적 페이지 약 15개 · 방문자 규모는 개인 포트폴리오 수준

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 원칙 | 판정 | 근거 |
|---|---|---|
| I. Content-First, Static by Default | **통과** | `output: 'export'`로 런타임 서버 없음. 책 페이지는 JS 없이 렌더된다. 모달은 향상일 뿐 필수 경로가 아니다. |
| II. Accessibility Is Non-Negotiable | **통과** | 네이티브 `<dialog>`가 Esc 닫기(FR-005)와 포커스 트랩(FR-013)을 제공한다. 책장 이동은 CSS 스크롤 스냅 + 실제 링크라 키보드 경로가 기본으로 생긴다. axe 검사를 머지 게이트로 건다. |
| III. Performance Budgets Are Gates | **조건부** | Next.js App Router의 기저 공유 번들이 100KB 예산의 대부분을 차지할 수 있다. **미해결**: 실측 필요 → 연구 과제 R-1. |
| IV. Pragmatic Verification | **통과** | 장 나눔·콘텐츠 스키마 등 로직은 Vitest, 키보드 경로는 Playwright. 표현용 마크업은 검사 도구와 리뷰로 대체한다. |
| V. One Design System | **통과** | 디자인 토큰을 Tailwind 테마에 정의하고, 임의값 클래스(`bg-[#ae1800]`)를 린트로 금지해 리터럴 유입을 막는다. |

**게이트 결과**: 원칙 III 하나가 미확정이다. 이는 헌장 위반이 아니라 **측정되지 않은 위험**이며,
합의된 처리 방침은 "골격을 먼저 만들어 실측하고, 예산을 지키면 그대로 두고 넘으면 근거를 가지고
개정한다"이다. 추측만으로 헌장을 미리 완화하지 않는다. Phase 0에서 해소한다.

**설계 후 재평가 (Phase 1 완료 시점)**: 아래 [설계 후 헌장 재점검](#설계-후-헌장-재점검) 참조.

## Project Structure

### Documentation (this feature)

```text
specs/001-room-bookshelf-shell/
├── plan.md              # 이 파일
├── spec.md              # 기능 명세
├── design-notes.md      # 시안 분석 (계획 입력)
├── research.md          # Phase 0 출력
├── data-model.md        # Phase 1 출력
├── quickstart.md        # Phase 1 출력
├── contracts/           # Phase 1 출력
└── checklists/
    └── requirements.md
```

### Source Code (repository root)

```text
src/
├── app/
│   ├── layout.tsx                  # 문서 언어 ko, 폰트, 토큰 로드
│   ├── page.tsx                    # 방 (책장 3개)
│   └── books/[slug]/page.tsx       # 책 단독 페이지 — JS 없이 동작하는 정본
├── components/
│   ├── room/                       # 방 배경, 책장, 책등, 가로 스와이프
│   └── book/                       # 책 창, 보기 모드 전환, 장 이동
├── content/
│   ├── shelves/*.md                # 책장 정의
│   └── books/**/*.md               # 책 본문 (장 구분 포함)
├── lib/
│   ├── content.ts                  # 콘텐츠 로딩
│   └── schema.ts                   # Zod 스키마 검증
└── styles/
    └── tokens.css                  # 색·간격·타이포 토큰 (원칙 V의 단일 출처)

public/fonts/                       # 서브셋 폰트 (self-host)
scripts/subset-fonts.mjs            # 빌드 시 사용 글자만 추출
deploy/k8s/                         # oneBite 패턴을 따른 매니페스트
tests/
├── unit/                           # Vitest
└── e2e/                            # Playwright + axe
```

**Structure Decision**: 단일 프로젝트 구조를 쓴다. 백엔드가 없으므로 oneBite의 `web/`·`backend/`
분리는 이 기능에 불필요하다. 다만 003 방명록에서 API가 생기면 oneBite와 같은 방식으로 별도
디렉터리·별도 컨테이너를 추가하며, 그때도 이 정적 산출물은 그대로 유지된다.

## 배포 구성 (oneBite 패턴 준용)

**도메인**: `portfolio.jpark-playground.com`

| 항목 | oneBite | 이 프로젝트 | 동일 여부 |
|---|---|---|---|
| 도메인 | `onebite.jgbak-land.com` | `portfolio.jpark-playground.com` | 동일 방식(다른 루트 도메인) |
| 네임스페이스 | `onebite` | `portfolio` | 동일 방식 |
| 앱 서비스 | `web` (80 → 3000) | `web` (80 → 80) | 포트만 다름 |
| 공용 인그레스 연결 | `default` 네임스페이스에 ExternalName 다리 | 동일 | 동일 |
| 중앙 인그레스 | `default/ingress-host` | 동일 | 동일 |
| TLS | cert-manager `prod-issuer` (HTTP-01, Let's Encrypt) | 동일 | 동일 |
| 이미지 레지스트리 | GHCR, `:latest` + `:sha` 두 태그 | 동일 | 동일 |
| CI | GitHub Actions, buildx **linux/amd64 + linux/arm64** | 동일 | 동일 |
| 컨테이너 내용물 | Next.js standalone (`node server.js`) | **nginx:alpine 정적 서빙** | **다름 — 아래 근거** |
| 방문 기록 | — | nginx 접근 로그 → Alloy → Loki → Grafana | 기존 스택 재사용 (R-9) |

**컨테이너만 다르게 가는 이유**: 001에는 서버 로직이 전혀 없다. 라즈베리파이 arm64 클러스터에서
아무 일도 하지 않는 Node 프로세스를 상주시킬 이유가 없고, 헌장 원칙 I도 정적을 우선한다. 인프라
구성은 그대로 따르므로 운영 방식과 학습 비용은 oneBite와 같다.

**배포 전 확인이 필요한 사항**: oneBite의 `60-shared-ingress.yaml` 주석에 중앙 인그레스가
"momsage/**portfolio**/www 등이 등록된" 인그레스라고 적혀 있다. `portfolio` 호스트가 이미 등록되어
있을 수 있으므로, 매니페스트를 작성하기 전에 실제 인그레스 상태를 확인해야 한다
(`kubectl -n default get ingress ingress-host -o yaml`). 기존 항목과 충돌하면 호스트명이나 경로를
조정한다.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Next.js 채택 — 원칙 III 예산을 위협 | 사이트 주인이 직접 유지보수하며, oneBite에서 이미 Next.js 14 + Tailwind + TypeScript로 같은 배포 파이프라인을 운영 중이다. 익숙한 스택이 장기 유지보수 가능성을 높인다. | Astro나 순수 HTML이 예산 면에서 유리하지만, 익숙하지 않은 스택은 사이트가 방치될 위험을 키운다. 대신 정적 export와 클라이언트 컴포넌트 최소화로 위험을 줄이고 R-1에서 실측해 판단한다. |
| nginx 정적 서빙 — oneBite의 standalone 컨테이너와 다름 | 서버 로직이 없고, arm64 클러스터의 메모리를 아끼며, 헌장 원칙 I에 부합한다. | standalone 컨테이너는 oneBite와 완전히 같아 학습 비용이 0이지만, 하는 일 없는 Node 프로세스를 상주시킨다. 003에서 API가 필요해지면 oneBite처럼 별도 컨테이너로 붙이는 편이 구조적으로 맞다. |

## 설계 후 헌장 재점검

Phase 1 설계를 마친 시점의 재평가다.

| 원칙 | 판정 | 설계가 바꾼 점 |
|---|---|---|
| I | **통과** | `/books/[slug]`가 정본 페이지로 존재하고 방의 모달은 그것을 가로채는 향상이다. JS 없이도 모든 콘텐츠에 도달한다. |
| II | **통과** | `<dialog>`로 Esc·포커스 트랩을 확보. 두 보기 모드가 같은 DOM에 CSS만 다르게 적용되므로 낭독기에는 두 모드가 동일하게 읽힌다. 스크롤 스냅 책장에 실제 링크 목록을 함께 두어 키보드 경로를 보장한다. |
| III | **미확정 → R-1로 이월** | 설계상 클라이언트 컴포넌트는 책 창 하나뿐이고 장 나눔은 CSS가 담당해 JS 표면이 최소다. 그러나 Next.js 기저 번들은 설계로 줄일 수 없으므로 실측 전에는 판정할 수 없다. **구현 첫 단계에서 측정하고, 초과 시 tasks 진행을 멈추고 개정 여부를 결정한다.** |
| IV | **통과** | 테스트 대상이 로직(스키마 검증, 슬러그 해석, 모드 상태)과 경로(키보드 E2E)로 한정되고, 표현은 axe·LHCI가 담당한다. |
| V | **통과** | `tokens.css` 단일 출처 + Tailwind 테마 매핑 + 임의값 린트 금지로 리터럴 유입 경로를 막았다. |
