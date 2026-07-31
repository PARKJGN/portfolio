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
- 방명록 책만 3D 가 아니라 평면 모달로 연다. 캔버스에 입력칸을 놓을 수 없고, 방문자가 쓸
  글자를 서브셋 글꼴이 미리 담을 수 없다 — R-2·R-3.
- 소스나 콘텐츠에 한글을 추가하면 `npm run fonts:build` 를 돌려야 폰트 서브셋 테스트가 통과한다.
<!-- SPECKIT END -->
