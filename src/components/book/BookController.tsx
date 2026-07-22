'use client';

import { useEffect } from 'react';
import {
  DEFAULT_VIEW_MODE,
  otherMode,
  pageProgress,
  readStoredMode,
  writeStoredMode,
  type ViewMode,
} from '@/lib/view-mode';

/**
 * 이 사이트의 **유일한** 클라이언트 컴포넌트다.
 *
 * 책 권수가 늘어도 이 하나뿐이다 — 모든 동작을 문서 레벨에서 위임받고,
 * 버튼·표시기 마크업은 서버가 렌더한다.
 *
 * 하는 일:
 *  - 책 링크 클릭을 가로채 <dialog> 를 연다 (R-3, FR-004)
 *  - 주소를 /books/<slug> 로 바꾸고 뒤로 가기로 닫는다 (FR-012)
 *  - 바깥 영역 클릭으로 닫는다 (FR-005 — <dialog> 가 주지 않는 유일한 항목)
 *  - 두 보기 방식을 전환하고 선택을 유지한다 (FR-007~009)
 *  - 장 이동과 현재 위치 표시 (FR-010)
 *
 * 하지 않는 일 — 브라우저가 이미 해주기 때문:
 *  - Esc 닫기, 포커스 트랩, 배경 비활성화, 초점 복원
 *  - **장 나눔**. CSS 다단이 화면 크기에 맞춰 처리한다 (R-2)
 *
 * JS 가 없으면 책 링크는 평범한 <a> 로 동작해 정적 페이지로 이동하고,
 * 본문은 전체가 이어진 형태로 읽힌다 (헌장 원칙 I).
 */
export function BookController() {
  useEffect(() => {
    const root = document.documentElement;

    // 선언 순서에 주의 — 아래 초기화 호출은 이 파일 맨 끝에 있다.
    // applyMode 가 updateProgress 를, 그것이 visibleBody 를 부르므로
    // 셋이 모두 선언된 뒤에 첫 호출이 일어나야 한다.

    // ── 보기 방식 ──────────────────────────────
    const applyMode = (mode: ViewMode) => {
      root.dataset.viewMode = mode;
      for (const btn of document.querySelectorAll<HTMLButtonElement>('[data-action="toggle-view"]')) {
        btn.setAttribute('aria-pressed', String(mode === 'continuous'));
        btn.textContent = mode === 'paged' ? '전체 이어보기' : '한 장씩 넘기기';
      }
      updateProgress();
    };

    // ── 현재 보이는 본문 ──────────────────────────────
    const visibleBody = (): HTMLElement | null => {
      const openDialog = document.querySelector('dialog[open]');
      return (openDialog ?? document).querySelector<HTMLElement>('.book__body');
    };

    function updateProgress() {
      const body = visibleBody();
      if (!body) return;
      const { current, total } = pageProgress(body.scrollLeft, body.clientWidth, body.scrollWidth);
      const scope = body.closest('.book') ?? document;
      const label = scope.querySelector<HTMLElement>('[data-progress]');
      if (label) label.textContent = `${current} / ${total}`;

      // 끝 판정은 나눗셈이 아니라 스크롤 위치로 한다. 단 사이 간격(column-gap) 때문에
      // scrollWidth 가 clientWidth 의 정수배가 아니어서, 마지막 장에서도
      // current < total 로 남아 다음 버튼이 영영 잠기지 않는다.
      const EDGE = 2; // 소수점 반올림 여유
      const atStart = body.scrollLeft <= EDGE;
      const atEnd = Math.ceil(body.scrollLeft + body.clientWidth) >= body.scrollWidth - EDGE;
      scope.querySelector<HTMLButtonElement>('[data-action="page-prev"]')?.toggleAttribute('disabled', atStart);
      scope.querySelector<HTMLButtonElement>('[data-action="page-next"]')?.toggleAttribute('disabled', atEnd);
    }

    const turnPage = (direction: 1 | -1) => {
      const body = visibleBody();
      if (!body) return;
      body.scrollBy({ left: direction * body.clientWidth });
    };

    // ── 모달 ──────────────────────────────
    const dialogFor = (slug: string) =>
      document.getElementById(`book-dialog-${slug}`) as HTMLDialogElement | null;

    const openDialog = (slug: string, pushHistory: boolean) => {
      const dialog = dialogFor(slug);
      if (!dialog || dialog.open) return false;
      dialog.showModal();
      if (pushHistory) history.pushState({ bookSlug: slug }, '', `/books/${slug}`);
      requestAnimationFrame(updateProgress);
      return true;
    };

    let closingFromHistory = false;
    const closeOpenDialog = () => {
      const open = document.querySelector<HTMLDialogElement>('dialog[open]');
      if (!open) return;
      closingFromHistory = true;
      open.close();
      closingFromHistory = false;
    };

    // ── 이벤트 ──────────────────────────────
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
        return;
      }
      const target = e.target as Element | null;

      const action = target?.closest<HTMLElement>('[data-action]')?.dataset.action;
      if (action === 'toggle-view') {
        const next = otherMode((root.dataset.viewMode as ViewMode) ?? DEFAULT_VIEW_MODE);
        applyMode(next);
        writeStoredMode(globalThis.localStorage, next);
        return;
      }
      if (action === 'page-prev') return turnPage(-1);
      if (action === 'page-next') return turnPage(1);

      const spine = target?.closest<HTMLElement>('[data-book-slug]');
      if (spine) {
        const slug = spine.dataset.bookSlug;
        if (slug && openDialog(slug, true)) e.preventDefault();
        return;
      }

      // <dialog> 는 ::backdrop 클릭을 스스로 처리하지 않는다. 클릭 대상이
      // dialog 요소 자신이면 내용 바깥을 누른 것이다 (R-5).
      if (target instanceof HTMLDialogElement && target.open) target.close();
    };

    const onClose = () => {
      if (closingFromHistory) return;
      if (history.state?.bookSlug) history.back();
    };

    const onPopState = () => {
      const slug = (history.state as { bookSlug?: string } | null)?.bookSlug;
      if (slug) openDialog(slug, false);
      else closeOpenDialog();
    };

    const onScrollOrResize = () => updateProgress();

    document.addEventListener('click', onClick);
    document.addEventListener('close', onClose, true);
    document.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('popstate', onPopState);
    window.addEventListener('resize', onScrollOrResize);

    // 초기화는 모든 선언이 끝난 뒤에. 인라인 스크립트가 이미 속성을 붙여 두었더라도
    // 버튼 라벨과 aria-pressed 는 여기서 맞춰야 한다.
    applyMode(readStoredMode(globalThis.localStorage));

    return () => {
      document.removeEventListener('click', onClick);
      document.removeEventListener('close', onClose, true);
      document.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('popstate', onPopState);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, []);

  return null;
}
