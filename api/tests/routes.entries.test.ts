import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../src/server.js';
import { insertEntry } from '../src/db/entries.js';
import type { Pool } from '../src/db/pool.js';
import type { Judge, Verdict } from '../src/guard/verdict.js';
import { setupTestDb, truncateAll, testConfig } from './helpers/db.js';

/**
 * 목록·남기기 라우트 계약 (T019) 과 세 겹 방어의 연결 (T041).
 *
 * 실제 PostgreSQL 을 쓴다. `inject` 로 부르므로 포트를 열지 않는다 —
 * 테스트끼리 포트를 다투지 않고 빠르다.
 *
 * 판정만 가짜다. 진짜를 부르면 느린 것도 문제지만, 시험용 문장이 밖으로 나가는 것이 더
 * 문제다. 판정 자체의 실패 처리는 `guard.verdict.test.ts` 가 본다.
 */

let app: FastifyInstance;
let pool: Pool;

/** 다음 한 번의 판정. 테스트가 필요할 때만 바꾼다. */
let nextVerdict: Verdict = { decision: 'publish', reason: '평범한 인사', score: 0.01 };
const judge: Judge = () => Promise.resolve(nextVerdict);

beforeAll(async () => {
  pool = await setupTestDb();
  await pool.end();
  const built = await buildServer(testConfig(), { judge });
  app = built.app;
  pool = built.pool;
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await truncateAll(pool);
  nextVerdict = { decision: 'publish', reason: '평범한 인사', score: 0.01 };
});

const valid = {
  author: '지나가던 개발자',
  body: '3D 책 재밌네요.',
  website: '',
  openedAt: new Date(Date.now() - 10_000).toISOString(),
};

describe('POST /api/guestbook/entries', () => {
  it('남기면 201 과 저장된 글을 준다', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/guestbook/entries', payload: valid });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.status).toBe('visible');
    expect(body.entry.author).toBe(valid.author);
    expect(body.entry.body).toBe(valid.body);
    expect(typeof body.entry.id).toBe('number');
    // 계약이 ISO 8601 을 약속한다
    expect(new Date(body.entry.createdAt).toISOString()).toBe(body.entry.createdAt);
  });

  it('앞뒤 공백을 없앤 뒤 저장한다', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/guestbook/entries',
      payload: { ...valid, author: '  박  ', body: '  안녕  ' },
    });
    expect(res.json().entry).toMatchObject({ author: '박', body: '안녕' });
  });

  it('빈 이름은 400 invalid_input', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/guestbook/entries',
      payload: { ...valid, author: '   ' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('invalid_input');
    // 문구가 그대로 방문자에게 나간다
    expect(res.json().message).toMatch(/이름/);
  });

  it('내용이 상한을 넘으면 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/guestbook/entries',
      payload: { ...valid, body: '가'.repeat(501) },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('invalid_input');
  });

  it('필수 칸이 빠지면 400 이고 값은 응답에 담기지 않는다', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/guestbook/entries',
      payload: { author: '박', body: '안녕' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('invalid_input');
  });

  it('모르는 칸은 조용히 떼어낸다 — 거절하지 않지만 반영도 하지 않는다', async () => {
    // Fastify 의 기본 ajv 설정이 removeAdditional: true 다. `additionalProperties: false`
    // 와 만나면 거절이 아니라 제거로 동작한다. 거절보다 이쪽이 안전하다 —
    // 계약에 없는 칸은 애초에 코드에 닿지 못하므로 대량 할당 사고가 나지 않는다.
    const res = await app.inject({
      method: 'POST',
      url: '/api/guestbook/entries',
      payload: { ...valid, status: 'held', id: 999, isAdmin: true },
    });

    expect(res.statusCode).toBe(201);
    // 보낸 status·id 가 먹히지 않았다는 것이 핵심이다.
    expect(res.json().status).toBe('visible');
    expect(res.json().entry.id).not.toBe(999);
  });

  it('스크립트를 적어도 그대로 저장한다 — 위험을 없애는 것은 표시 단계다', async () => {
    const nasty = '<script>alert(1)</script>';
    const res = await app.inject({
      method: 'POST',
      url: '/api/guestbook/entries',
      payload: { ...valid, body: nasty },
    });
    expect(res.statusCode).toBe(201);
    // 서버가 몰래 고치지 않는다. 고치면 방문자가 쓴 것과 보이는 것이 달라진다.
    expect(res.json().entry.body).toBe(nasty);
  });
});

describe('세 겹 방어 연결 (T041)', () => {
  const post = (payload: Record<string, unknown>) =>
    app.inject({ method: 'POST', url: '/api/guestbook/entries', payload });
  const listed = async () =>
    (await app.inject({ method: 'GET', url: '/api/guestbook/entries' })).json().entries;
  const heldCount = async () =>
    Number(
      (await pool.query(`SELECT count(*) FROM guestbook_entry WHERE status = 'held'`)).rows[0]
        .count,
    );

  describe('1층 — 봇', () => {
    it('숨은 칸이 채워졌으면 성공처럼 답하되 저장하지 않는다', async () => {
      const res = await post({ ...valid, website: 'https://buy.example' });

      // 실패를 알려 주면 조건을 바꿔 다시 온다(계약).
      expect(res.statusCode).toBe(201);
      expect(await listed()).toHaveLength(0);
      // 보류함에도 넣지 않는다 — 봇이 보류함을 채우게 둘 이유가 없다.
      expect(await heldCount()).toBe(0);
    });

    it('폼을 연 지 3초도 안 됐으면 마찬가지다', async () => {
      const res = await post({ ...valid, openedAt: new Date().toISOString() });
      expect(res.statusCode).toBe(201);
      expect(await listed()).toHaveLength(0);
      expect(await heldCount()).toBe(0);
    });

    it('봇 판정에도 판정 API 를 부르지 않는다', async () => {
      let called = false;
      nextVerdict = { decision: 'publish', reason: '', score: 0 };
      const built = await buildServer(testConfig(), {
        judge: () => {
          called = true;
          return Promise.resolve(nextVerdict);
        },
      });
      await built.app.ready();
      try {
        await built.app.inject({
          method: 'POST',
          url: '/api/guestbook/entries',
          payload: { ...valid, website: 'x' },
        });
      } finally {
        await built.app.close();
      }
      expect(called).toBe(false);
    });
  });

  describe('2층 — 규칙', () => {
    it('링크가 셋이면 202 보류이고 목록에 나오지 않는다', async () => {
      const res = await post({
        ...valid,
        body: '싸게 팝니다 https://a.example https://b.example https://c.example',
      });

      expect(res.statusCode).toBe(202);
      expect(res.json().status).toBe('held');
      expect(await listed()).toHaveLength(0);
      expect(await heldCount()).toBe(1);
    });

    it('어느 규칙에 걸렸는지 방문자에게 알리지 않는다', async () => {
      const res = await post({ ...valid, body: `도배${'ㅋ'.repeat(30)}` });
      const message: string = res.json().message;
      expect(message).not.toMatch(/링크|반복|규칙/);
    });

    it('사유는 주인만 볼 수 있게 남는다', async () => {
      await post({ ...valid, body: `도배${'ㅋ'.repeat(30)}` });
      const { rows } = await pool.query<{ held_reason: string }>(
        `SELECT held_reason FROM guestbook_entry WHERE status = 'held'`,
      );
      expect(rows[0]?.held_reason).toContain('반복');
    });
  });

  describe('3층 — 판정', () => {
    it('publish 면 공개로 저장한다', async () => {
      const res = await post(valid);
      expect(res.statusCode).toBe(201);
      expect(await listed()).toHaveLength(1);
    });

    it('hold 면 202 보류다', async () => {
      nextVerdict = { decision: 'hold', reason: '광고인지 갈린다', score: 0.55 };
      const res = await post(valid);

      expect(res.statusCode).toBe(202);
      expect(res.json().status).toBe('held');
      expect(await listed()).toHaveLength(0);
    });

    it('block 도 지우지 않고 보류로 남긴다 — 지우는 것은 주인이 한다', async () => {
      nextVerdict = { decision: 'block', reason: '명백한 광고', score: 0.97 };
      const res = await post(valid);

      expect(res.statusCode).toBe(202);
      expect(await heldCount()).toBe(1);
    });

    it('판정 점수와 사유를 함께 저장한다', async () => {
      nextVerdict = { decision: 'hold', reason: '개인정보 포함', score: 0.4 };
      await post(valid);

      const { rows } = await pool.query<{ held_reason: string; verdict_score: number }>(
        `SELECT held_reason, verdict_score FROM guestbook_entry WHERE status = 'held'`,
      );
      expect(rows[0]?.held_reason).toContain('개인정보 포함');
      expect(rows[0]?.verdict_score).toBeCloseTo(0.4, 5);
    });

    it('판정을 받지 못하면 공개되지 않는다 (FR-013)', async () => {
      // withFailSafe 가 돌려주는 것과 같은 모양 — 점수 없는 보류.
      nextVerdict = { decision: 'hold', reason: '판정을 받지 못함', score: null };
      const res = await post(valid);

      expect(res.statusCode).toBe(202);
      expect(await listed()).toHaveLength(0);
    });
  });

  describe('중복과 한도', () => {
    it('24시간 안에 같은 내용이면 409', async () => {
      await post(valid);
      const again = await post(valid);

      expect(again.statusCode).toBe(409);
      expect(again.json().error).toBe('duplicate');
    });

    it('보류된 글과 같은 내용도 409 다', async () => {
      nextVerdict = { decision: 'hold', reason: '갈린다', score: 0.5 };
      await post(valid);
      nextVerdict = { decision: 'publish', reason: '', score: 0 };

      expect((await post(valid)).statusCode).toBe(409);
    });

    it('시간당 한도를 넘으면 429 와 retryAfter', async () => {
      const { max } = testConfig().rateLimit;
      for (let i = 0; i < max; i++) {
        const res = await post({ ...valid, body: `글 ${i}` });
        expect(res.statusCode).toBe(201);
      }

      const over = await post({ ...valid, body: '한 번 더' });
      expect(over.statusCode).toBe(429);
      expect(over.json().error).toBe('rate_limited');
      expect(over.json().retryAfter).toBeGreaterThan(0);
      expect(over.headers['retry-after']).toBeDefined();
    });

    it('보류된 글도 한도에 센다', async () => {
      const { max } = testConfig().rateLimit;
      nextVerdict = { decision: 'hold', reason: '갈린다', score: 0.5 };
      for (let i = 0; i < max; i++) {
        expect((await post({ ...valid, body: `글 ${i}` })).statusCode).toBe(202);
      }
      expect((await post({ ...valid, body: '한 번 더' })).statusCode).toBe(429);
    });

    it('저장되지 않은 봇 요청은 한도에 세지 않는다', async () => {
      const { max } = testConfig().rateLimit;
      for (let i = 0; i < max + 3; i++) {
        await post({ ...valid, website: 'x', body: `봇 ${i}` });
      }
      // 봇이 남의 몫까지 먹어 치우지 않는다.
      expect((await post(valid)).statusCode).toBe(201);
    });
  });

  it('순간 폭주 막이도 계약대로 429 를 낸다', async () => {
    // 평범한 객체를 돌려주던 때에는 여기가 500 이었다. 방문자는 "문제가 생겼습니다" 를
    // 보고 될 때까지 다시 눌렀다.
    const built = await buildServer(testConfig(), { judge, burstMax: 2 });
    await built.app.ready();
    try {
      const get = () => built.app.inject({ method: 'GET', url: '/api/guestbook/entries' });
      expect((await get()).statusCode).toBe(200);
      expect((await get()).statusCode).toBe(200);

      const blocked = await get();
      expect(blocked.statusCode).toBe(429);
      expect(blocked.json().error).toBe('rate_limited');
      expect(blocked.json().message).toBe('잠시 뒤 다시 남겨 주세요.');
      expect(blocked.headers['retry-after']).toBeDefined();
    } finally {
      await built.app.close();
    }
  });

  it('접속 주소를 원문으로 저장하지 않는다 (FR-020)', async () => {
    await post(valid);
    const { rows } = await pool.query<{ client_hash: string }>(`SELECT client_hash FROM abuse_mark`);

    expect(rows).toHaveLength(1);
    // sha256 16진수 64자. 주소가 그대로 들어 있지 않다.
    expect(rows[0]?.client_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(rows[0]?.client_hash).not.toContain('127.0.0.1');
  });
});

describe('GET /api/guestbook/entries', () => {
  it('비어 있으면 빈 목록과 nextBefore=null', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/guestbook/entries' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ entries: [], nextBefore: null });
  });

  it('최신 글이 앞에 온다', async () => {
    for (const n of ['첫째', '둘째', '셋째']) {
      await insertEntry(pool, { author: '박', body: n, status: 'visible' });
    }
    const res = await app.inject({ method: 'GET', url: '/api/guestbook/entries' });
    expect(res.json().entries.map((e: { body: string }) => e.body)).toEqual([
      '셋째',
      '둘째',
      '첫째',
    ]);
  });

  it('보류·삭제된 글은 존재 자체가 드러나지 않는다', async () => {
    await insertEntry(pool, { author: '박', body: '보임', status: 'visible' });
    await insertEntry(pool, { author: '박', body: '보류', status: 'held' });
    await insertEntry(pool, { author: '박', body: '삭제', status: 'removed' });

    const bodies = (await app.inject({ method: 'GET', url: '/api/guestbook/entries' })).json()
      .entries;
    expect(bodies).toHaveLength(1);
    expect(bodies[0].body).toBe('보임');
  });

  it('limit 만큼만 주고, 더 있으면 nextBefore 를 준다', async () => {
    for (let i = 0; i < 5; i++) {
      await insertEntry(pool, { author: '박', body: `글 ${i}`, status: 'visible' });
    }
    const res = await app.inject({ method: 'GET', url: '/api/guestbook/entries?limit=2' });
    const body = res.json();
    expect(body.entries).toHaveLength(2);
    expect(body.nextBefore).toBe(body.entries[1].createdAt);
  });

  it('nextBefore 로 이어 읽으면 겹치지 않고 이어진다', async () => {
    for (let i = 0; i < 5; i++) {
      await insertEntry(pool, { author: '박', body: `글 ${i}`, status: 'visible' });
    }
    const first = (
      await app.inject({ method: 'GET', url: '/api/guestbook/entries?limit=2' })
    ).json();
    const second = (
      await app.inject({
        method: 'GET',
        url: `/api/guestbook/entries?limit=2&before=${encodeURIComponent(first.nextBefore)}`,
      })
    ).json();

    const firstIds = first.entries.map((e: { id: number }) => e.id);
    const secondIds = second.entries.map((e: { id: number }) => e.id);
    expect(secondIds).toHaveLength(2);
    expect(firstIds.some((id: number) => secondIds.includes(id))).toBe(false);
  });

  it('마지막 쪽에서는 nextBefore 가 null', async () => {
    await insertEntry(pool, { author: '박', body: '하나뿐', status: 'visible' });
    const body = (
      await app.inject({ method: 'GET', url: '/api/guestbook/entries?limit=20' })
    ).json();
    expect(body.entries).toHaveLength(1);
    expect(body.nextBefore).toBeNull();
  });

  it('말이 안 되는 limit 은 거절하지 않고 기본값으로 돈다', async () => {
    await insertEntry(pool, { author: '박', body: '글', status: 'visible' });
    const res = await app.inject({ method: 'GET', url: '/api/guestbook/entries?limit=999' });
    expect(res.statusCode).toBe(200);
    expect(res.json().entries).toHaveLength(1);
  });
});
