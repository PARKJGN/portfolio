import { createHash } from 'node:crypto';
import type { Pool } from './pool.js';

/**
 * 남용 기록.
 *
 * **원문 접속 주소를 저장하지 않는다**(FR-020). 소금 섞은 해시만 남긴다. 소금이 없으면
 * IPv4 주소 공간은 43억 개뿐이라 해시를 전부 만들어 맞춰 볼 수 있다 — 해시가 익명화가 되려면
 * 서버만 아는 값이 섞여야 한다.
 *
 * 이 표는 `guestbook_entry` 와 연결하지 않는다. 연결하는 순간 "누가 어떤 글을 썼는지" 를
 * 복원할 수 있고, 그러면 저장하지 않기로 한 것을 사실상 저장한 셈이 된다.
 */

export function hashClient(identifier: string, salt: string): string {
  return createHash('sha256').update(`${salt}:${identifier}`).digest('hex');
}

export interface MarkWindow {
  count: number;
  /** 창 안에서 가장 오래된 흔적의 시각. 없으면 null. */
  oldestAt: Date | null;
}

/** 최근 `windowMs` 안에 이 접속이 남긴 글 수. 이번 요청은 아직 세지 않는다. */
export async function countRecentMarks(
  pool: Pool,
  clientHash: string,
  windowMs: number,
): Promise<MarkWindow> {
  const since = new Date(Date.now() - windowMs);
  const { rows } = await pool.query<{ count: string; oldest: Date | null }>(
    `SELECT count(*) AS count, min(created_at) AS oldest
       FROM abuse_mark
      WHERE client_hash = $1 AND created_at > $2`,
    [clientHash, since],
  );

  const row = rows[0];
  return { count: Number(row?.count ?? 0), oldestAt: row?.oldest ?? null };
}

/** 흔적 하나를 남긴다. 보관 기간이 지나면 지운다 — 세는 데 쓸 뿐 기록으로 두지 않는다. */
export async function recordMark(pool: Pool, clientHash: string, ttlMs: number): Promise<void> {
  await pool.query(`INSERT INTO abuse_mark (client_hash, expires_at) VALUES ($1, $2)`, [
    clientHash,
    new Date(Date.now() + ttlMs),
  ]);
}

/** 기한이 지난 흔적을 지운다. 주기 작업이 부른다. */
export async function purgeExpired(pool: Pool): Promise<number> {
  const { rowCount } = await pool.query(`DELETE FROM abuse_mark WHERE expires_at < now()`);
  return rowCount ?? 0;
}

/** 얼마나 자주 지울 것인가. 흔적의 보관 기간(창의 두 배)보다 촘촘하면 충분하다. */
export const PURGE_INTERVAL_MS = 60 * 60 * 1000;
/** 뜨자마자 지우지 않는다. 기동 직후에는 프로브에 답하는 것이 먼저다. */
export const PURGE_FIRST_DELAY_MS = 30 * 1000;

export interface PurgeLoopOptions {
  intervalMs?: number;
  firstDelayMs?: number;
  onPurged?: (count: number) => void;
  onError?: (err: unknown) => void;
}

/**
 * 만료된 흔적을 주기적으로 지운다 (T054).
 *
 * 왜 쿠버네티스 CronJob 이 아닌가: 이 일은 `DELETE ... WHERE expires_at < now()` 한 줄이다.
 * 파드를 하나 더 띄우고 거기에 DB 접속 정보를 또 넣느니, 이미 그 접속을 들고 있는
 * 프로세스가 하는 편이 새는 자리가 적다. 여러 벌이 떠도 같은 행을 지우려 할 뿐 해가 없다.
 *
 * 실패는 삼키고 다음 차례를 기다린다. 청소가 안 됐다고 방명록이 멈출 이유가 없다 —
 * 흔적이 조금 더 남아 있을 뿐이다.
 */
export function startPurgeLoop(pool: Pool, opts: PurgeLoopOptions = {}): () => void {
  const intervalMs = opts.intervalMs ?? PURGE_INTERVAL_MS;
  const firstDelayMs = opts.firstDelayMs ?? PURGE_FIRST_DELAY_MS;

  let stopped = false;
  let timer: NodeJS.Timeout | undefined;

  const run = () => {
    purgeExpired(pool)
      .then((count) => {
        if (!stopped && count > 0) opts.onPurged?.(count);
      })
      .catch((err: unknown) => {
        if (!stopped) opts.onError?.(err);
      });
  };

  const schedule = (delay: number, repeat: boolean) => {
    timer = repeat ? setInterval(run, delay) : setTimeout(kickoff, delay);
    // 이 타이머가 프로세스를 붙잡으면 SIGTERM 을 받고도 안 내려간다.
    timer.unref();
  };

  function kickoff() {
    if (stopped) return;
    run();
    schedule(intervalMs, true);
  }

  schedule(firstDelayMs, false);

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    if (timer) clearInterval(timer);
  };
}
