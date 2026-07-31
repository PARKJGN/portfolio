import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { checkRules, countLinks, LINK_MAX, REPEAT_MAX } from '../src/guard/rules.js';
import { hasRecentDuplicate, insertEntry } from '../src/db/entries.js';
import type { Pool } from '../src/db/pool.js';
import { setupTestDb, truncateAll } from './helpers/db.js';

/**
 * 2층 — 규칙 (T034).
 *
 * 앞의 두 묶음은 순수 함수다. 중복만 데이터베이스를 본다 — 규칙이지만 "이미 있는가" 는
 * 상태를 봐야 알 수 있어 `db/entries.ts` 에 두었다.
 */

describe('링크 수', () => {
  it(`${LINK_MAX}개까지는 통과한다`, () => {
    expect(checkRules('참고: https://a.example 과 https://b.example 보세요')).toEqual({ ok: true });
  });

  it(`${LINK_MAX}개를 넘으면 걸린다`, () => {
    const body = '싸게 팝니다 https://a.example https://b.example https://c.example';
    const result = checkRules(body);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toContain('링크');
  });

  it('앞머리 없이 적은 주소도 센다', () => {
    expect(countLinks('naver.com 과 daum.net 과 example.shop 보세요')).toBe(3);
    expect(checkRules('naver.com 과 daum.net 과 example.shop 보세요').ok).toBe(false);
  });

  it('한 주소를 두 번 세지 않는다', () => {
    expect(countLinks('https://naver.com')).toBe(1);
    expect(countLinks('www.naver.com')).toBe(1);
  });

  it('마침표가 붙은 평범한 문장을 링크로 보지 않는다', () => {
    expect(countLinks('잘 봤습니다. 정말 재밌네요. 또 오겠습니다.')).toBe(0);
  });
});

describe('문자 반복', () => {
  it(`${REPEAT_MAX}번 미만은 통과한다`, () => {
    expect(checkRules(`대박${'ㅋ'.repeat(REPEAT_MAX - 1)}`)).toEqual({ ok: true });
  });

  it('30번 이어지면 걸린다', () => {
    const result = checkRules(`도배${'ㅋ'.repeat(30)}`);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toContain('반복');
  });

  it('이모지도 한 글자로 센다', () => {
    expect(checkRules('🎉'.repeat(REPEAT_MAX)).ok).toBe(false);
    expect(checkRules('🎉'.repeat(REPEAT_MAX - 1)).ok).toBe(true);
  });

  it('줄바꿈을 사이에 둔 것은 이어진 것이 아니다', () => {
    expect(checkRules(`${'ㅋ'.repeat(15)}\n${'ㅋ'.repeat(15)}`).ok).toBe(true);
  });
});

describe('평범한 글', () => {
  it('통과한다', () => {
    expect(checkRules('3D 책 재밌네요.\n잘 봤습니다.')).toEqual({ ok: true });
  });
});

describe('중복 (24시간)', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = await setupTestDb();
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await truncateAll(pool);
  });

  it('같은 내용이 없으면 중복이 아니다', async () => {
    await expect(hasRecentDuplicate(pool, '처음 남기는 글')).resolves.toBe(false);
  });

  it('같은 내용이 이미 있으면 중복이다', async () => {
    await insertEntry(pool, { author: '가', body: '똑같은 글', status: 'visible' });
    await expect(hasRecentDuplicate(pool, '똑같은 글')).resolves.toBe(true);
  });

  it('지운 글도 센다 — 지운 것을 다시 붙여 넣지 못하게', async () => {
    await insertEntry(pool, { author: '나', body: '지워진 글', status: 'removed' });
    await expect(hasRecentDuplicate(pool, '지워진 글')).resolves.toBe(true);
  });

  it('보류된 글도 센다', async () => {
    await insertEntry(pool, { author: '다', body: '보류된 글', status: 'held' });
    await expect(hasRecentDuplicate(pool, '보류된 글')).resolves.toBe(true);
  });

  it('창 밖의 글은 세지 않는다', async () => {
    const entry = await insertEntry(pool, { author: '라', body: '오래된 글', status: 'visible' });
    // 창을 0 으로 두는 방법은 흔들린다 — 잘라내는 시각은 Node 시계로, 행의 시각은
    // Postgres 시계로 정해지므로 둘이 몇 밀리초만 어긋나도 결과가 갈린다.
    // 행을 이틀 전으로 밀어 두면 그 정도 오차로는 뒤집히지 않는다.
    await pool.query(`UPDATE guestbook_entry SET created_at = now() - interval '2 days'`);

    await expect(hasRecentDuplicate(pool, '오래된 글')).resolves.toBe(false);
    expect(entry.id).toBeGreaterThan(0);
  });
});
