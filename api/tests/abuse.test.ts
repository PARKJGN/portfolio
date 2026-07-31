import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import {
  countRecentMarks,
  hashClient,
  purgeExpired,
  recordMark,
  startPurgeLoop,
} from '../src/db/abuse.js';
import type { Pool } from '../src/db/pool.js';
import { setupTestDb, truncateAll } from './helpers/db.js';

/**
 * 남용 기록 (T039 · T054).
 *
 * 여기서 지켜야 할 것은 두 가지다 — **원문 접속 주소를 남기지 않는다**(FR-020), 그리고
 * 흔적이 영원히 쌓이지 않는다.
 */

describe('hashClient', () => {
  const salt = 'a'.repeat(64);

  it('원문이 결과에 남지 않는다', () => {
    const hash = hashClient('203.0.113.9', salt);
    expect(hash).not.toContain('203');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('같은 주소·같은 소금이면 같은 값 — 세려면 같아야 한다', () => {
    expect(hashClient('203.0.113.9', salt)).toBe(hashClient('203.0.113.9', salt));
  });

  it('다른 주소면 다른 값', () => {
    expect(hashClient('203.0.113.9', salt)).not.toBe(hashClient('203.0.113.10', salt));
  });

  it('소금이 다르면 값이 다르다 — 소금 없이는 되돌릴 수 없다', () => {
    expect(hashClient('203.0.113.9', salt)).not.toBe(hashClient('203.0.113.9', 'b'.repeat(64)));
  });
});

describe('흔적 세기와 지우기', () => {
  let pool: Pool;
  const hash = hashClient('203.0.113.9', 'c'.repeat(64));

  beforeAll(async () => {
    pool = await setupTestDb();
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await truncateAll(pool);
  });

  it('없으면 0 이고 가장 오래된 시각도 없다', async () => {
    await expect(countRecentMarks(pool, hash, 60_000)).resolves.toEqual({
      count: 0,
      oldestAt: null,
    });
  });

  it('남긴 만큼 센다', async () => {
    await recordMark(pool, hash, 60_000);
    await recordMark(pool, hash, 60_000);

    const window = await countRecentMarks(pool, hash, 60_000);
    expect(window.count).toBe(2);
    expect(window.oldestAt).toBeInstanceOf(Date);
  });

  it('다른 접속의 흔적은 세지 않는다', async () => {
    await recordMark(pool, hashClient('198.51.100.1', 'c'.repeat(64)), 60_000);
    await expect(countRecentMarks(pool, hash, 60_000)).resolves.toMatchObject({ count: 0 });
  });

  it('창 밖의 흔적은 세지 않는다', async () => {
    await recordMark(pool, hash, 60_000);
    // 잘라내는 시각은 Node 시계, 행의 시각은 Postgres 시계다. 창을 0 으로 두면 둘의
    // 몇 밀리초 차이로 결과가 갈리므로, 흔적을 두 시간 전으로 밀어 두고 본다.
    await pool.query(`UPDATE abuse_mark SET created_at = now() - interval '2 hours'`);

    await expect(countRecentMarks(pool, hash, 60_000)).resolves.toMatchObject({ count: 0 });
  });

  it('기한이 지난 흔적만 지운다', async () => {
    await recordMark(pool, hash, -1000); // 이미 만료
    await recordMark(pool, hash, 60_000); // 아직 살아 있음

    await expect(purgeExpired(pool)).resolves.toBe(1);
    await expect(countRecentMarks(pool, hash, 60_000)).resolves.toMatchObject({ count: 1 });
  });

  it('지울 것이 없으면 0 을 준다', async () => {
    await expect(purgeExpired(pool)).resolves.toBe(0);
  });

  it('글과 이어지지 않는다 — 누가 무엇을 썼는지 복원할 수 없다', async () => {
    const { rows } = await pool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'abuse_mark'`,
    );
    const columns = rows.map((r) => r.column_name);
    expect(columns).toEqual(
      expect.arrayContaining(['id', 'client_hash', 'created_at', 'expires_at']),
    );
    // 글을 가리키는 열이 없다.
    expect(columns.some((c) => c.includes('entry'))).toBe(false);
  });
});

describe('주기 청소 (T054)', () => {
  /** 데이터베이스 없이 호출 횟수만 본다. */
  function stubPool(behavior: () => Promise<{ rowCount: number }>) {
    let calls = 0;
    const pool = {
      query: () => {
        calls += 1;
        return behavior();
      },
    } as unknown as Pool;
    return { pool, calls: () => calls };
  }

  it('처음에는 바로 돌지 않고 기다린다 — 기동 직후엔 프로브가 먼저다', async () => {
    vi.useFakeTimers();
    try {
      const { pool, calls } = stubPool(() => Promise.resolve({ rowCount: 0 }));
      const stop = startPurgeLoop(pool, { firstDelayMs: 1000, intervalMs: 5000 });

      await vi.advanceTimersByTimeAsync(999);
      expect(calls()).toBe(0);

      await vi.advanceTimersByTimeAsync(1);
      expect(calls()).toBe(1);
      stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it('그다음에는 주기마다 돈다', async () => {
    vi.useFakeTimers();
    try {
      const { pool, calls } = stubPool(() => Promise.resolve({ rowCount: 0 }));
      const stop = startPurgeLoop(pool, { firstDelayMs: 1000, intervalMs: 5000 });

      await vi.advanceTimersByTimeAsync(1000 + 5000 * 3);
      expect(calls()).toBe(4);
      stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it('멈추면 더 돌지 않는다', async () => {
    vi.useFakeTimers();
    try {
      const { pool, calls } = stubPool(() => Promise.resolve({ rowCount: 0 }));
      const stop = startPurgeLoop(pool, { firstDelayMs: 1000, intervalMs: 5000 });

      await vi.advanceTimersByTimeAsync(1000);
      stop();
      await vi.advanceTimersByTimeAsync(5000 * 5);
      expect(calls()).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('시작 전에 멈춰도 돌지 않는다', async () => {
    vi.useFakeTimers();
    try {
      const { pool, calls } = stubPool(() => Promise.resolve({ rowCount: 0 }));
      startPurgeLoop(pool, { firstDelayMs: 1000, intervalMs: 5000 })();

      await vi.advanceTimersByTimeAsync(10_000);
      expect(calls()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('실패해도 멈추지 않는다 — 청소가 안 됐다고 방명록이 설 이유가 없다', async () => {
    vi.useFakeTimers();
    try {
      const { pool, calls } = stubPool(() => Promise.reject(new Error('연결 끊김')));
      const errors: unknown[] = [];
      const stop = startPurgeLoop(pool, {
        firstDelayMs: 1000,
        intervalMs: 5000,
        onError: (err) => errors.push(err),
      });

      await vi.advanceTimersByTimeAsync(1000 + 5000 * 2);
      expect(calls()).toBe(3);
      expect(errors).toHaveLength(3);
      stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it('지운 것이 있을 때만 알린다 — 아무것도 없는 시간마다 로그를 남기지 않는다', async () => {
    vi.useFakeTimers();
    try {
      let rowCount = 0;
      const { pool } = stubPool(() => Promise.resolve({ rowCount }));
      const purged: number[] = [];
      const stop = startPurgeLoop(pool, {
        firstDelayMs: 1000,
        intervalMs: 5000,
        onPurged: (n) => purged.push(n),
      });

      await vi.advanceTimersByTimeAsync(1000);
      expect(purged).toEqual([]);

      rowCount = 7;
      await vi.advanceTimersByTimeAsync(5000);
      expect(purged).toEqual([7]);
      stop();
    } finally {
      vi.useRealTimers();
    }
  });
});
