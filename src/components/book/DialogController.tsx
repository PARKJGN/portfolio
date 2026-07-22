'use client';

import { useEffect } from 'react';

/**
 * 이 사이트의 **유일한** 클라이언트 컴포넌트다 (T023 + T024).
 *
 * 하는 일:
 *  - 방의 책 링크 클릭을 가로채 해당 <dialog> 를 연다 (R-3)
 *  - 주소를 /books/<slug> 로 바꿔 공유 가능하게 한다 (FR-012)
 *  - 뒤로 가기로 모달을 닫는다 (명세 엣지 케이스)
 *  - 바깥 영역 클릭으로 닫는다 (FR-005 — <dialog> 가 주지 않는 유일한 항목, R-5)
 *
 * 하지 않는 일 — 브라우저가 이미 해주기 때문:
 *  - Esc 닫기, 포커스 트랩, 배경 비활성화, 열기 전 초점 복원
 *
 * JS 가 없거나 이 컴포넌트가 실패하면 책 링크는 평범한 <a> 로 동작해
 * /books/<slug> 정적 페이지로 이동한다. 내용에는 어느 쪽이든 도달한다 (헌장 원칙 I).
 */
export function DialogController() {
  useEffect(() => {
    const dialogFor = (slug: string) =>
      document.getElementById(`book-dialog-${slug}`) as HTMLDialogElement | null;

    const openDialog = (slug: string, pushHistory: boolean) => {
      const dialog = dialogFor(slug);
      if (!dialog || dialog.open) return false;
      dialog.showModal();
      if (pushHistory) {
        history.pushState({ bookSlug: slug }, '', `/books/${slug}`);
      }
      return true;
    };

    // 뒤로 가기로 닫는 중인지 표시. close 이벤트 처리와 서로 되먹임하는 것을 막는다.
    let closingFromHistory = false;

    const closeOpenDialog = () => {
      const open = document.querySelector<HTMLDialogElement>('dialog[open]');
      if (!open) return;
      closingFromHistory = true;
      open.close();
      closingFromHistory = false;
    };

    const onClick = (e: MouseEvent) => {
      // 새 탭/새 창 의도는 존중한다
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
        return;
      }

      const target = e.target as Element | null;

      // 1) 책등 클릭 → 모달로 가로채기
      const spine = target?.closest<HTMLElement>('[data-book-slug]');
      if (spine) {
        const slug = spine.dataset.bookSlug;
        if (slug && openDialog(slug, true)) e.preventDefault();
        return;
      }

      // 2) 바깥 영역(backdrop) 클릭 → 닫기.
      //    <dialog> 는 ::backdrop 클릭을 스스로 처리하지 않는다. 클릭 대상이
      //    dialog 요소 자신이면 내용 바깥을 누른 것이다.
      if (target instanceof HTMLDialogElement && target.open) {
        target.close();
      }
    };

    const onClose = () => {
      if (closingFromHistory) return;
      // 사용자가 Esc·닫기 버튼·바깥 클릭으로 닫았다. 열 때 쌓은 기록을 되돌린다.
      if (history.state?.bookSlug) history.back();
    };

    const onPopState = () => {
      const slug = (history.state as { bookSlug?: string } | null)?.bookSlug;
      if (slug) openDialog(slug, false);
      else closeOpenDialog();
    };

    document.addEventListener('click', onClick);
    document.addEventListener('close', onClose, true); // close 는 버블링하지 않는다
    window.addEventListener('popstate', onPopState);

    return () => {
      document.removeEventListener('click', onClick);
      document.removeEventListener('close', onClose, true);
      window.removeEventListener('popstate', onPopState);
    };
  }, []);

  return null;
}
