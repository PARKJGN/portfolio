import { describe, it, expect } from 'vitest';
import { isUsableToken } from '@/lib/admin-token';

/**
 * 헤더에 실을 수 있는 토큰인가.
 *
 * 이 검사가 없으면 한글이 섞인 값에서 `fetch` 가 요청 전에 던지고, 그 오류가 "서버에 닿지
 * 못했다" 로 보인다. 주인은 서버를 들여다보게 된다 — 실제로 그랬다.
 */
describe('isUsableToken', () => {
  it('openssl rand -hex 32 결과를 받아들인다', () => {
    expect(isUsableToken('a'.repeat(64))).toBe(true);
    expect(isUsableToken('0123456789abcdef'.repeat(4))).toBe(true);
  });

  it('영문·숫자·기호는 받아들인다', () => {
    expect(isUsableToken('Abc-123_x.y+z/=')).toBe(true);
  });

  it('빈 값은 거절한다', () => {
    expect(isUsableToken('')).toBe(false);
  });

  it('한글이 섞이면 거절한다', () => {
    expect(isUsableToken('토큰')).toBe(false);
    expect(isUsableToken('abc토큰123')).toBe(false);
  });

  it('이모지는 거절한다', () => {
    expect(isUsableToken('abc🔑')).toBe(false);
  });

  it('줄바꿈은 거절한다 — 헤더를 쪼개는 데 쓰일 수 있다', () => {
    expect(isUsableToken('abc\r\nX-Injected: 1')).toBe(false);
    expect(isUsableToken('abc\n')).toBe(false);
    expect(isUsableToken('abc\tdef')).toBe(false);
  });
});
