/**
 * 방명록 API 호출 (contracts/guestbook-api.md).
 *
 * 실패를 뭉뚱그리지 않는다. 방문자에게 무엇이 문제인지 알려야 하고, 적던 내용을 잃지
 * 않게 해야 하기 때문이다(FR-007). 서버가 준 `message` 를 그대로 쓴다 — 화면이 문구를
 * 새로 지어내면 두 곳에서 말이 갈린다.
 */

export interface GuestbookEntry {
  id: number;
  author: string;
  body: string;
  createdAt: string;
}

export interface EntryPage {
  entries: GuestbookEntry[];
  nextBefore: string | null;
}

export type SubmitResult =
  | { status: 'visible'; entry: GuestbookEntry }
  | { status: 'held'; message: string };

export class GuestbookError extends Error {
  readonly code: string;
  readonly retryAfter: number | undefined;

  constructor(code: string, message: string, retryAfter?: number) {
    super(message);
    this.name = 'GuestbookError';
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

/**
 * API 의 뿌리.
 *
 * 운영에서는 같은 도메인의 `/api` 라 상대 경로면 된다. 로컬은 사이트(3000)와 API(8080)가
 * 갈리므로 빌드 시점에 주입한다. 정적 export 라 이 값은 빌드에 박힌다.
 */
const BASE = process.env.NEXT_PUBLIC_GUESTBOOK_API ?? '';

async function readError(res: Response): Promise<GuestbookError> {
  try {
    const body = (await res.json()) as { error?: string; message?: string; retryAfter?: number };
    return new GuestbookError(
      body.error ?? 'unknown',
      body.message ?? '문제가 생겼습니다. 잠시 뒤 다시 시도해 주세요.',
      body.retryAfter,
    );
  } catch {
    // 서버가 JSON 을 주지 못하는 상태(프록시 오류 등).
    return new GuestbookError('unreachable', '지금은 방명록에 닿을 수 없습니다.');
  }
}

export async function fetchEntries(
  before?: string | null,
  signal?: AbortSignal,
): Promise<EntryPage> {
  const params = new URLSearchParams();
  if (before) params.set('before', before);
  const query = params.toString();

  let res: Response;
  try {
    res = await fetch(`${BASE}/api/guestbook/entries${query ? `?${query}` : ''}`, {
      headers: { accept: 'application/json' },
      ...(signal ? { signal } : {}),
    });
  } catch (err) {
    // 창을 닫아 취소된 것은 실패가 아니다. 부르는 쪽이 구분할 수 있게 그대로 올린다.
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new GuestbookError('unreachable', '지금은 방명록에 닿을 수 없습니다.');
  }

  if (!res.ok) throw await readError(res);
  return (await res.json()) as EntryPage;
}

export interface SubmitInput {
  author: string;
  body: string;
  /** 사람 눈에 보이지 않는 칸. 채워져 있으면 서버가 봇으로 본다. */
  website: string;
  /** 폼이 화면에 나타난 시각. 너무 빠른 제출을 서버가 걸러낸다. */
  openedAt: string;
}

// ── 주인용 ────────────────────────────────────────────────────────────────
//
// 아래 셋은 관리 토큰이 있어야 한다. 토큰은 이 파일이 들고 있지 않고 부르는 쪽이 넘긴다 —
// 모듈 안에 담아 두면 방명록 화면에서도 닿을 수 있게 되고, 그럴 이유가 없다.

/** 보류된 글. 주인만 본다 — 사유와 점수가 함께 온다. */
export interface HeldEntry extends GuestbookEntry {
  heldReason: string | null;
  verdictScore: number | null;
}

async function authed(path: string, token: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(`${BASE}${path}`, {
      ...init,
      headers: { ...init?.headers, accept: 'application/json', authorization: `Bearer ${token}` },
    });
  } catch {
    throw new GuestbookError('unreachable', '지금은 방명록에 닿을 수 없습니다.');
  }
}

export async function fetchHeld(token: string): Promise<HeldEntry[]> {
  const res = await authed('/api/guestbook/held', token);
  if (!res.ok) throw await readError(res);
  return ((await res.json()) as { entries: HeldEntry[] }).entries;
}

export async function publishHeldEntry(id: number, token: string): Promise<void> {
  const res = await authed(`/api/guestbook/entries/${id}/publish`, token, { method: 'POST' });
  if (!res.ok) throw await readError(res);
}

export async function deleteEntry(id: number, token: string): Promise<void> {
  const res = await authed(`/api/guestbook/entries/${id}`, token, { method: 'DELETE' });
  if (!res.ok) throw await readError(res);
}

export async function submitEntry(input: SubmitInput): Promise<SubmitResult> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/api/guestbook/entries`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(input),
    });
  } catch {
    throw new GuestbookError('unreachable', '지금은 글을 남길 수 없습니다.');
  }

  if (!res.ok) throw await readError(res);
  return (await res.json()) as SubmitResult;
}
