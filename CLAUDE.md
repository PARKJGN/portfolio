<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan:
`specs/003-guestbook/plan.md`

헌장(모든 결정에 우선): `.specify/memory/constitution.md`

**진행 중 — 003 방명록**
- 기능 명세: `specs/003-guestbook/spec.md`
- 연구·결정: `specs/003-guestbook/research.md`
- 데이터 모델: `specs/003-guestbook/data-model.md`
- API 계약: `specs/003-guestbook/contracts/guestbook-api.md`
- 검증 절차: `specs/003-guestbook/quickstart.md`

**완료 — 001 방·책장·책 모달 골격** (Phase 6 배포는 미완)
- 계획: `specs/001-room-bookshelf-shell/plan.md`
- 기능 명세: `specs/001-room-bookshelf-shell/spec.md`
- 시안 분석: `specs/001-room-bookshelf-shell/design-notes.md`
- 연구·결정: `specs/001-room-bookshelf-shell/research.md`
- 콘텐츠 계약: `specs/001-room-bookshelf-shell/contracts/content-schema.md`
- 검증 절차: `specs/001-room-bookshelf-shell/quickstart.md`

주의:
- 003 착수 전 **001 의 Phase 6(T039–T046, 배포 파이프라인)을 먼저 끝낸다.** 위험을 분리하기
  위해서다 — 003 research.md R-1.
- 방명록 책도 다른 책과 똑같이 3D 로 연다. "방명록만 평면 모달" 이던 R-2 는 2026-08-01 에
  뒤집혔다(근거였던 글꼴 제약이 사실이 아니었다 — 캔버스는 `ctx.font` 로 시스템 글꼴을
  쓴다). 캔버스에 입력칸을 못 놓는 제약은, 3D 가 한 면을 통째로 비우고 그 자리에 진짜
  `<form>` 을 얹어 푼다 — `BookController.placeWriteBox()`, `guestbook.css` 의
  `[data-on-page]`. 평면 마크업은 WebGL 이 없을 때의 폴백이자 낭독기가 읽는 본문으로 남는다.
- 소스나 콘텐츠에 한글을 추가하면 `npm run fonts:build` 를 돌려야 폰트 서브셋 테스트가 통과한다.
<!-- SPECKIT END -->
