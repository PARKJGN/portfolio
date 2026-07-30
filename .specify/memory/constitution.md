<!--
SYNC IMPACT REPORT
==================
Version change: 2.0.0 → 3.0.0  (2026-07-29)
Rationale: MAJOR. Principle I 에서 "JavaScript MUST be additive — 스크립트가 없어도
핵심 내용과 이동이 읽히고 동작해야 한다" 조항을 삭제했다. 기준을 없애는 것은 완화이며,
완화는 이전에 부적합했던 산출물(JS 를 전제로만 열리는 3D/모달 책 리더)을 소급해서
적합으로 바꾼다. 이 문서의 versioning policy 가 그런 변경을 MAJOR 로 규정한다.

삭제 근거: 책 읽기 경험이 3D/모달 리더로 굳어지면서, 무JS 도달을 위해 유지하던
`/books/<slug>` 정적 페이지와 그 전용 테스트가 실제 독자 없이 라우트·테스트만 늘렸다.
개인 포트폴리오라 검색 노출·무JS 접근성을 포기하기로 사용자가 명시적으로 결정했다.

무엇이 남았나: 내용은 여전히 서버 렌더 HTML 로 <dialog> 안에 존재해 낭독기·검색이
읽을 수 있다(원칙 II 는 그대로 게이트). 다만 그 내용을 '펼쳐 읽는' 조작은 JS 를
전제로 한다. 잃은 것은 스크립트 실패 시의 열람 경로와 책별 딥링크·색인이다.

Modified principles:
  I. Content-First, Static by Default — 무JS 열람 보장 조항 삭제, 서버 렌더 HTML
     존재 요구로 대체

Templates requiring updates:
  ✅ specs/001-room-bookshelf-shell/spec.md — FR-012(딥링크)·무JS 관련 항목 조정
  ✅ .specify/templates/*                   — 원칙별 필수 섹션 변화 없음, 편집 불필요

Deferred TODOs: none

--- 이전 개정 기록 (2.0.0) ---
Version change: 1.0.0 → 2.0.0  (2026-07-22)
Rationale: MAJOR. Principle III 에서 "페이지당 압축 JS 100KB 이하" 조항을 삭제했다.
기준을 없애는 것은 완화이며, 완화는 이전에 부적합했던 산출물을 소급해서 적합으로
바꾼다. 이 문서의 versioning policy 가 그런 변경을 MAJOR 로 규정한다.

삭제 근거: 실측 결과 프레임워크 기저 비용만으로 예산의 94%(Next 14 기준 94.4KB)가
소진되었고, Next 16 으로 올린 뒤에는 145.8KB 로 예산 자체를 넘겼다. 기능을 하나도
만들지 않은 상태에서 이미 지킬 수 없는 숫자였다. 지켜지지 않을 기준을 문서에 남겨
두면 나머지 조항의 구속력까지 함께 떨어진다.

무엇이 남았나: 사용자가 실제로 체감하는 지표(LCP·CLS·INP)는 그대로 게이트다.
용량은 그 지표를 통해 간접적으로 관리된다. 다만 용량은 유일한 선행 지표였으므로,
번들이 조용히 부풀어도 실험실 조건에서는 드러나지 않을 수 있다는 점은 감수한 위험이다.

--- 최초 제정 기록 (1.0.0) ---
First concrete ratification of the constitution. All template placeholders
replaced with project-specific governance. MAJOR bump to 1.0.0 establishes the initial
stable baseline rather than an incremental amendment.

Modified principles:
  [PRINCIPLE_1_NAME] → I. Content-First, Static by Default
  [PRINCIPLE_2_NAME] → II. Accessibility Is Non-Negotiable
  [PRINCIPLE_3_NAME] → III. Performance Budgets Are Gates
  [PRINCIPLE_4_NAME] → IV. Pragmatic Verification
  [PRINCIPLE_5_NAME] → V. One Design System

Added sections:
  [SECTION_2_NAME] → Technology & Platform Constraints
  [SECTION_3_NAME] → Development Workflow & Quality Gates
  Governance rules filled in (amendment procedure, versioning policy, compliance review)

Removed sections: none

Templates requiring updates:
  ✅ .specify/templates/plan-template.md   — "Constitution Check" defers to this file
                                              generically; no edit required
  ✅ .specify/templates/spec-template.md   — mandatory sections unchanged by this
                                              constitution; no edit required
  ✅ .specify/templates/tasks-template.md  — optional-tests posture is consistent with
                                              Principle IV (pragmatic, not TDD-mandated);
                                              no edit required
  ✅ CLAUDE.md                             — SPECKIT-managed block, no principle
                                              references to update
  ⚠ README.md / docs/quickstart.md        — do not exist yet; when created they MUST
                                              link to this constitution

Deferred TODOs: none
-->

# Portfolio Constitution

## Core Principles

### I. Content-First, Static by Default

The site exists to present work and background to a human reader; every technical decision
serves that end. Content MUST be authored in plain text and rendered at build time. A runtime
server, database, or client-side data fetch MUST NOT be introduced unless a specific
user-facing requirement cannot be met statically, and that justification MUST be recorded in
the plan's Complexity Tracking table. Every piece of reader-facing content MUST be present as
real, server-rendered HTML in the delivered document, so that assistive technology and search
tools can read it directly; content MUST NOT exist only inside client-side script. Interactive
*presentation* of that content (opening, page-turning, 3D) MAY require JavaScript.

**Rationale**: A portfolio's failure mode is being slow, broken, or unreachable when someone
who matters is looking at it. Static output removes entire categories of outage, and the
build-time constraint keeps scope honest on a project with no operations team. The earlier
guarantee that content stays *operable* without JavaScript was dropped in 3.0.0: the reading
experience is a JS-driven 3D/modal reader, and a parallel no-JS page path added routes and
tests without a real audience for this personal site. Requiring the content to remain as
server-rendered HTML preserves what mattered most — it is still readable by screen readers and
crawlers even though *interacting* with it now needs script.

### II. Accessibility Is Non-Negotiable

Every shipped page MUST meet WCAG 2.2 Level AA. Concretely, and verifiable per feature:
all interactive elements MUST be reachable and operable by keyboard alone with a visible
focus indicator; all non-decorative images MUST carry meaningful alternative text;
text contrast MUST be at least 4.5:1 (3:1 for large text and meaningful UI boundaries);
page structure MUST use correct landmarks and a single non-skipping heading order; and
motion MUST be suppressed under `prefers-reduced-motion`. Automated accessibility checks
MUST report zero violations before merge, and keyboard traversal MUST be manually walked
for any new interactive component.

**Rationale**: Exclusion here is invisible to the author and total for the excluded reader.
These specific criteria are chosen because they are objectively checkable, so compliance is
a gate rather than an opinion.

### III. Performance Budgets Are Gates

The following budgets apply to every page on a simulated mid-tier mobile device over a
throttled connection: Largest Contentful Paint under 2.5s, Cumulative Layout Shift under
0.1, Interaction to Next Paint under 200ms. Images MUST be served in a modern format,
responsively sized, with explicit dimensions to reserve layout space. Fonts MUST be
self-hosted, subset, and loaded without blocking first paint. A change that breaches any
budget MUST NOT merge until the budget is restored or the budget itself is formally
amended under Governance.

JavaScript 전송량에는 고정 상한을 두지 않는다(2.0.0 에서 삭제). 용량은 위 세 지표를
통해 결과적으로 관리한다.

**Rationale**: Budgets stated as numbers can be enforced by tooling; "keep it fast" cannot.
Layout shift and blocked paint are the defects most visible to a first-time visitor.
용량 상한을 뺀 이유는 실측값이 프레임워크 기저 비용만으로 상한에 닿았기 때문이다 —
지킬 수 없는 숫자는 게이트가 아니라 무시되는 문장이 된다. 대신 사용자가 실제로 겪는
지표만 남겼다. 그 대가로 "번들이 조용히 부푸는 것"은 잡히지 않으므로, 무거운 의존성을
추가할 때는 사람이 판단해야 한다.

### IV. Pragmatic Verification

Testing effort MUST follow risk, not ceremony. Automated tests are REQUIRED for logic that
can be wrong in a non-obvious way — data transformation, content parsing, routing, form
validation and submission, and any shared utility. Automated tests are NOT required for
purely presentational markup and styling, which are verified by review and by the checks in
Principles II and III. Test-first ordering is RECOMMENDED where it aids design but is NOT
mandated. Every bug fix MUST add a regression test when the defect lies in logic covered by
the REQUIRED category. The build, lint, accessibility, and performance checks MUST all pass
before merge; a failing check MUST be fixed or explicitly waived in writing, never ignored.

**Rationale**: A solo portfolio does not warrant strict TDD across presentational code, but
untested logic still costs real debugging time. Splitting the two by risk keeps coverage
where it pays and avoids brittle snapshot tests of visual output.

### V. One Design System

Visual and interaction decisions MUST be expressed as reusable tokens and components, not
as per-page values. Colors, spacing, typography scale, radii, and motion durations MUST be
defined once as named tokens and referenced by name; literal values MUST NOT appear in
component styles. A new component MUST be checked against existing components first and
MUST be introduced only when no existing component can be adapted. Both light and dark
presentations MUST be defined for any surface, and both MUST satisfy Principle II's
contrast requirements.

**Rationale**: Inconsistent spacing and near-duplicate components are the characteristic
decay of a site edited in bursts over years. Tokens make consistency the path of least
resistance and make a global restyle a single-file change.

## Technology & Platform Constraints

The concrete framework and hosting choices are determined per feature in the implementation
plan, subject to these binding constraints:

- The production build MUST emit static assets deployable to any static host. Vendor-specific
  runtime features MUST NOT become load-bearing for core content.
- Dependencies MUST be justified. Each added runtime dependency MUST be recorded in the plan
  with the alternative considered, and MUST be weighed against the Principle III budget.
- All content MUST be authored in a version-controlled, plain-text format in this repository.
  Content MUST NOT live only in a third-party service.
- Secrets MUST NOT be committed. Any credential MUST be supplied via environment
  configuration at build time.
- Personal data MUST be minimized: only what a visitor voluntarily submits via a contact
  path may be collected, it MUST NOT be used for any other purpose, and third-party
  analytics or embeds that track visitors MUST NOT be added without an explicit amendment.
- The site MUST be responsive from a 320px viewport upward and MUST NOT require horizontal
  scrolling of the page body at any width.

## Development Workflow & Quality Gates

- Work MUST proceed through the Spec Kit flow: specify → plan → tasks → implement. A feature
  MUST have a spec before it has code.
- Each feature MUST be developed on its own branch named `###-feature-name`.
- The Constitution Check in the plan MUST be completed before Phase 0 research and re-checked
  after Phase 1 design. Any violation MUST appear in Complexity Tracking with the simpler
  alternative and the reason it was rejected.
- The following gates MUST pass before merge: build succeeds, linter and formatter clean,
  required tests per Principle IV pass, automated accessibility scan reports zero violations,
  and performance budgets from Principle III hold.
- Changes affecting rendered output MUST be visually reviewed at a mobile and a desktop
  width, in both light and dark presentation, before merge.
- Commits MUST be scoped to one logical change. Task checkpoints defined in tasks.md MUST be
  validated before advancing to the next user story.

## Governance

This constitution supersedes all other development practices in this repository. Where a
tool default, template, or habit conflicts with a principle here, this document wins.

**Amendment procedure**: An amendment MUST be proposed as a written change to this file
stating the principle affected, the motivation, and the migration impact on existing code
and templates. On adoption, the version MUST be bumped per the policy below, the Last
Amended date MUST be set to the adoption date, and the Sync Impact Report at the top of this
file MUST be updated. Dependent artifacts flagged in that report MUST be reconciled in the
same change.

**Versioning policy**: Semantic versioning applies to this document.
MAJOR for backward-incompatible governance changes — removing or redefining a principle in a
way that invalidates existing compliance. MINOR for a new principle or section, or materially
expanded guidance. PATCH for clarifications, wording, and non-semantic refinement.
Amending a numeric budget in Principle III is MINOR when tightened and MAJOR when loosened,
because loosening retroactively re-labels non-compliant work as compliant.

**Compliance review**: Compliance MUST be verified at the plan's Constitution Check and again
before merge against the gates in Development Workflow & Quality Gates. Complexity MUST be
justified in writing or removed. Unjustified violations MUST block the merge. This document
MUST be re-read at the start of each new feature's planning; agent runtime guidance lives in
`CLAUDE.md` and MUST NOT contradict this constitution.

**Version**: 3.0.0 | **Ratified**: 2026-07-21 | **Last Amended**: 2026-07-29
