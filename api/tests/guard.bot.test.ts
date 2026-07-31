import { describe, it, expect } from 'vitest';
import { checkBot, MIN_FILL_MS } from '../src/guard/bot.js';

/**
 * 1층 — 봇 판별 (T033).
 *
 * 순수 함수라 서버도 데이터베이스도 띄우지 않는다. 시간은 밖에서 넣는다.
 */

const NOW = Date.parse('2026-07-31T03:00:00.000Z');
const ago = (ms: number) => new Date(NOW - ms).toISOString();

describe('숨은 칸', () => {
  it('채워져 있으면 봇이다', () => {
    expect(checkBot({ website: 'https://buy.example', openedAt: ago(60_000), now: NOW })).toEqual({
      bot: true,
      reason: 'honeypot',
    });
  });

  it('공백만 있는 것은 채운 것으로 보지 않는다', () => {
    expect(checkBot({ website: '   ', openedAt: ago(60_000), now: NOW })).toEqual({ bot: false });
  });

  it('비어 있으면 통과한다', () => {
    expect(checkBot({ website: '', openedAt: ago(60_000), now: NOW })).toEqual({ bot: false });
  });
});

describe('작성 시간', () => {
  it('3초 미만이면 봇이다', () => {
    expect(checkBot({ website: '', openedAt: ago(MIN_FILL_MS - 1), now: NOW })).toEqual({
      bot: true,
      reason: 'too_fast',
    });
  });

  it('3초를 채우면 사람으로 본다', () => {
    expect(checkBot({ website: '', openedAt: ago(MIN_FILL_MS), now: NOW })).toEqual({ bot: false });
  });

  it('읽을 수 없는 시각은 봇이다 — 브라우저는 이런 값을 넣지 않는다', () => {
    expect(checkBot({ website: '', openedAt: '어제쯤', now: NOW })).toEqual({
      bot: true,
      reason: 'bad_timestamp',
    });
    expect(checkBot({ website: '', openedAt: 12345, now: NOW })).toEqual({
      bot: true,
      reason: 'bad_timestamp',
    });
  });

  it('시계가 앞선 방문자를 봇으로 몰지 않는다', () => {
    // 시계가 한 시간 빠른 사람. 흔하고, 봇으로 몰면 되돌릴 방법이 없다.
    const future = new Date(NOW + 60 * 60 * 1000).toISOString();
    expect(checkBot({ website: '', openedAt: future, now: NOW })).toEqual({ bot: false });
  });
});

it('숨은 칸이 시간보다 먼저다 — 둘 다 걸려도 사유는 honeypot', () => {
  expect(checkBot({ website: 'x', openedAt: ago(0), now: NOW })).toEqual({
    bot: true,
    reason: 'honeypot',
  });
});
