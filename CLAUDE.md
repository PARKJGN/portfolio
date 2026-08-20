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
  쓴다). 평면 마크업은 WebGL 이 없을 때의 폴백이자 낭독기가 읽는 본문으로 남는다.
- 글은 **모달**로 남긴다. 종이 오른쪽 아래 구석의 '남기기' 를 누르면 열린다 —
  `BookController.placeWriteButton()`, `guestbook.css` 의 `.guestbook__pen[data-on-page]`.
  한동안은 3D 가 한 면을 비우고 그 자리에 폼을 얹었는데(`placeWriteBox`), 장을 넘겨도
  폼이 따라다녀 종이 위의 물건이 아니라 화면에 붙은 물건으로 보였다.
- 종이 위의 글은 **시간순**이다(오래된 글이 앞, 새 글이 맨 뒤). API 와 평면 목록은 최신순
  그대로고, `BookController.guestbookBlocks()` 가 책에 넣을 때만 뒤집는다. 그래야 새 글이
  마지막 장에 붙고, 남긴 뒤 책이 그리로 넘어가는 것이 자연스럽다.
- 남긴 글은 **종이 텍스처에 직접** 펜으로 그어진다(`book3d.ts` 의 `Reveal`,
  `Book3D.reveal()`). 종이 위에 캔버스를 겹치지 않는 이유는 줄바꿈을 두 곳에서 계산하게
  되기 때문이다.
- 종이의 **덩이는 면 경계에서 쪼개진다.** 왼 면 바닥까지 채우고 나머지는 오른 면
  첫머리에서 이어진다 — `drawFlow` 의 `skip`, `PageRange.startLine`. 예전에는 통째로 안
  들어가면 다음 면으로 미뤄 아래가 비었고, 한 면보다 긴 글은 넘친 줄이 **사라졌다.**
- 소스나 콘텐츠에 한글을 추가하면 `npm run fonts:build` 를 돌려야 폰트 서브셋 테스트가 통과한다.
<!-- SPECKIT END -->
