# Specification Quality Checklist: 방명록

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-07-31
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

**1차 검증에서 걸러 고친 것**

- 요구사항 본문에 기술명(Fastify·PostgreSQL·판정 API·honeypot)이 섞여 있었다.
  FR 은 "유해성을 판정한다", "자동 프로그램이 남긴 글은 나타나지 않는다"처럼 무엇을 이루어야
  하는지로 바꾸고, 도구 이름은 Assumptions 의 "확인된 결정"으로 내렸다. 그 결정들은 사용자가
  이미 확정한 사항이라 지우지 않고 자리를 옮겼다.
- 성공 기준에 "응답 200ms 이하"가 있었다. 구현 지표라 "남긴 글이 3초 안에 보인다"로 바꿨다.

**남는 판단 — 계획 단계로 넘김**

- 001 Phase 6(배포 파이프라인)을 003 범위에 넣을지, 001 을 먼저 끝낼지. 어느 쪽이든 방명록을
  띄우려면 필요하다. 스펙에서는 의존으로만 적었다.
- 방문자 글이 판정을 위해 제3자에게 전달되는 것이 헌장 개정을 요구하는지. FR-014(고지)로
  충분한지 계획 단계에서 판단한다.

**계획 착수 후 뒤집힌 결정**

- 유해성 판정을 Google Perspective API 로 정했다가 Claude API 로 바꿨다. Perspective 가
  2026-12-31 에 종료되고 마이그레이션 지원이 없다는 사실을 조사 중에 확인했다. 명세의
  Assumptions 를 고쳐 반영했다.
- 방문자 글이 빌드 시점에 존재하지 않아 "서버 렌더 HTML" 조항과 부딪히는 점. Complexity
  Tracking 에 편차로 기록해야 한다.

**의도적으로 [NEEDS CLARIFICATION] 을 남기지 않은 것**

글쓴이 식별(비밀번호 여부)·보관 기간·표시 형태(한 권에 장이 쌓임)는 개인 사이트의 합리적
기본값이 분명해 Assumptions 에 근거와 함께 적고 넘어갔다. 계획 단계에서 되돌릴 수 있다.
