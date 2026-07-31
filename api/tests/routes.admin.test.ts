import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../src/server.js';
import { insertEntry } from '../src/db/entries.js';
import type { Pool } from '../src/db/pool.js';
import { setupTestDb, truncateAll, testConfig } from './helpers/db.js';

/**
 * 주인의 안전망 (T044).
 *
 * 확인하는 것은 세 가지다 — 토큰 없이는 아무것도 못 하고, 없는 글과 옮길 수 없는 상태를
 * 갈라서 알려 주고, 상태 전이가 data-model.md 를 따른다.
 */

let app: FastifyInstance;
let pool: Pool;

const config = testConfig();
const auth = (token = config.adminToken) => ({ authorization: `Bearer ${token}` });

beforeAll(async () => {
  pool = await setupTestDb();
  await pool.end();
  const built = await buildServer(config, {
    judge: () => Promise.resolve({ decision: 'publish', reason: '', score: 0 }),
  });
  app = built.app;
  pool = built.pool;
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await truncateAll(pool);
});

const held = (body = '보류된 글') =>
  insertEntry(pool, {
    author: '지나가던 개발자',
    body,
    status: 'held',
    heldReason: '판정: 광고인지 갈린다',
    verdictScore: 0.62,
  });

describe('토큰 (FR-018)', () => {
  const cases: [string, Record<string, string>][] = [
    ['헤더가 아예 없으면', {}],
    ['빈 값이면', { authorization: 'Bearer ' }],
    ['틀린 토큰이면', auth('틀린토큰'.repeat(10))],
    ['맞는 토큰이지만 Bearer 가 아니면', { authorization: `Token ${config.adminToken}` }],
    ['앞부분만 맞으면', auth(config.adminToken.slice(0, -1))],
    ['뒤에 한 글자가 붙으면', auth(`${config.adminToken}x`)],
  ];

  for (const [label, headers] of cases) {
    it(`${label} 401`, async () => {
      const res = await app.inject({ method: 'GET', url: '/api/guestbook/held', headers });
      expect(res.statusCode).toBe(401);
      expect(res.json().error).toBe('unauthorized');
    });
  }

  it('공개 경로는 토큰 없이도 그대로 된다 — 훅이 앱 전체에 걸리지 않았다', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/guestbook/entries' })).statusCode).toBe(
      200,
    );
    expect((await app.inject({ method: 'GET', url: '/api/health' })).statusCode).toBe(200);
  });

  it('토큰 없이는 공개도 삭제도 못 한다', async () => {
    const entry = await held();
    const publish = await app.inject({
      method: 'POST',
      url: `/api/guestbook/entries/${entry.id}/publish`,
    });
    const remove = await app.inject({ method: 'DELETE', url: `/api/guestbook/entries/${entry.id}` });

    expect(publish.statusCode).toBe(401);
    expect(remove.statusCode).toBe(401);

    // 정말로 아무 일도 없었다.
    const { rows } = await pool.query<{ status: string }>(
      'SELECT status FROM guestbook_entry WHERE id = $1',
      [entry.id],
    );
    expect(rows[0]?.status).toBe('held');
  });
});

describe('GET /api/guestbook/held', () => {
  it('보류된 글만, 사유와 점수를 함께 준다', async () => {
    await held('보류');
    await insertEntry(pool, { author: '박', body: '공개', status: 'visible' });
    await insertEntry(pool, { author: '박', body: '삭제', status: 'removed' });

    const res = await app.inject({ method: 'GET', url: '/api/guestbook/held', headers: auth() });

    expect(res.statusCode).toBe(200);
    const { entries } = res.json();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      author: '지나가던 개발자',
      body: '보류',
      heldReason: '판정: 광고인지 갈린다',
    });
    expect(entries[0].verdictScore).toBeCloseTo(0.62, 5);
  });

  it('사유·점수가 없는 보류 글은 null 로 준다', async () => {
    await insertEntry(pool, { author: '박', body: '사유 없이 보류', status: 'held' });
    const { entries } = (
      await app.inject({ method: 'GET', url: '/api/guestbook/held', headers: auth() })
    ).json();

    expect(entries[0].heldReason).toBeNull();
    expect(entries[0].verdictScore).toBeNull();
  });

  it('비어 있으면 빈 목록', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/guestbook/held', headers: auth() });
    expect(res.json()).toEqual({ entries: [] });
  });

  it('최신 글이 앞에 온다', async () => {
    for (const body of ['첫째', '둘째', '셋째']) await held(body);
    const { entries } = (
      await app.inject({ method: 'GET', url: '/api/guestbook/held', headers: auth() })
    ).json();

    expect(entries.map((e: { body: string }) => e.body)).toEqual(['셋째', '둘째', '첫째']);
  });
});

describe('POST /api/guestbook/entries/:id/publish', () => {
  it('보류된 글을 공개하면 목록에 나타난다', async () => {
    const entry = await held();
    const res = await app.inject({
      method: 'POST',
      url: `/api/guestbook/entries/${entry.id}/publish`,
      headers: auth(),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'visible' });

    const listed = (await app.inject({ method: 'GET', url: '/api/guestbook/entries' })).json();
    expect(listed.entries).toHaveLength(1);
  });

  it('공개하면 보류함에서 빠진다', async () => {
    const entry = await held();
    await app.inject({
      method: 'POST',
      url: `/api/guestbook/entries/${entry.id}/publish`,
      headers: auth(),
    });

    const { entries } = (
      await app.inject({ method: 'GET', url: '/api/guestbook/held', headers: auth() })
    ).json();
    expect(entries).toHaveLength(0);
  });

  it('검토 시각을 남긴다', async () => {
    const entry = await held();
    await app.inject({
      method: 'POST',
      url: `/api/guestbook/entries/${entry.id}/publish`,
      headers: auth(),
    });

    const { rows } = await pool.query<{ reviewed_at: Date | null }>(
      'SELECT reviewed_at FROM guestbook_entry WHERE id = $1',
      [entry.id],
    );
    expect(rows[0]?.reviewed_at).toBeInstanceOf(Date);
  });

  it('없는 글은 404', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/guestbook/entries/999999/publish',
      headers: auth(),
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe('not_found');
  });

  it('이미 공개된 글은 409', async () => {
    const entry = await insertEntry(pool, { author: '박', body: '이미 공개', status: 'visible' });
    const res = await app.inject({
      method: 'POST',
      url: `/api/guestbook/entries/${entry.id}/publish`,
      headers: auth(),
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('invalid_state');
    // 문구가 그대로 주인에게 보인다.
    expect(res.json().message).toMatch(/보류/);
  });

  it('지운 글은 되살아나지 않는다 — 409', async () => {
    const entry = await insertEntry(pool, { author: '박', body: '지운 글', status: 'removed' });
    const res = await app.inject({
      method: 'POST',
      url: `/api/guestbook/entries/${entry.id}/publish`,
      headers: auth(),
    });
    expect(res.statusCode).toBe(409);
  });

  it('숫자가 아닌 id 는 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/guestbook/entries/abc/publish',
      headers: auth(),
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('DELETE /api/guestbook/entries/:id', () => {
  it('공개된 글을 지우면 목록에서 사라진다', async () => {
    const entry = await insertEntry(pool, { author: '박', body: '공개', status: 'visible' });
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/guestbook/entries/${entry.id}`,
      headers: auth(),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'removed' });

    const listed = (await app.inject({ method: 'GET', url: '/api/guestbook/entries' })).json();
    expect(listed.entries).toHaveLength(0);
  });

  it('보류된 글도 지울 수 있다', async () => {
    const entry = await held();
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/guestbook/entries/${entry.id}`,
      headers: auth(),
    });

    expect(res.statusCode).toBe(200);
    const { entries } = (
      await app.inject({ method: 'GET', url: '/api/guestbook/held', headers: auth() })
    ).json();
    expect(entries).toHaveLength(0);
  });

  it('두 번 지워도 성공이다 — 주인이 또 누르게 만들지 않는다', async () => {
    const entry = await held();
    const url = `/api/guestbook/entries/${entry.id}`;

    expect((await app.inject({ method: 'DELETE', url, headers: auth() })).statusCode).toBe(200);
    expect((await app.inject({ method: 'DELETE', url, headers: auth() })).statusCode).toBe(200);
  });

  it('없는 글은 404', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/guestbook/entries/999999',
      headers: auth(),
    });
    expect(res.statusCode).toBe(404);
  });

  it('행을 지우지 않는다 — 같은 글의 재등록을 중복 검사가 막아야 한다', async () => {
    const entry = await insertEntry(pool, { author: '박', body: '지울 글', status: 'visible' });
    await app.inject({
      method: 'DELETE',
      url: `/api/guestbook/entries/${entry.id}`,
      headers: auth(),
    });

    const { rows } = await pool.query<{ status: string }>(
      'SELECT status FROM guestbook_entry WHERE id = $1',
      [entry.id],
    );
    expect(rows[0]?.status).toBe('removed');
  });
});
