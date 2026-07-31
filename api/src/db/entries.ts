import type { Pool } from './pool.js';

/**
 * 방명록 글 질의.
 *
 * SQL 을 직접 쓴다(research.md R-5). 값은 전부 자리표시자로 넘긴다 — 문자열을 이어
 * 붙이는 곳이 하나도 없어야 한다. 방문자가 적은 글이 그대로 들어오는 자리다.
 */

export type EntryStatus = 'visible' | 'held' | 'removed';

/** 방문자에게 나가는 형태. 내부 컬럼(상태·사유·점수)은 담지 않는다. */
export interface PublicEntry {
  id: number;
  author: string;
  body: string;
  createdAt: string;
}

/** 주인만 보는 형태. 보류 사유와 점수가 함께 나온다. */
export interface HeldEntry extends PublicEntry {
  heldReason: string | null;
  verdictScore: number | null;
}

interface EntryRow {
  id: string;
  author: string;
  body: string;
  created_at: Date;
  held_reason?: string | null;
  verdict_score?: number | null;
}

function toPublic(row: EntryRow): PublicEntry {
  return {
    // bigint 는 pg 가 문자열로 준다. JS 안전 정수 범위를 넘길 일이 없는 규모라 숫자로 바꾼다.
    id: Number(row.id),
    author: row.author,
    body: row.body,
    createdAt: row.created_at.toISOString(),
  };
}

export interface ListOptions {
  limit: number;
  before: Date | undefined;
}

/** 공개된 글을 최신순으로. `before` 가 있으면 그 시각 이전 것만 — 이어 읽기에 쓴다. */
export async function listVisible(pool: Pool, opts: ListOptions): Promise<PublicEntry[]> {
  const { rows } = opts.before
    ? await pool.query<EntryRow>(
        `SELECT id, author, body, created_at
           FROM guestbook_entry
          WHERE status = 'visible' AND created_at < $1
          ORDER BY created_at DESC
          LIMIT $2`,
        [opts.before, opts.limit],
      )
    : await pool.query<EntryRow>(
        `SELECT id, author, body, created_at
           FROM guestbook_entry
          WHERE status = 'visible'
          ORDER BY created_at DESC
          LIMIT $1`,
        [opts.limit],
      );

  return rows.map(toPublic);
}

/** 중복으로 보는 기간 (data-model.md 검증 규칙). */
export const DUPLICATE_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * 최근 24시간 안에 같은 내용이 이미 있는가.
 *
 * 상태를 가리지 않는다 — 지운 글도 센다. 그래야 지운 글을 그대로 다시 붙여 넣는 것을
 * 막을 수 있다(data-model.md 가 행을 지우지 않고 `removed` 로 두는 이유).
 */
export async function hasRecentDuplicate(
  pool: Pool,
  body: string,
  windowMs: number = DUPLICATE_WINDOW_MS,
): Promise<boolean> {
  const { rowCount } = await pool.query(
    `SELECT 1 FROM guestbook_entry WHERE body = $1 AND created_at > $2 LIMIT 1`,
    [body, new Date(Date.now() - windowMs)],
  );
  return (rowCount ?? 0) > 0;
}

/** 보류된 글을 최신순으로. 주인만 본다. */
export async function listHeld(pool: Pool, limit: number): Promise<HeldEntry[]> {
  const { rows } = await pool.query<EntryRow>(
    `SELECT id, author, body, created_at, held_reason, verdict_score
       FROM guestbook_entry
      WHERE status = 'held'
      ORDER BY created_at DESC
      LIMIT $1`,
    [limit],
  );

  return rows.map((row) => ({
    ...toPublic(row),
    heldReason: row.held_reason ?? null,
    verdictScore: row.verdict_score ?? null,
  }));
}

/**
 * 상태를 옮긴 결과.
 *
 * `not_found` 와 `invalid_state` 를 나누는 이유: 주인에게 "그런 글이 없다" 와 "이미 공개된
 * 글이다" 는 전혀 다른 말이다. 하나로 뭉치면 무엇을 잘못했는지 알 수 없다.
 */
export type TransitionResult = 'ok' | 'not_found' | 'invalid_state';

async function transition(
  pool: Pool,
  id: string,
  to: EntryStatus,
  from: EntryStatus[],
): Promise<TransitionResult> {
  const { rowCount } = await pool.query(
    `UPDATE guestbook_entry
        SET status = $2, reviewed_at = now()
      WHERE id = $1 AND status = ANY($3)`,
    [id, to, from],
  );
  if ((rowCount ?? 0) > 0) return 'ok';

  // 옮기지 못했다. 글 자체가 없는 것인지, 있는데 옮길 수 없는 상태인지 갈라 준다.
  const { rowCount: exists } = await pool.query(`SELECT 1 FROM guestbook_entry WHERE id = $1`, [id]);
  return (exists ?? 0) > 0 ? 'invalid_state' : 'not_found';
}

/** 보류된 글을 공개한다. `removed` 는 되돌리지 않는다 — 지운 것은 지운 것이다. */
export function publishEntry(pool: Pool, id: string): Promise<TransitionResult> {
  return transition(pool, id, 'visible', ['held']);
}

/**
 * 글을 지운다. 공개된 것도 보류된 것도 대상이다.
 *
 * 이미 지워진 글에도 성공을 준다. 두 번 눌렀다고 오류를 내면 주인은 "안 지워졌나" 하고
 * 또 누른다. 행을 실제로 지우지 않는 이유는 같은 글의 재등록을 중복 검사로 막기 위해서다.
 */
export function removeEntry(pool: Pool, id: string): Promise<TransitionResult> {
  return transition(pool, id, 'removed', ['visible', 'held', 'removed']);
}

export interface InsertOptions {
  author: string;
  body: string;
  status: EntryStatus;
  heldReason?: string | undefined;
  verdictScore?: number | undefined;
}

export async function insertEntry(pool: Pool, opts: InsertOptions): Promise<PublicEntry> {
  const { rows } = await pool.query<EntryRow>(
    `INSERT INTO guestbook_entry (author, body, status, held_reason, verdict_score)
          VALUES ($1, $2, $3, $4, $5)
       RETURNING id, author, body, created_at`,
    [opts.author, opts.body, opts.status, opts.heldReason ?? null, opts.verdictScore ?? null],
  );

  const row = rows[0];
  if (!row) throw new Error('INSERT ... RETURNING 이 행을 주지 않았다');
  return toPublic(row);
}
