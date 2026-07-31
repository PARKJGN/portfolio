'use client';

import { useCallback, useEffect, useId, useState, useSyncExternalStore } from 'react';
import {
  deleteEntry,
  fetchHeld,
  publishHeldEntry,
  GuestbookError,
  type HeldEntry,
} from '@/lib/guestbook-client';
import {
  isUsableToken,
  readToken,
  readTokenOnServer,
  subscribeToken,
  writeToken,
} from '@/lib/admin-token';

/**
 * 보류함 (US3).
 *
 * 세 겹 방어는 완벽하지 않다. 평범한 인사가 보류되기도 하고 교묘한 광고가 통과하기도 한다.
 * 그래서 사람이 손댈 자리를 둔다 — 다만 평소엔 열어볼 일 없는 안전망이다.
 *
 * 토큰은 `sessionStorage` 에 둔다. `localStorage` 로 하면 다시 붙여 넣는 수고는 덜지만
 * 브라우저에 계속 남는다. 여기는 자주 오는 화면이 아니므로, 남겨 두는 편익보다 창을 닫으면
 * 사라지는 편이 낫다.
 */

type Notice = { kind: 'ok' | 'error'; text: string } | null;

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}. ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function HeldInbox() {
  const tokenId = useId();
  const removeId = useId();

  const token = useSyncExternalStore(subscribeToken, readToken, readTokenOnServer);

  const [draftToken, setDraftToken] = useState('');
  /** null 은 "아직 안 받아 왔다" 다. 빈 배열(보류 글이 없다)과 구분해야 한다. */
  const [entries, setEntries] = useState<HeldEntry[] | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  /** 지우기를 한 번 누른 글. 한 번 더 눌러야 실제로 지운다 — 되돌릴 수단이 없다. */
  const [confirming, setConfirming] = useState<number | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [removeTarget, setRemoveTarget] = useState('');
  /** 다시 불러오기를 누를 때마다 올린다. 값이 바뀌면 아래 effect 가 다시 돈다. */
  const [reloadKey, setReloadKey] = useState(0);

  /** 401 이면 들고 있던 토큰이 쓸모없다. 붙잡고 있어 봐야 계속 실패한다. */
  const handleError = useCallback((err: unknown) => {
    if (err instanceof GuestbookError && err.code === 'unauthorized') {
      writeToken(null);
      setEntries(null);
      setNotice({ kind: 'error', text: '토큰이 맞지 않습니다. 다시 넣어 주세요.' });
      return;
    }
    setNotice({
      kind: 'error',
      text: err instanceof GuestbookError ? err.message : '문제가 생겼습니다.',
    });
  }, []);

  useEffect(() => {
    if (!token) return;

    // 화면에서 사라진 뒤 도착한 응답은 버린다.
    let live = true;
    fetchHeld(token)
      .then((list) => {
        if (live) setEntries(list);
      })
      .catch((err: unknown) => {
        if (live) handleError(err);
      });

    return () => {
      live = false;
    };
  }, [token, reloadKey, handleError]);

  function reload() {
    setEntries(null);
    setReloadKey((n) => n + 1);
  }

  function onSaveToken(e: React.FormEvent) {
    e.preventDefault();
    const value = draftToken.trim();
    if (value === '') return;
    if (!isUsableToken(value)) {
      setNotice({ kind: 'error', text: '토큰에 쓸 수 없는 글자가 있습니다. 다시 확인해 주세요.' });
      return;
    }
    setDraftToken('');
    setNotice(null);
    setEntries(null);
    writeToken(value);
  }

  function forget() {
    setEntries(null);
    setNotice({ kind: 'ok', text: '토큰을 지웠습니다.' });
    writeToken(null);
  }

  function act(id: number, run: (t: string) => Promise<void>, done: string) {
    if (!token) return;
    setBusy(id);
    setConfirming(null);
    run(token)
      .then(() => {
        setEntries((list) => list?.filter((entry) => entry.id !== id) ?? null);
        setNotice({ kind: 'ok', text: done });
        setBusy(null);
      })
      .catch((err: unknown) => {
        handleError(err);
        setBusy(null);
      });
  }

  function onRemoveById(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    const id = Number(removeTarget.trim());
    if (!Number.isInteger(id) || id <= 0) {
      setNotice({ kind: 'error', text: '글 번호는 양의 정수입니다.' });
      return;
    }
    deleteEntry(id, token)
      .then(() => {
        setEntries((list) => list?.filter((entry) => entry.id !== id) ?? null);
        setRemoveTarget('');
        setNotice({ kind: 'ok', text: `${id}번 글을 지웠습니다.` });
      })
      .catch(handleError);
  }

  return (
    <main className="admin">
      <h1 className="admin__title">보류함</h1>

      {/* 결과를 낭독기에도 알린다 (원칙 II). 자리를 미리 잡아 문구가 생겨도 아래가 밀리지 않는다. */}
      <p className="admin__notice" data-kind={notice?.kind ?? ''} role="status" aria-live="polite">
        {notice?.text ?? ''}
      </p>

      {token === null ? (
        <form className="admin__form" onSubmit={onSaveToken}>
          <div className="admin__field">
            <label htmlFor={tokenId}>관리 토큰</label>
            <input
              id={tokenId}
              className="admin__input"
              type="password"
              value={draftToken}
              onChange={(e) => setDraftToken(e.target.value)}
              autoComplete="off"
              required
            />
          </div>
          <p className="admin__hint">창을 닫으면 지워집니다. 이 기기에 남지 않습니다.</p>
          <button type="submit" className="admin__btn">
            열기
          </button>
        </form>
      ) : (
        <>
          <div className="admin__bar">
            <button type="button" className="admin__btn" onClick={reload}>
              다시 불러오기
            </button>
            <button type="button" className="admin__btn" onClick={forget}>
              토큰 지우기
            </button>
          </div>

          {entries === null ? (
            <p className="admin__empty">불러오는 중…</p>
          ) : entries.length === 0 ? (
            <p className="admin__empty">보류된 글이 없습니다.</p>
          ) : (
            <ul className="admin__list">
              {entries.map((entry) => (
                <li key={entry.id} className="admin__entry">
                  <p className="admin__meta">
                    <span className="admin__author">{entry.author}</span>
                    <time dateTime={entry.createdAt}>{formatWhen(entry.createdAt)}</time>
                    <span className="admin__id">#{entry.id}</span>
                  </p>

                  {/* 방문자가 적은 글이다. 텍스트로만 넣는다 — 여기서도 해석하지 않는다(R-8). */}
                  <p className="admin__body">{entry.body}</p>

                  <p className="admin__reason">
                    {entry.heldReason ?? '사유 없음'}
                    {entry.verdictScore !== null ? ` · 유해도 ${entry.verdictScore.toFixed(2)}` : ''}
                  </p>

                  <div className="admin__actions">
                    <button
                      type="button"
                      className="admin__btn"
                      disabled={busy === entry.id}
                      onClick={() =>
                        act(entry.id, (t) => publishHeldEntry(entry.id, t), '공개했습니다.')
                      }
                    >
                      공개
                    </button>

                    {/* 되돌릴 수단이 없다. 한 번 더 눌러야 실제로 지운다. */}
                    {confirming === entry.id ? (
                      <button
                        type="button"
                        className="admin__btn admin__btn--danger"
                        disabled={busy === entry.id}
                        onClick={() => act(entry.id, (t) => deleteEntry(entry.id, t), '지웠습니다.')}
                      >
                        정말 지웁니다
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="admin__btn"
                        disabled={busy === entry.id}
                        onClick={() => setConfirming(entry.id)}
                      >
                        지우기
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {/* 공개된 글도 지울 수 있어야 한다(계약). 보류함에는 없으므로 번호로 받는다. */}
          <form className="admin__form admin__form--inline" onSubmit={onRemoveById}>
            <div className="admin__field">
              <label htmlFor={removeId}>공개된 글 지우기 (글 번호)</label>
              <input
                id={removeId}
                className="admin__input"
                inputMode="numeric"
                value={removeTarget}
                onChange={(e) => setRemoveTarget(e.target.value)}
                autoComplete="off"
              />
            </div>
            <button type="submit" className="admin__btn">
              지우기
            </button>
          </form>
        </>
      )}
    </main>
  );
}
