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
 * 방명록 — 폼과 목록.
 *
 * 이 책만 평면 모달로 열린다(003 research.md R-2). 캔버스 안에는 입력칸을 놓을 수 없고,
 * 방문자가 어떤 글자를 쓸지 몰라 서브셋 글꼴이 담을 수 없기 때문이다.
 *
 * 글은 **텍스트로만** 넣는다. React 가 기본으로 그렇게 하므로 `dangerouslySetInnerHTML`
 * 을 쓰지 않는 것으로 충분하다 — 마크다운도 링크도 해석하지 않는다(R-8).
 */

const AUTHOR_MAX = 20;
const BODY_MAX = 500;

type Notice = { kind: 'ok' | 'held' | 'error'; text: string } | null;

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

  // 폼이 화면에 나타난 시각. 서버가 "너무 빠른 제출"을 가려낼 때 쓴다.
  const openedAt = useRef(new Date().toISOString());
  /** 감싸는 <dialog> 를 찾기 위한 손잡이 — 언제 불러올지 정하는 데 쓴다. */
  const rootRef = useRef<HTMLElement>(null);

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
      const result = await submitEntry({
        author,
        body,
        website,
        openedAt: openedAt.current,
      });

      if (result.status === 'visible') {
        // 새로고침 없이 목록 맨 위에 붙인다(FR-003).
        setEntries((prev) => [result.entry, ...prev]);
        setNotice({ kind: 'ok', text: '남겨 주셔서 고맙습니다.' });
        // 3D 책은 열릴 때 페이지를 한 번 그려 두므로, 방금 남긴 글이 종이에는 아직 없다.
        // 다시 그리라고 알린다. 3D 가 아니면 아무도 듣지 않는다(BookController 만 듣는다).
        rootRef.current?.dispatchEvent(new CustomEvent('guestbook:changed', { bubbles: true }));
      } else {
        setNotice({ kind: 'held', text: result.message });
      }
      // 성공했을 때만 비운다 — 실패하면 적던 내용을 잃지 않아야 한다(FR-007).
      setAuthor('');
      setBody('');
      openedAt.current = new Date().toISOString();
    } catch (err) {
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

        {/* 남기기 전에 보여야 한다 (FR-014). */}
        <p className="guestbook__disclosure">
          남기신 글은 스팸·욕설 판정을 위해 외부 서비스로 전송됩니다. 그 밖의 용도로는 쓰지
          않습니다.
        </p>

        <div className="guestbook__actions">
          <button type="submit" className="guestbook__submit" disabled={sending}>
            {sending ? '남기는 중…' : '남기기'}
          </button>
        </div>

        {/* 결과를 낭독기에도 알린다 (원칙 II). */}
        <p className="guestbook__notice" data-kind={notice?.kind ?? ''} role="status" aria-live="polite">
          {notice?.text ?? ''}
        </p>
      </form>

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
