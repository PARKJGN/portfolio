'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  fetchEntries,
  submitEntry,
  GuestbookError,
  type EntryPage,
  type GuestbookEntry,
} from '@/lib/guestbook-client';

/**
 * 방명록 — 남긴 글 목록과, 글을 쓰는 모달.
 *
 * 이 책도 다른 책과 똑같이 3D 로 연다. 예전에는 3D 가 한 면을 통째로 비우고 그 자리에
 * 이 폼을 얹었는데, 장을 넘겨도 폼이 따라다녀 종이 위에 놓인 물건이 아니라 화면에 붙은
 * 물건으로 보였다. 지금은 종이 구석의 '남기기' 버튼을 누르면 모달이 열린다 —
 * 좌우로는 남들이 남긴 글이 그대로 보인다.
 *
 * 목록은 화면에도 쓰이고(평면 폴백) 낭독기도 읽는다. 3D 에서는 같은 내용을 종이가
 * 그리므로 목록을 화면에서만 뺀다(guestbook.css).
 *
 * 글은 **텍스트로만** 넣는다. React 가 기본으로 그렇게 하므로 `dangerouslySetInnerHTML`
 * 을 쓰지 않는 것으로 충분하다 — 마크다운도 링크도 해석하지 않는다(R-8).
 */

const AUTHOR_MAX = 20;
const BODY_MAX = 500;

/**
 * `api/src/guard/bot.ts` 의 MIN_FILL_MS. 저쪽은 별도 프로젝트라 가져오지 않고 적는다.
 *
 * 서버는 폼이 뜬 지 이 시간 안에 온 제출을 봇으로 보고 **저장하지 않은 채 성공처럼**
 * 응답한다. 봇에게 실패를 알려 주지 않으려는 설계인데(계약), 빨리 적는 사람이 그걸
 * 뒤집어쓰면 글이 사라진 줄도 모른다. 모자란 만큼 여기서 기다렸다 보낸다.
 */
const MIN_FILL_MS = 3000;

type Notice = { kind: 'held' | 'error'; text: string } | null;

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`;
}

export function Guestbook() {
  const authorId = useId();
  const bodyId = useId();
  const websiteId = useId();

  const [entries, setEntries] = useState<GuestbookEntry[]>([]);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [author, setAuthor] = useState('');
  const [body, setBody] = useState('');
  const [website, setWebsite] = useState(''); // 숨은 칸 — 사람은 채우지 않는다
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  /** 성공했을 때만 채운다. 모달 밖 live region 이 이것을 읽는다. */
  const [done, setDone] = useState('');

  // 폼이 화면에 나타난 시각. 서버가 "너무 빠른 제출"을 가려낼 때 쓴다.
  // 모달을 열 때마다 다시 잡는다 — 창을 연 시각이라야 "얼마나 빨리 적었나"가 뜻을 가진다.
  const openedAt = useRef(new Date().toISOString());
  /** 감싸는 책 <dialog> 를 찾기 위한 손잡이 — 언제 불러올지 정하는 데 쓴다. */
  const rootRef = useRef<HTMLElement>(null);
  /** 글쓰기 모달. 책 모달 안에 겹쳐 뜬다. */
  const composeRef = useRef<HTMLDialogElement>(null);

  const applyPage = useCallback((page: EntryPage, append: boolean) => {
    setEntries((prev) => (append ? [...prev, ...page.entries] : page.entries));
    setNextBefore(page.nextBefore);
    setLoadError(null);
    setLoading(false);
  }, []);

  const applyLoadError = useCallback((err: unknown) => {
    // 방명록이 죽어도 나머지 책은 그대로 읽힌다(FR-019). 여기서는 안내만 한다.
    setLoadError(err instanceof GuestbookError ? err.message : '방명록을 불러오지 못했습니다.');
    setLoading(false);
  }, []);

  /**
   * 방명록 책을 **열었을 때** 한 번 불러온다.
   *
   * 마운트 시점에 부르지 않는 이유: 이 컴포넌트는 닫힌 `<dialog>` 안에 들어 있어 방을
   * 여는 순간 함께 마운트된다. 그대로 두면 책을 한 번도 누르지 않은 방문자까지 API 를
   * 부른다 — 실제로 그랬다(라이트하우스 네트워크 기록에서 발견). 쓸데없는 요청이고,
   * 첫 화면이 그리는 동안 대역폭을 나눠 가지며, 한도까지 축낸다.
   *
   * dialog 는 열릴 때 이벤트를 주지 않으므로(close 만 있다) open 속성을 지켜본다.
   *
   * 상태 갱신을 then/catch 안에 두는 이유는 취소 처리 때문만이 아니다. 이펙트 본문에서
   * 곧바로 setState 를 부르면 렌더가 연쇄한다 — 린트(react-hooks/set-state-in-effect)가
   * 그것을 잡는다. 여기서는 응답이 온 뒤에만 상태가 바뀐다.
   */
  useEffect(() => {
    const controller = new AbortController();
    const dialog = rootRef.current?.closest('dialog');

    let started = false;
    const start = () => {
      if (started) return;
      started = true;
      fetchEntries(undefined, controller.signal).then(
        (page) => {
          if (!controller.signal.aborted) applyPage(page, false);
        },
        (err: unknown) => {
          if (!controller.signal.aborted) applyLoadError(err);
        },
      );
    };

    // dialog 밖에서 쓰이면(테스트·다른 배치) 기다릴 것이 없다.
    if (!dialog || dialog.open) {
      start();
      return () => controller.abort();
    }

    const observer = new MutationObserver(() => {
      if (dialog.open) {
        observer.disconnect();
        start();
      }
    });
    observer.observe(dialog, { attributes: true, attributeFilter: ['open'] });

    return () => {
      observer.disconnect();
      controller.abort();
    };
  }, [applyPage, applyLoadError]);

  /**
   * 책 컨트롤러가 종이 구석의 '남기기' 버튼을 눌렀을 때 모달을 연다.
   *
   * 버튼 자체는 이 컴포넌트가 그리지만 **자리는 컨트롤러가 잡는다**(3D 면의 화면
   * 사각형이 필요하다). 그래서 여는 일도 이벤트로 받는다 — 어느 쪽이 눌러도 같은 길이다.
   */
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const onOpen = () => {
      setNotice(null);
      setDone('');
      // 여기서 `openedAt` 을 다시 잡지 않는다. 잡았더니 3초 창이 모달을 여는 순간
      // 시작돼, 이름과 한마디를 빨리 적는 사람이 봇으로 몰렸다 — 그러면 서버가
      // 저장하지 않고 **성공처럼 응답한다**(bot.ts). 화면은 모달을 닫고, 글은 어디에도
      // 없다. 되돌리기 어려운 종류의 조용한 실패라 시계는 책이 열릴 때부터 간다.
      const dlg = composeRef.current;
      if (!dlg) return;
      if (!dlg.open) dlg.showModal();
    };
    root.addEventListener('guestbook:compose', onOpen);
    return () => root.removeEventListener('guestbook:compose', onOpen);
  }, []);

  /** '이전 글 더 보기' — 이벤트 처리라 이펙트 제약이 없다. */
  async function loadMore(before: string) {
    try {
      applyPage(await fetchEntries(before), true);
    } catch (err) {
      applyLoadError(err);
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (sending) return;

    setSending(true);
    setNotice(null);
    try {
      // 3초가 안 됐으면 모자란 만큼 기다린다. 진짜 봇은 이 화면을 쓰지 않고 API 를
      // 직접 두드리므로 방어가 약해지지 않는다 — 여기서 지키는 것은 사람 쪽이다.
      const since = Date.now() - Date.parse(openedAt.current);
      if (Number.isFinite(since) && since < MIN_FILL_MS) {
        await new Promise((r) => setTimeout(r, MIN_FILL_MS - since));
      }

      const result = await submitEntry({
        author,
        body,
        website,
        openedAt: openedAt.current,
      });

      if (result.status === 'visible') {
        // 새로고침 없이 목록 맨 위에 붙인다(FR-003). 목록은 최신순이다 —
        // 책 안에서만 시간순으로 뒤집는다(BookController 의 guestbookBlocks).
        setEntries((prev) => [result.entry, ...prev]);
        setAuthor('');
        setBody('');
        setDone('남겨 주셔서 고맙습니다.');
        composeRef.current?.close();
        // 3D 책에 "이 글이 방금 늘었다"고 알린다. 컨트롤러가 그 글이 놓인 장까지
        // 넘긴 뒤 펜으로 쓴다. 3D 가 아니면 아무도 듣지 않는다.
        rootRef.current?.dispatchEvent(
          new CustomEvent('guestbook:changed', { bubbles: true, detail: { entry: result.entry } }),
        );
      } else {
        // 보류는 종이에 쓰이지 않는다. 모달을 열어 둔 채 이유를 알린다 —
        // 닫아 버리면 "남겼는데 아무 일도 없다"가 된다.
        setNotice({ kind: 'held', text: result.message });
        setAuthor('');
        setBody('');
      }
      openedAt.current = new Date().toISOString();
    } catch (err) {
      // 적던 내용은 그대로 둔다(FR-007).
      setNotice({
        kind: 'error',
        text: err instanceof GuestbookError ? err.message : '남기지 못했습니다.',
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="guestbook" aria-label="방명록" ref={rootRef}>
      {/* 종이 오른쪽 아래 구석에 놓인다. 3D 에서는 컨트롤러가 자리를 잡고,
          평면 폴백에서는 문서 흐름에 그냥 있는다. */}
      <button
        type="button"
        className="guestbook__pen"
        data-action="guestbook-compose"
        onClick={() => rootRef.current?.dispatchEvent(new CustomEvent('guestbook:compose'))}
      >
        남기기
      </button>

      {/* 글쓰기 모달. 책 <dialog> 안에 겹쳐 뜨므로 좌우로 남들 글이 보인다.
          진짜 <dialog> 를 쓰는 이유는 초점 가둠과 Esc 를 브라우저가 해 주기 때문이다. */}
      <dialog className="guestbook__modal" ref={composeRef} aria-label="방명록 남기기">
        <form className="guestbook__form" onSubmit={onSubmit}>
          <div className="guestbook__field">
            <label htmlFor={authorId}>이름</label>
            <input
              id={authorId}
              className="guestbook__input"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              maxLength={AUTHOR_MAX}
              autoComplete="off"
              required
            />
          </div>

          <div className="guestbook__field">
            <label htmlFor={bodyId}>한마디</label>
            <textarea
              id={bodyId}
              className="guestbook__textarea"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={BODY_MAX}
              rows={4}
              required
            />
            <span className="guestbook__count" aria-hidden="true">
              {[...body].length} / {BODY_MAX}
            </span>
          </div>

          {/* 숨은 칸. 사람에게는 보이지도 초점이 가지도 않는다. 봇은 채운다. */}
          <div className="guestbook__honey" aria-hidden="true">
            <label htmlFor={websiteId}>홈페이지</label>
            <input
              id={websiteId}
              name="website"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              tabIndex={-1}
              autoComplete="off"
            />
          </div>

          {/* 남기기 전에 보여야 한다 (FR-014). 지우고 싶을 때 닿을 곳도 여기에 있어야
              한다 — 예전에는 책 첫 면 안내문이 그 주소를 들고 있었는데 그 면을 없앴다. */}
          <p className="guestbook__disclosure">
            남기신 글은 스팸·욕설 판정을 위해 외부 서비스로 전송됩니다. 그 밖의 용도로는 쓰지
            않습니다. 남긴 글을 지우고 싶으시면{' '}
            <a href="mailto:patrol4@naver.com">patrol4@naver.com</a> 으로 알려 주세요.
          </p>

          <div className="guestbook__actions">
            <button
              type="button"
              className="guestbook__cancel"
              onClick={() => composeRef.current?.close()}
            >
              닫기
            </button>
            <button type="submit" className="guestbook__submit" disabled={sending}>
              {sending ? '남기는 중…' : '남기기'}
            </button>
          </div>

          {/* 보류·실패는 여기에 남는다. 모달이 열린 채라 눈에 보이고, role="alert" 라
              낭독기가 하던 말을 끊고 읽는다 — 다시 손대야 하는 일이기 때문이다. */}
          <p className="guestbook__notice" data-kind={notice?.kind ?? ''} role="alert">
            {notice?.text ?? ''}
          </p>
        </form>
      </dialog>

      {/* 성공은 모달이 닫힌 **뒤에** 알려야 하므로 모달 밖에 둔다.
          3D 에서는 펜이 글을 쓰는 것이 곧 확인이지만, 그건 눈으로만 보이는 확인이다.
          낭독기 쓰는 사람에게도 같은 말을 해야 한다(원칙 II). */}
      <p className="guestbook__done" role="status" aria-live="polite">
        {done}
      </p>

      <hr className="guestbook__rule" />

      {loading ? (
        <p className="guestbook__empty">불러오는 중…</p>
      ) : loadError ? (
        <p className="guestbook__empty">{loadError}</p>
      ) : entries.length === 0 ? (
        <p className="guestbook__empty">아직 남겨진 글이 없습니다. 첫 한마디를 남겨 주세요.</p>
      ) : (
        <>
          <ul className="guestbook__list">
            {entries.map((entry) => (
              <li key={entry.id} className="guestbook__entry">
                <p className="guestbook__meta">
                  <span className="guestbook__author">{entry.author}</span>
                  <time dateTime={entry.createdAt}>{formatWhen(entry.createdAt)}</time>
                </p>
                {/* 텍스트로만 넣는다. 줄바꿈은 CSS 가 살린다. */}
                <p className="guestbook__body">{entry.body}</p>
              </li>
            ))}
          </ul>
          {nextBefore ? (
            <button
              type="button"
              className="guestbook__more"
              onClick={() => void loadMore(nextBefore)}
            >
              이전 글 더 보기
            </button>
          ) : null}
        </>
      )}
    </section>
  );
}
