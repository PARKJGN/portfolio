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
import type { Block, Book3D, BookVisual } from './book3d';
import { fetchEntries } from '@/lib/guestbook-client';

/**
 * 이 사이트의 **유일한** 클라이언트 컴포넌트다.
 *
 * 책 권수가 늘어도 이 하나뿐이다 — 모든 동작을 문서 레벨에서 위임받고,
 * 버튼·표시기 마크업은 서버가 렌더한다.
 *
 * 하는 일:
 *  - 책 버튼 클릭을 가로채 <dialog> 를 연다 (R-3, FR-004)
 *  - 뒤로 가기로 닫는다 — 주소는 바꾸지 않고 히스토리 항목만 남긴다
 *  - 바깥 영역 클릭으로 닫는다 (FR-005 — <dialog> 가 주지 않는 유일한 항목)
 *  - 다른 책 버튼을 누르면 지금 책을 접고 그 책을 연다(책 사이 이동)
 *  - 두 보기 방식을 전환하고 선택을 유지한다 (FR-007~009)
 *  - 장 이동과 현재 위치 표시 (FR-010)
 *
 * 하지 않는 일 — 브라우저가 이미 해주기 때문:
 *  - Esc 닫기, 포커스 트랩, 배경 비활성화, 초점 복원
 *  - **장 나눔**. CSS 다단이 화면 크기에 맞춰 처리한다 (R-2)
 *
 * 책 읽기는 JS(3D/모달)를 전제로 한다. 본문 HTML 은 <dialog> 안에 남아 낭독기·
 * 검색이 읽을 수 있으나, JS 가 없으면 책은 열리지 않는다.
 */
export function BookController() {
  useEffect(() => {
    const root = document.documentElement;

    // 화분 상태: 남은 잎 수(3→2→1), 0 은 꽃이 핀 상태. 클릭마다 진행하고 다시 처음으로.
    let plantStage = 3;

    // 점 표시(3D 리더의 위치 표시). 장 수만큼 점을 두고 현재 장을 채운다. current 는
    // 0-based. 순수 장식이라(컨테이너가 aria-hidden) 낭독기용 숫자(aria-live)와 별개다.
    const renderPips = (scope: Element, current: number, total: number) => {
      const box = scope.querySelector<HTMLElement>('[data-pips]');
      if (!box) return;
      if (box.childElementCount !== total) {
        const pips = Array.from({ length: total }, () => {
          const s = document.createElement('span');
          s.className = 'book__pip';
          return s;
        });
        box.replaceChildren(...pips);
      }
      for (let k = 0; k < box.children.length; k++) {
        (box.children[k] as HTMLElement).classList.toggle('is-current', k === current);
      }
    };

    // activeReader: '다 펼쳐진' 리더(넘김·진행표시·3D 닫기 연출용). 등장이 끝나야 담긴다.
    // readerEngine: 화면에 올라온 3D 엔진(show() 순간부터). 등장 '도중'에 닫아도 3D 를
    // 반드시 걷어내려고 따로 둔다 — 이게 없으면 등장 중 닫을 때 activeReader 가 아직
    // 없어 폴백 경로로 빠지고, 곧 등장이 끝나며 캔버스에 책만 덩그러니 남는다(조작 불가).
    let activeReader: Book3D | null = null;
    let readerEngine: Book3D | null = null;
    // 지금 3D 로 그리고 있는 책의 시각 정보. 방명록에 글이 늘면 이것을 고쳐 다시 그린다.
    let openVisual: BookVisual | null = null;
    /** 그 책의 원본 덩이(안내문만). 글 목록은 매번 여기에 다시 붙인다. */
    let openBaseBlocks: Block[] = [];
    const teardownEngine = () => {
      if (!readerEngine) return;
      readerEngine.cancel(); // 등장/닫기 트윈이 돌고 있으면 멈춘다
      stopInk(); // 잉크를 긋던 중이면 멈춘다 — 없어진 텍스처에 계속 그리지 않게
      readerEngine.hide();
      readerEngine.clear();
      readerEngine = null;
      activeReader = null;
      openVisual = null;
      openBaseBlocks = [];
      placeOnPage(); // activeReader 가 비었으니 자리 표시를 뗀다
    };
    /**
     * 방명록 책의 페이지 덩이 — 남겨진 글만.
     *
     * DOM 에서 읽지 않고 직접 가져오는 이유: 목록은 창이 열린 **뒤에** 도착하는데
     * 3D 는 열리는 순간 페이지를 만든다. DOM 을 기다리게 하면 타이밍에 기대게 된다.
     * guestbook-client 가 같은 요청을 하나로 묶어 주므로 HTML 쪽과 두 번 부르지 않는다.
     *
     * **책 안에서만 시간순으로 뒤집는다.** API 와 평면 목록은 최신순 그대로다(계약을
     * 건드리지 않는다). 종이는 진짜 방명록처럼 오래된 글이 앞이고 새 글이 맨 뒤라야,
     * 방금 남긴 글이 마지막 장에 붙고 책이 그리로 넘어가는 것이 자연스럽다.
     *
     * 목록이 늦거나 실패해도 책은 그대로 열린다 — 빈 책이라도 '남기기' 는 눌린다.
     */
    const guestbookBlocks = async (base: Block[]): Promise<Block[]> => {
      try {
        const page = await fetchEntries();
        if (page.entries.length === 0) return base;
        return [
          ...base,
          ...[...page.entries].reverse().map((e): Block => ({
            kind: 'entry',
            author: e.author,
            when: formatWhen(e.createdAt),
            text: e.body,
          })),
        ];
      } catch {
        return base; // 목록을 못 받아도 글은 남길 수 있어야 한다
      }
    };

    /**
     * '남기기' 버튼을 펼쳐진 오른쪽 면의 오른쪽 아래 구석에 놓는다.
     *
     * 종이 위에 얹히는 유일한 조작부다. 구석이라 글을 가리지 않고, 실제 방명록에서
     * 펜이 놓인 자리처럼 읽힌다. 넘기는 중이거나 3D 가 아니면 자리 표시를 떼어
     * CSS 가 알아서 흐름 안으로 돌려보낸다(평면 폴백).
     */
    const placeWriteButton = () => {
      const open = document.querySelector<HTMLElement>('dialog[open]');
      const pen = open?.querySelector<HTMLElement>('.guestbook__pen');
      if (!pen) return;
      const rect = activeReader?.pageRect('right') ?? null;
      if (!rect) {
        delete pen.dataset.onPage;
        pen.removeAttribute('style');
        return;
      }
      // 가로 여백은 3D 가 쓰는 값(padX = 폭의 11.5%)과 눈으로 맞춘다.
      //
      // 세로는 **높이 기준**이어야 한다. 폭 기준으로 잡았더니 넓은 화면에서 그 값이
      // 종이 아래 여백(높이의 7%)보다 커져 버튼이 글자 위로 올라탔다.
      // 0.905 는 본문 바닥(0.895) 바로 아래다 — 저쪽에서 이 자리를 비워 둔다.
      pen.dataset.onPage = '';
      pen.style.left = `${Math.round(rect.left + rect.width - rect.width * 0.115)}px`;
      pen.style.top = `${Math.round(rect.top + rect.height * 0.905)}px`;
    };

    /**
     * 종이에 그려진 링크 위에 진짜 `<a>` 를 얹는다.
     *
     * 글자는 캔버스가 그리고, 여기서 얹는 것은 **투명한 손잡이**다. 그래야 누르기·
     * 키보드 초점·가운데 클릭·주소 복사가 브라우저의 것으로 동작한다. 본문 HTML 안의
     * `<a>` 를 쓸 수 없는 이유는 그 조상(.book__pages)이 3D 에서 `opacity: 0` 이고,
     * opacity 는 쌓임 맥락을 만들어 자식이 아무리 애써도 드러날 수 없기 때문이다 —
     * 초점은 가는데 어디 갔는지 보이지 않는 상태가 된다.
     *
     * 링크 글자는 이미 종이에 있으므로 여기 글자는 낭독기용이다.
     */
    const placeLinks = () => {
      const open = document.querySelector<HTMLElement>('dialog[open]');
      const box = open?.querySelector<HTMLElement>('[data-book-links]');
      if (!box) return;
      const links = activeReader?.visibleLinks() ?? [];
      // 개수가 다를 때만 다시 만든다. 매 프레임 지웠다 만들면 초점이 날아간다.
      if (box.childElementCount !== links.length) {
        box.replaceChildren(
          ...links.map(() => {
            const a = document.createElement('a');
            a.className = 'book__link';
            a.target = '_blank';
            // 연 쪽이 이 창을 건드리지 못하게 한다.
            a.rel = 'noopener noreferrer';
            return a;
          }),
        );
      }
      links.forEach((l, k) => {
        const a = box.children[k] as HTMLAnchorElement;
        a.href = l.href;
        // 글자는 넣지 않는다. 보이는 글자는 캔버스가 그렸고, 여기 글자를 넣으면
        // 감추느라 색을 투명하게 해야 하는데 그러면 대비 검사가 걸고 넘어진다.
        // 이름은 aria-label 로 준다 — 종이에 쓰인 그 말이다.
        a.setAttribute('aria-label', `${l.text} (새 탭에서 열림)`);
        a.style.left = `${Math.round(l.left)}px`;
        a.style.top = `${Math.round(l.top)}px`;
        a.style.width = `${Math.round(l.width)}px`;
        a.style.height = `${Math.round(l.height)}px`;
      });
    };

    /**
     * 종이 위에 얹히는 것들을 제자리에 놓는다 — '남기기' 버튼과 링크 손잡이.
     *
     * 둘은 늘 함께 움직인다. 장이 넘어가거나 화면이 바뀌면 같은 순간에 자리를 다시
     * 잡아야 하므로 부르는 쪽이 하나씩 챙기게 두지 않는다.
     */
    const placeOnPage = () => {
      placeWriteButton();
      placeLinks();
    };

    const readerProgress = (i: number, total: number) => {
      const open = document.querySelector<HTMLElement>('dialog[open]');
      if (!open) return;
      const label = open.querySelector<HTMLElement>('[data-progress]');
      if (label) label.textContent = `${i + 1} / ${total}`;
      renderPips(open, i, total);
      open
        .querySelector<HTMLButtonElement>('[data-action="page-prev"]')
        ?.toggleAttribute('disabled', i <= 0);
      open
        .querySelector<HTMLButtonElement>('[data-action="page-next"]')
        ?.toggleAttribute('disabled', i >= total - 1);
      placeOnPage();
    };

    // 선언 순서에 주의 — 아래 초기화 호출은 이 파일 맨 끝에 있다.
    // applyMode 가 updateProgress 를, 그것이 visibleBody 를 부르므로
    // 셋이 모두 선언된 뒤에 첫 호출이 일어나야 한다.

    // ── 보기 방식 ──────────────────────────────
    const applyMode = (mode: ViewMode) => {
      root.dataset.viewMode = mode;
      for (const btn of document.querySelectorAll<HTMLButtonElement>(
        '[data-action="toggle-view"]',
      )) {
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
      if (activeReader) return; // 3D 리더가 진행표시를 직접 관리한다
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
      scope
        .querySelector<HTMLButtonElement>('[data-action="page-prev"]')
        ?.toggleAttribute('disabled', atStart);
      scope
        .querySelector<HTMLButtonElement>('[data-action="page-next"]')
        ?.toggleAttribute('disabled', atEnd);
    }

    const turnPage = (direction: 1 | -1) => {
      const body = visibleBody();
      if (!body) return;
      body.scrollBy({ left: direction * body.clientWidth });
    };

    // ── 모달 ──────────────────────────────
    const dialogFor = (slug: string) =>
      document.getElementById(`book-dialog-${slug}`) as HTMLDialogElement | null;

    // 누른 책등의 실제 위치·크기에서 책이 커지며 나오는 등장(FLIP).
    // 책장에서 책을 뽑는 느낌을 준다. 움직임 최소화면 건너뛴다(즉시 등장).
    const animateOpenFromSpine = (dialog: HTMLDialogElement, slug: string) => {
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      const stage = dialog.querySelector<HTMLElement>('.book-stage');
      const spine = document.querySelector<HTMLElement>(`[data-book-slug="${slug}"]`);
      if (!stage || !spine) return;
      // 닫힘 FLIP 이 fill:forwards 로 남긴 값(반투명·축소)을 지운다 — 안 지우면
      // 다시 열 때 책이 그 opacity 를 물려받아 투명하게 나온다.
      for (const a of stage.getAnimations()) a.cancel();
      const s = spine.getBoundingClientRect();
      const b = stage.getBoundingClientRect();
      if (!b.width || !b.height) return;

      const dx = s.left + s.width / 2 - (b.left + b.width / 2);
      const dy = s.top + s.height / 2 - (b.top + b.height / 2);
      // 책등 '높이'에 맞춰 시작한다(너비 기준이면 점처럼 작아져 회전이 안 보인다).
      // 그러면 책장의 책등만 한 크기에서 회전하며 뽑혀 나오는 게 보인다.
      const scale = Math.min(1, Math.max(0.28, s.height / b.height));

      // 크기만 커지며 나온다(불투명). 투명 페이드는 두지 않는다 — 반투명하게 나오는
      // 것처럼 보였다. 지속은 --motion-book(1단계) 에 맞춰 CSS 회전(2단계)과 순차가
      // 되게 한다 — 나오는 것과 회전이 겹치지 않아 회전이 또렷이 보인다.
      const mb = parseFloat(getComputedStyle(root).getPropertyValue('--motion-book')) || 680;
      stage.animate(
        [
          { transform: `translate(${dx}px, ${dy}px) scale(${scale})` },
          { transform: 'translate(0, 0) scale(1)' },
        ],
        // ease-in-out 이라 시작에서 튀지 않고 커지는 과정이 보인다(책장에서 뽑히듯).
        { duration: mb, easing: 'cubic-bezier(0.5, 0, 0.2, 1)' },
      );
    };

    const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

    /** 방명록 글의 날짜 표기. HTML 쪽 Guestbook 과 같은 형식으로 맞춘다. */
    const formatWhen = (iso: string) => {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return '';
      return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`;
    };

    // 3D 연출에 필요한 시각 정보를 이미 렌더된 DOM 에서 읽는다(색·제목·소개·기술·본문).
    const txt = (el: Element | null | undefined) => el?.textContent?.trim() || '';
    const readVisual = (dialog: HTMLDialogElement) => {
      const front = dialog.querySelector<HTMLElement>('.book__cover-leaf-front');
      const cs = front ? getComputedStyle(front) : null;
      const body = dialog.querySelector('.book__body');
      const blocks: Block[] = [];
      if (body) {
        // 소개 카드(사진·이름·연락처)가 있으면 첫 블록으로.
        const card = body.querySelector('.profile-card');
        if (card) {
          blocks.push({
            kind: 'header',
            name: txt(card.querySelector('.profile-card__name')),
            english: txt(card.querySelector('.profile-card__english')) || undefined,
            contacts: Array.from(card.querySelectorAll('.profile-card__contacts li'))
              .map((li) => txt(li))
              .filter(Boolean),
            // 사진은 HTML 이 이미 <img> 로 들고 있다. 주소만 가져가면 3D 가 같은 것을
            // 캔버스에 그린다. 자리표시자일 때는 <span> 이라 여기서 걸리지 않는다.
            photo: card.querySelector<HTMLImageElement>('img.profile-card__photo')?.src,
          });
        }
        // 본문 산문(소제목·문단·목록). querySelectorAll 은 문서 순서로 주므로
        // 마크다운에 쓴 차례가 그대로 유지된다.
        const prose = body.querySelector('.book__prose') ?? body;
        // 목록 항목은 중첩된 하위 목록을 뺀 제 몫만 읽는다 — 안 그러면 자식 항목이
        // 부모에도 한 번, 자기 차례에 또 한 번 들어간다.
        const ownText = (el: Element) => {
          const clone = el.cloneNode(true) as Element;
          for (const nested of Array.from(clone.querySelectorAll('ul, ol'))) nested.remove();
          return clone.textContent?.trim() ?? '';
        };
        for (const el of Array.from(prose.querySelectorAll('.product, h2, h3, p, li'))) {
          // 제품 머리(로고 + 이름 + 회사·기간)는 통째로 한 덩이다. 그 안의 h2·p 를
          // 따로 또 읽으면 같은 말이 두 번 들어간다.
          const head = el.closest('.product');
          if (head && head !== el) continue;
          if (head === el) {
            blocks.push({
              kind: 'product',
              name: txt(el.querySelector('.product__name')),
              meta: txt(el.querySelector('.product__when')) || undefined,
              logo: el.querySelector<HTMLImageElement>('img.product__logo')?.src,
              // 흰색 로고인지 아닌지는 콘텐츠가 클래스로 표시한다. 3D 는 그 표시를 보고
              // 어두운 판을 깐다 — 캔버스에서 픽셀을 뜯어 밝기를 재지 않는다.
              logoOnDark: !!el.querySelector('img.product__logo--on-dark'),
            });
            continue;
          }
          // 느슨한 목록(marked 가 <li><p>…</p></li> 로 감싼 경우)의 문단은 건너뛴다.
          if (el.tagName === 'P' && el.closest('li')) continue;
          const text = el.tagName === 'LI' ? ownText(el) : txt(el);
          if (!text) continue;
          // 덩이가 **통째로** 링크일 때만 종이에서 눌린다(book3d 의 Block 주석).
          // `a.href` 는 브라우저가 절대 주소로 풀어 준 값이다.
          const a = el.querySelector('a');
          const href = a && txt(a) === text ? a.href : undefined;
          if (el.tagName === 'LI') blocks.push({ kind: 'li', text, href });
          else if (el.tagName === 'H2') blocks.push({ kind: 'h', text });
          else if (el.tagName === 'H3') blocks.push({ kind: 'h', text, sub: true });
          else blocks.push({ kind: 'p', text, href });
        }
        // 기술 스택.
        for (const item of Array.from(body.querySelectorAll('.tech-item'))) {
          blocks.push({
            kind: 'tech',
            name: txt(item.querySelector('.tech-item__name')),
            color: item.getAttribute('data-tech-color') || undefined,
            desc: txt(item.querySelector('.tech-item__desc')),
          });
        }
      }
      return {
        cover: cs?.backgroundColor || '#7d3b2a',
        ink: cs?.color || '#f3e6dc',
        pages: getComputedStyle(root).getPropertyValue('--spine-pages').trim() || '#ece0c4',
        title: dialog.querySelector('.book__cover-title')?.textContent?.trim() || '',
        year: dialog.querySelector('.book__cover-year')?.textContent?.trim() || undefined,
        blocks,
      };
    };
    // 책 크기와 보기 모드. 넓은 화면은 두 면 펼침, 두 면(2×coverW)이 폭에 편히 안
    // 들어가는 좁은 화면(모바일)은 한 면만 폭에 꽉 채우는 single 모드로 연다.
    const bookDims = () => {
      // 방(제목·여백)이 보이는 적당한 크기 — 화면 높이의 78%, 상한 700. 두 면 폭도
      // 화면 폭을 넘지 않게 제한. 화면 정중앙에 놓인다(restCenter 이동 없음).
      const spreadH = Math.min(
        700,
        window.innerHeight * 0.78,
        (window.innerWidth * 0.94) / (2 * 0.72),
      );
      const spreadW = spreadH * 0.72;
      const single = window.innerWidth < spreadW * 2 * 1.08;
      if (!single) {
        return { coverW: spreadW, coverH: spreadH, thickness: spreadH * 0.085, single: false };
      }
      // 한 면: 폭을 90%까지 채우되 세로가 82%를 넘지 않게. 종횡비 0.72(세로가 김) 유지.
      let pageW = window.innerWidth * 0.9;
      let pageH = pageW / 0.72;
      const maxH = window.innerHeight * 0.82;
      if (pageH > maxH) {
        pageH = maxH;
        pageW = pageH * 0.72;
      }
      return { coverW: pageW, coverH: pageH, thickness: pageH * 0.06, single: true };
    };
    const spineElOf = (slug: string) => document.querySelector(`[data-book-slug="${slug}"]`);
    const spineRectOf = (slug: string) => spineElOf(slug)?.getBoundingClientRect();
    // 3D 로 빠져나온 책은 책장에서 감춘다(자리는 빈 채). 닫으면 되돌린다.
    const setPulled = (slug: string, on: boolean) =>
      spineElOf(slug)?.classList.toggle('is-pulled', on);
    const clearPulled = () => {
      for (const el of document.querySelectorAll('[data-book-slug].is-pulled'))
        el.classList.remove('is-pulled');
    };

    const openDialog = (slug: string, pushHistory: boolean) => {
      const dialog = dialogFor(slug);
      if (!dialog || dialog.open) return false;
      delete dialog.dataset.closing; // 접힘 도중 재열림 대비

      const spineRect = spineRectOf(slug);
      // 어떤 책은 3D 로 열지 않는다 — 책이 스스로 표시한다(schema.ts 의 `reader`).
      // 원래 방명록을 위한 탈출구였으나 R-2 가 뒤집혀(2026-08-01) 방명록도 3D 로 연다.
      // **지금 이 값을 쓰는 책은 없다.** 지우지 않은 이유는 schema.ts 주석에 적어 두었다.
      const flatOnly = dialog.dataset.readerMode === 'flat';
      const use3D = !flatOnly && !reduced() && !!spineRect;
      if (use3D) {
        // 3D 가 등장을 그리는 동안 모달은 숨기고(정적 펼침 상태로) 방·3D 책을 보인다.
        dialog.dataset.open3d = '';
        dialog.dataset.intro = '';
        setPulled(slug, true); // 책장의 그 책을 감춘다
      }
      dialog.showModal();
      // 주소는 바꾸지 않는다 — 뒤로 가기로 덮기 위한 히스토리 항목만 남긴다.
      // (책은 3D/모달로만 열리므로 딥링크·정적 페이지가 없다.)
      if (pushHistory) history.pushState({ bookSlug: slug }, '');
      requestAnimationFrame(updateProgress);

      if (!use3D) {
        animateOpenFromSpine(dialog, slug); // 폴백: 기존 CSS 등장
        return true;
      }

      const v = readVisual(dialog);
      const dims = bookDims();
      // 글이 늘면 이 v 의 blocks 를 다시 만들어 그린다(onGuestbookChanged).
      // 원본(안내문만)을 따로 남긴다 — v.blocks 에는 글까지 섞여 있어 다시 못 쓴다.
      openVisual = dialog.dataset.guestbook === undefined ? null : v;
      openBaseBlocks = v.blocks ? [...v.blocks] : [];

      const withEntries = () =>
        dialog.dataset.guestbook === undefined
          ? Promise.resolve(v.blocks ?? [])
          : guestbookBlocks(v.blocks ?? []);
      import('./book3d')
        // 방명록이면 남겨진 글을 블록에 더한다. 목록이 늦거나 실패하면 없는 채로 연다.
        .then((m) => withEntries().then((blocks) => ({ m, blocks })))
        // 페이지 텍스처는 한 번에 동기로 그려지므로 이미지가 그 전에 손에 있어야 한다.
        // 대개 HTML 이 같은 주소를 이미 받아 두어 즉시 끝난다. 못 받아도 거절하지 않고
        // 자리표시 네모로 그린다 — 로고가 안 뜨는 것보다 책이 안 열리는 것이 나쁘다.
        .then(({ m, blocks }) => {
          v.blocks = blocks;
          return m.preloadBlockImages(blocks).then(() => m);
        })
        .then((m) => m.getBook3D())
        .then((eng) => {
          if (!dialog.open || dialog.dataset.intro == null) return; // 이미 닫힘
          eng.onProgress = readerProgress;
          eng.show();
          readerEngine = eng; // 화면에 올랐다 — 이제부터 어느 경로로 닫든 걷어낸다
          eng.playOpen({
            spineRect: spineRect!,
            v,
            ...dims,
            duration: 1300,
            // 다 펼친 뒤에도 3D 를 유지한다(리더). HTML 종이·표지는 감추고 낭독기용으로만
            // DOM 에 남기며, 조작 막대만 3D 위에 보인다. 넘김·닫기가 이 엔진으로 간다.
            onDone: () => {
              // 등장이 끝나기 전에 닫혔으면(경합) 3D 만 걷어내고 리더로 승격하지 않는다.
              if (!dialog.open) {
                teardownEngine();
                return;
              }
              delete dialog.dataset.intro;
              dialog.dataset.reader = '';
              activeReader = eng;
              placeOnPage();
            },
          });
        })
        .catch(() => {
          delete dialog.dataset.intro; // WebGL 불가 → 정적으로 즉시 표시(폴백)
          delete dialog.dataset.open3d;
        });
      return true;
    };

    // 덮기 — 펼침의 역동작으로 책이 접히며(전체→반쪽) 책장으로 되돌아 들어간다.
    const animateCloseToSpine = (dialog: HTMLDialogElement, slug: string) => {
      const stage = dialog.querySelector<HTMLElement>('.book-stage');
      const spine = document.querySelector<HTMLElement>(`[data-book-slug="${slug}"]`);
      if (!stage || !spine) return null;
      const s = spine.getBoundingClientRect();
      const b = stage.getBoundingClientRect();
      if (!b.width || !b.height) return null;

      const dx = s.left + s.width / 2 - (b.left + b.width / 2);
      const dy = s.top + s.height / 2 - (b.top + b.height / 2);
      const scale = Math.min(1, Math.max(0.28, s.height / b.height));

      // 닫기 3단계: 1접힘 → 2제자리 회전(표지→책등) → 3책장으로. FLIP 은 3단계라
      // 회전이 끝난 뒤(2*--motion-book) 시작해, 책등이 그대로 책장으로 들어간다.
      const mb = parseFloat(getComputedStyle(root).getPropertyValue('--motion-book')) || 680;
      return stage.animate(
        [
          { transform: 'translate(0, 0) scale(1)', opacity: 1, offset: 0 },
          { opacity: 1, offset: 0.5 },
          {
            transform: `translate(${dx}px, ${dy}px) scale(${scale})`,
            opacity: 0.2,
            offset: 1,
          },
        ],
        { duration: mb, delay: mb * 2, easing: 'cubic-bezier(0.5, 0, 0.2, 1)', fill: 'forwards' },
      );
    };

    // 덮기 요청 — 연출을 재생한 뒤 실제로 닫는다. 움직임 최소화면 즉시 닫는다.
    const requestClose = (dialog: HTMLDialogElement) => {
      if (!dialog.open || dialog.dataset.closing != null) return;
      const slug = dialog.id.slice('book-dialog-'.length);
      const finish = () => {
        delete dialog.dataset.closing;
        delete dialog.dataset.open3d;
        delete dialog.dataset.reader;
        setPulled(slug, false); // 책장에 책을 되돌린다
        dialog.close();
      };
      if (reduced()) {
        setPulled(slug, false);
        dialog.close();
        return;
      }
      dialog.dataset.closing = '';

      // 다 펼쳐진 3D 리더 → 3D 로 곱게 닫는다(표지 덮고 회전하며 책장으로).
      const reader = activeReader;
      const spineRect = spineRectOf(slug);
      if (reader && spineRect) {
        activeReader = null;
        readerEngine = null; // 아래 playClose 의 onDone 에서 직접 hide/clear 한다
        delete dialog.dataset.reader;
        dialog.dataset.intro = ''; // 조작 막대까지 감추고 3D 책만 보인다
        reader.playClose({
          spineRect,
          coverH: bookDims().coverH,
          duration: 1000,
          onDone: () => {
            reader.hide();
            reader.clear();
            finish();
          },
        });
        return;
      }

      // 아직 3D 등장 중(activeReader 는 아직 없지만 엔진은 화면에 있음) → 등장을 멈추고
      // 3D 를 즉시 걷어낸 뒤 닫는다. 안 그러면 닫아도 캔버스에 책이 남아 조작이 안 된다.
      if (readerEngine) {
        teardownEngine();
        finish();
        return;
      }

      // 폴백: 기존 CSS 접힘 + JS FLIP
      const flip = animateCloseToSpine(dialog, slug);
      if (flip) flip.finished.then(finish).catch(finish);
      else window.setTimeout(finish, 680);
    };

    // <dialog>.close() 의 close 이벤트는 비동기로 발생한다. 책을 갈아탈 때 닫은
    // 이전 책의 뒤늦은 close 가 onClose 를 타고 history.back() 을 불러 새 책까지
    // 닫아버린다. 이 카운터로 '그 한 번의 close 는 히스토리를 건드리지 않는다'를 표시한다.
    let swallowCloseHistory = 0;

    // 책 사이 이동 — 지금 열린 책을 즉시(연출 없이) 접고 다른 책을 연다.
    // 히스토리는 항목 하나로 유지한다(replace) — 뒤로 가기 한 번이면 방으로 나간다.
    const switchBook = (slug: string) => {
      swallowCloseHistory++; // 닫히는 책의 close 이벤트가 history.back 을 부르지 않게
      closeOpenDialog(); // 현재 책 닫기
      history.replaceState({ bookSlug: slug }, '');
      openDialog(slug, false);
    };

    let closingFromHistory = false;
    const closeOpenDialog = () => {
      const open = document.querySelector<HTMLDialogElement>('dialog[open]');
      if (!open) return;
      closingFromHistory = true;
      clearPulled();
      delete open.dataset.open3d;
      delete open.dataset.reader;
      delete open.dataset.intro;
      teardownEngine(); // 등장 중이든 다 펼쳤든 3D 를 걷어낸다
      open.close();
      closingFromHistory = false;
    };

    // ── 스와이프로 넘김 (3D 리더에서) ──────────────────────────────
    // 한 면 모드는 위/아래로 넘기는 게 자연스럽고, 두 면 모드는 좌/우. 어느 축이든 큰
    // 쪽으로 판정한다: 위·왼쪽=다음, 아래·오른쪽=이전. 스와이프 뒤 따라오는 click(배경
    // 탭=닫기)이 오작동하지 않게 한 번 삼킨다.
    let touchX = 0;
    let touchY = 0;
    let touching = false;
    let swallowClick = false;
    const onTouchStart = (e: TouchEvent) => {
      if (!activeReader || e.touches.length !== 1) return;
      // 글쓰기 폼 위에서 시작한 손짓은 넘김이 아니다 — 커서를 옮기거나 글자를 고르는 중이다.
      if ((e.target as Element | null)?.closest('.guestbook')) return;
      touching = true;
      touchX = e.touches[0].clientX;
      touchY = e.touches[0].clientY;
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (!touching) return;
      touching = false;
      if (!activeReader) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - touchX;
      const dy = t.clientY - touchY;
      const TH = 44; // 이보다 작으면 탭으로 본다
      let dir: 1 | -1 | 0 = 0;
      if (Math.abs(dy) >= Math.abs(dx)) {
        if (dy <= -TH)
          dir = 1; // 위로 = 다음
        else if (dy >= TH) dir = -1; // 아래로 = 이전
      } else {
        if (dx <= -TH)
          dir = 1; // 왼쪽 = 다음
        else if (dx >= TH) dir = -1; // 오른쪽 = 이전
      }
      if (dir !== 0) {
        swallowClick = true; // 이 스와이프 뒤 click 은 무시(배경 탭 닫기 방지)
        // 누르기와 같은 규칙 — 쓰는 중이면 넘기지 않고 다 쓴다.
        if (skipInk) {
          skipInk();
          return;
        }
        activeReader.turn(dir);
        placeOnPage(); // 넘기는 동안에는 뗀다 — 끝나면 readerProgress 가 다시 잡는다
      }
    };

    /** 돌고 있는 잉킹. 창이 닫히거나 다른 책으로 가면 멈춘다. */
    let inkRaf = 0;
    /** 쓰는 중일 때만 채워진다. 누르면 끝까지 건너뛴다. */
    let skipInk: (() => void) | null = null;
    const stopInk = () => {
      if (inkRaf) cancelAnimationFrame(inkRaf);
      inkRaf = 0;
      skipInk = null;
    };

    /**
     * 손으로 적는 속도. 글자 수에 비례한다.
     *
     * 예전에는 길이와 무관하게 1.4초였다. 짧은 글에는 맞았지만 긴 글은 종이에 글자가
     * 쏟아지듯 나타나 손으로 적는 것으로 보이지 않았다. 위아래 한도를 두는 이유는,
     * 한 글자짜리 글이 눈 깜짝할 새 끝나거나 500자 글이 12초를 잡아먹지 않게 하기
     * 위해서다. 기다리기 싫으면 종이를 눌러 건너뛸 수 있다.
     */
    const inkDuration = (chars: number) => Math.min(9000, Math.max(1200, chars * 45));

    /**
     * 방금 남긴 글을 종이에 그어 넣는다.
     *
     * 종이 텍스처에 직접 그리므로 책이 기울면 펜도 같이 기운다 — 줄을 나눈 그 코드가
     * 드러내는 일까지 맡는다(book3d 의 Reveal).
     *
     * 글이 다음 면까지 넘치면 **펜을 따라 책이 넘어간다.** 펜이 어느 면에 있는지는
     * reveal 이 알려 준다 — 넘기는 동안에는 시간을 세지 않는다(넘김이 끝나면 펜이
     * 저만치 가 있게 된다).
     */
    const inkIn = (eng: Book3D, block: number, chars: number) => {
      stopInk();
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

      const dur = inkDuration(chars);
      let elapsed = 0;
      let last = performance.now();
      let turning = false;

      const step = (now: number) => {
        if (activeReader !== eng) return stopInk(); // 그 사이 책이 바뀌었다

        // 넘기는 동안에는 **그리지도 세지도 않는다.** reveal 은 지금 장을 다시 물리므로
        // (showSpread) 넘김 연출이 갈아 끼운 재질을 덮어써 장면이 튄다.
        if (turning) {
          last = now;
          inkRaf = requestAnimationFrame(step);
          return;
        }

        elapsed += now - last;
        last = now;

        const p = Math.min(1, elapsed / dur);
        const r = eng.reveal(block, p);
        if (!r.ok) return stopInk();

        // 펜을 따라간다. 다 쓰고 나면 펜이 사라져 물어볼 수 없으므로, 그때는 글이
        // 끝나는 면을 짚는다 — 건너뛰기로 단숨에 끝냈을 때가 그 경우다.
        const at = r.penPage >= 0 ? r.penPage : p >= 1 ? eng.lastPageOfBlock(block) : -1;
        if (at >= 0) {
          const to = eng.spreadOfPage(at);
          if (to !== eng.spread) {
            turning = true;
            eng.turnTo(to, () => {
              turning = false;
              placeOnPage();
            });
          }
        }

        if (p < 1 || turning) inkRaf = requestAnimationFrame(step);
        else stopInk();
      };

      // 다 쓴 것으로 만든다. 종이를 누르면 이것이 불린다.
      skipInk = () => {
        elapsed = dur;
      };
      inkRaf = requestAnimationFrame(step);
    };

    /**
     * 방명록에 글이 하나 늘었다(Guestbook 이 알려 준다).
     *
     * 3D 는 열릴 때 페이지를 한 번 그려 두므로, 방금 남긴 글은 종이에 없다. 목록을 다시
     * 받아 페이지를 다시 그리고, **그 글이 놓인 장까지 넘긴 뒤 펜으로 쓴다.**
     *
     * 책 안에서는 시간순이라 새 글은 늘 맨 뒤에 붙는다 — 그래서 넘김은 언제나 앞으로
     * 간다. 어느 장에서 남겼든 마지막 장으로 가는 셈이다.
     */
    const onGuestbookChanged = () => {
      const eng = activeReader;
      const v = openVisual;
      if (!eng || !v) return; // 평면이면 React 가 이미 목록을 고쳤다
      void guestbookBlocks(openBaseBlocks).then((blocks) => {
        if (activeReader !== eng) return; // 그 사이 책이 바뀌었다
        v.blocks = blocks;
        // 새 글은 시간순의 맨 끝 — 마지막 entry 덩이다.
        const block = blocks.map((b) => b.kind).lastIndexOf('entry');
        // 잉크가 0 인 상태로 먼저 그려 둔다. 그래야 장이 넘어간 순간 글이 이미 다
        // 쓰여 있는 채로 드러나지 않는다.
        eng.rebuildPages(v);
        if (block >= 0) eng.reveal(block, 0);
        placeOnPage();
        if (block < 0) return;

        const page = eng.pageOfBlock(block);
        if (page < 0) return;
        // 쓰는 속도는 글자 수를 따른다. 그 덩이의 본문 길이가 곧 펜이 지날 거리다.
        const bl = blocks[block];
        const chars = bl.kind === 'entry' ? [...bl.text].length : 0;
        eng.turnTo(eng.spreadOfPage(page), () => {
          placeOnPage();
          inkIn(eng, block, chars);
        });
      });
    };

    // ── 이벤트 ──────────────────────────────
    const onClick = (e: MouseEvent) => {
      if (
        e.defaultPrevented ||
        e.button !== 0 ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey
      ) {
        return;
      }
      if (swallowClick) {
        swallowClick = false; // 스와이프 직후의 click 한 번을 흘려보낸다
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
      if (action === 'page-prev' || action === 'page-next') {
        const dir = action === 'page-next' ? 1 : -1;
        if (!activeReader) return turnPage(dir);
        // 쓰는 중에 넘기려 하면 먼저 다 쓴다. 여기서 넘겨 버리면 잉킹이 뒤에서 계속
        // 돌다가 저 혼자 되돌아온다(펜을 따라가므로).
        if (skipInk) {
          skipInk();
          return;
        }
        activeReader.turn(dir);
        placeOnPage(); // 위와 같은 이유 — 넘기는 동안에는 뗀다
        return;
      }

      // 창 — 해가 떴다 진다. 지면 처음 상태(기본 창)로 돌아간다. 밤(어두운 하늘) 없음.
      if (action === 'toggle-sky') {
        const day = root.dataset.sky === 'day';
        if (day) delete root.dataset.sky;
        else root.dataset.sky = 'day';
        target
          ?.closest<HTMLElement>('[data-action="toggle-sky"]')
          ?.setAttribute('aria-label', day ? '해 띄우기' : '해 지우기');
        return;
      }

      // 화분 — 잎이 하나씩 떨어지고, 한 장 남았을 때 누르면 꽃이 핀다. 다시 누르면 처음으로.
      if (action === 'plant') {
        const plant = target?.closest<HTMLElement>('[data-action="plant"]');
        if (!plant) return;
        const fall = (n: string) =>
          plant.querySelector<SVGElement>(`[data-leaf="${n}"]`)?.classList.add('leaf--fallen');

        if (plantStage === 3) {
          fall('3');
          plantStage = 2;
        } else if (plantStage === 2) {
          fall('2');
          plantStage = 1;
        } else if (plantStage === 1) {
          plant.classList.add('is-bloomed'); // 마지막 잎은 남기고 꽃이 핀다
          plantStage = 0;
        } else {
          plant.classList.remove('is-bloomed');
          for (const leaf of plant.querySelectorAll('.leaf')) leaf.classList.remove('leaf--fallen');
          plantStage = 3;
        }
        return;
      }

      // 책장 바로가기 (FR-019).
      // 조각 링크만으로도 이동은 되지만, 스크롤 스냅과 겹치면 목표 책장이
      // 화면에 절반만 걸친 채 멈춘다. JS 가 있을 때는 정확히 가운데로 보낸다.
      // 가로채지 못하면 평범한 앵커로 동작해 근사 위치까지는 간다.
      const shelfLink = target?.closest<HTMLElement>('[data-shelf-link]');
      if (shelfLink) {
        const item = document.querySelector(`[data-shelf-slug="${shelfLink.dataset.shelfLink}"]`);
        if (item) {
          e.preventDefault();
          const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
          item.scrollIntoView({
            inline: 'center',
            block: 'nearest',
            behavior: reduced ? 'auto' : 'smooth',
          });
        }
        return;
      }

      // 책장 책등(data-book-slug) 또는 열린 책 안의 '다른 책' 버튼(data-book-goto).
      const trigger = target?.closest<HTMLElement>('[data-book-slug], [data-book-goto]');
      if (trigger) {
        const slug = trigger.dataset.bookSlug ?? trigger.dataset.bookGoto;
        if (!slug) return;
        const openNow = document.querySelector<HTMLDialogElement>('dialog[open]');
        if (openNow && openNow.id !== `book-dialog-${slug}`) {
          // 이미 다른 책이 열려 있다 — '다른 책' 버튼을 누른 경우. 갈아탄다.
          e.preventDefault();
          switchBook(slug);
        } else if (!openNow && openDialog(slug, true)) {
          e.preventDefault();
        }
        return;
      }

      // 3D 리더에서 책 위를 누르면 그 반쪽 방향으로 넘긴다(왼쪽=이전, 오른쪽=다음).
      //
      // 요소로는 가릴 수 없다. 책은 캔버스에 그려지고 그 캔버스는 pointer-events:none 이라
      // 클릭이 통과하며, 밑에 깔린 HTML(.book, dialog)이 제각각 대상이 된다. 그래서 3D 가
      // 알려 주는 책의 화면 사각형과 좌표를 견준다.
      //
      // 도구막대와 글쓰기 폼은 뺀다 — 진짜 눌러야 할 것이 거기 있다.
      const bookArea = activeReader?.bookRect();
      const onChrome = target?.closest('.book__tools, .guestbook');
      if (
        bookArea &&
        !onChrome &&
        e.clientX >= bookArea.left &&
        e.clientX <= bookArea.left + bookArea.width &&
        e.clientY >= bookArea.top &&
        e.clientY <= bookArea.top + bookArea.height
      ) {
        // 쓰는 중이면 장을 넘기는 대신 **글을 끝까지 쓴다.** 기다리기 싫은 사람에게
        // 필요한 것은 다음 장이 아니라 다 쓰인 글이다. 넘기려면 한 번 더 누르면 된다.
        if (skipInk) {
          skipInk();
          return;
        }
        activeReader!.turn(e.clientX < bookArea.left + bookArea.width / 2 ? -1 : 1);
        placeOnPage(); // 넘기는 동안에는 뗀다 — 끝나면 readerProgress 가 다시 잡는다
        return;
      }

      // <dialog> 는 ::backdrop 클릭을 스스로 처리하지 않는다. 클릭 대상이
      // dialog 요소 자신이면 내용 바깥을 누른 것이다 (R-5).
      //
      // **책 모달만 그렇게 닫는다.** 방명록 글쓰기 모달도 <dialog> 라, 걸러 내지 않으면
      // 그 바깥을 눌렀을 때 책을 접는 연출이 돈다(닫아야 할 것은 폼인데).
      if (target instanceof HTMLDialogElement && target.open) {
        if (target.classList.contains('guestbook__modal')) target.close();
        else if (target.id.startsWith('book-dialog-')) requestClose(target);
      }
    };

    // 덮기 버튼(form method=dialog) — 즉시 닫히는 대신 접힘 연출 뒤 닫는다.
    const onSubmit = (e: Event) => {
      const form = e.target;
      if (!(form instanceof HTMLFormElement) || form.getAttribute('method') !== 'dialog') return;
      const dialog = form.closest('dialog');
      if (dialog instanceof HTMLDialogElement && dialog.open) {
        e.preventDefault();
        requestClose(dialog);
      }
    };

    // Esc — 기본 취소(즉시 닫힘)를 막고 접힘 연출을 거친다.
    /** 책 모달인가. 방명록 글쓰기 모달도 <dialog> 라 반드시 갈라 봐야 한다. */
    const isBookDialog = (el: EventTarget | null): el is HTMLDialogElement =>
      el instanceof HTMLDialogElement && el.id.startsWith('book-dialog-');

    const onCancel = (e: Event) => {
      // 글쓰기 모달의 Esc 는 브라우저가 알아서 닫게 둔다 — 여기서 가로채면 폼을 닫으려던
      // Esc 가 책을 접는다.
      const dialog = e.target;
      if (isBookDialog(dialog) && dialog.open) {
        e.preventDefault();
        requestClose(dialog);
      }
    };

    const onClose = (e: Event) => {
      // 글쓰기 모달이 닫힌 것이면 히스토리를 건드리지 않는다. 그러지 않으면 폼을 닫는
      // 순간 history.back() 이 돌아 책까지 닫힌다.
      if (!isBookDialog(e.target)) return;
      if (swallowCloseHistory > 0) {
        swallowCloseHistory--; // 갈아타기로 닫힌 책 — 히스토리는 그대로 둔다
        return;
      }
      if (closingFromHistory) return;
      if (history.state?.bookSlug) history.back();
    };

    const onPopState = () => {
      const slug = (history.state as { bookSlug?: string } | null)?.bookSlug;
      if (slug) openDialog(slug, false);
      else closeOpenDialog();
    };

    const onScrollOrResize = () => {
      // 등장 중(readerEngine)이든 다 펼쳤든(activeReader) 화면에 올라온 3D 를 맞춘다.
      readerEngine?.onResize();
      updateProgress();
      placeOnPage();
    };

    document.addEventListener('click', onClick);
    document.addEventListener('guestbook:changed', onGuestbookChanged);
    document.addEventListener('submit', onSubmit);
    document.addEventListener('cancel', onCancel, true);
    document.addEventListener('close', onClose, true);
    document.addEventListener('scroll', onScrollOrResize, true);
    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchend', onTouchEnd, { passive: true });
    window.addEventListener('popstate', onPopState);
    window.addEventListener('resize', onScrollOrResize);

    // ── 현재 보고 있는 책장 표시 (FR-018) ──────────────────────────────
    // 좁은 화면에서 책장이 가로로 넘어갈 때, 지금 몇 번째를 보고 있는지 알려준다.
    // 스크롤 위치를 직접 계산하지 않고 교차 관찰에 맡긴다 — 스냅 위치·여백·
    // 화면 크기 변화를 브라우저가 알아서 반영한다.
    const shelfObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const slug = (entry.target as HTMLElement).dataset.shelfSlug;
          if (!slug) continue;
          for (const link of document.querySelectorAll<HTMLAnchorElement>('[data-shelf-link]')) {
            const isCurrent = link.dataset.shelfLink === slug;
            if (isCurrent) link.setAttribute('aria-current', 'true');
            else link.removeAttribute('aria-current');
          }
        }
      },
      { threshold: 0.6 },
    );
    for (const item of document.querySelectorAll('[data-shelf-slug]')) {
      shelfObserver.observe(item);
    }

    // 초기화는 모든 선언이 끝난 뒤에. 인라인 스크립트가 이미 속성을 붙여 두었더라도
    // 버튼 라벨과 aria-pressed 는 여기서 맞춰야 한다.
    applyMode(readStoredMode(globalThis.localStorage));

    // 준비 완료 신호. 이 속성이 붙기 전에는 책 링크가 아직 가로채이지 않아,
    // 누르면 모달이 아니라 책 페이지로 이동한다(그래도 내용에는 도달한다).
    // E2E 가 이 신호를 기다린다 — 없으면 부하에 따라 결과가 갈리는 시험이 된다.
    root.dataset.bookReady = 'true';

    return () => {
      delete root.dataset.bookReady;
      document.removeEventListener('click', onClick);
      document.removeEventListener('guestbook:changed', onGuestbookChanged);
      document.removeEventListener('submit', onSubmit);
      document.removeEventListener('cancel', onCancel, true);
      document.removeEventListener('close', onClose, true);
      document.removeEventListener('scroll', onScrollOrResize, true);
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('popstate', onPopState);
      window.removeEventListener('resize', onScrollOrResize);
      shelfObserver.disconnect();
    };
  }, []);

  return null;
}
