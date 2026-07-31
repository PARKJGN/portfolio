import { describe, it, expect } from 'vitest';
import {
  normalizeEntry,
  normalizeListQuery,
  countChars,
  AUTHOR_MAX,
  BODY_MAX,
  LIMIT_DEFAULT,
  LIMIT_MAX,
} from '../src/validate.js';
import { ApiError } from '../src/errors.js';

/**
 * 입력 검증 (T018).
 *
 * 데이터베이스도 HTTP 도 필요 없다 — 순수 함수라서 경계값을 마음껏 훑을 수 있다.
 * 헌장 원칙 IV 가 "폼 검증과 제출"을 REQUIRED 로 지목한 자리다.
 */

const ok = { author: '박', body: '안녕하세요' };

describe('normalizeEntry — 이름', () => {
  it('앞뒤 공백을 없앤다', () => {
    expect(normalizeEntry({ ...ok, author: '  박종건  ' }).author).toBe('박종건');
  });

  it('1자는 통과한다', () => {
    expect(normalizeEntry({ ...ok, author: '박' }).author).toBe('박');
  });

  it(`${AUTHOR_MAX}자는 통과한다`, () => {
    const name = '가'.repeat(AUTHOR_MAX);
    expect(normalizeEntry({ ...ok, author: name }).author).toBe(name);
  });

  it(`${AUTHOR_MAX + 1}자는 거절한다`, () => {
    expect(() => normalizeEntry({ ...ok, author: '가'.repeat(AUTHOR_MAX + 1) })).toThrow(ApiError);
  });

  it('비어 있으면 거절한다', () => {
    expect(() => normalizeEntry({ ...ok, author: '' })).toThrow(ApiError);
  });

  it('공백만 있으면 — 다듬으면 비므로 — 거절한다', () => {
    expect(() => normalizeEntry({ ...ok, author: '   \n\t  ' })).toThrow(ApiError);
  });

  it('없으면 거절한다', () => {
    expect(() => normalizeEntry({ body: '내용' })).toThrow(ApiError);
  });

  it('문자열이 아니면 거절한다', () => {
    expect(() => normalizeEntry({ author: 42, body: '내용' })).toThrow(ApiError);
  });
});

describe('normalizeEntry — 내용', () => {
  it('1자는 통과한다', () => {
    expect(normalizeEntry({ ...ok, body: '.' }).body).toBe('.');
  });

  it(`${BODY_MAX}자는 통과한다`, () => {
    const body = '가'.repeat(BODY_MAX);
    expect(normalizeEntry({ ...ok, body }).body).toBe(body);
  });

  it(`${BODY_MAX + 1}자는 거절한다`, () => {
    expect(() => normalizeEntry({ ...ok, body: '가'.repeat(BODY_MAX + 1) })).toThrow(ApiError);
  });

  it('줄바꿈은 내용으로 인정한다 — 가운데 줄바꿈은 지우지 않는다', () => {
    expect(normalizeEntry({ ...ok, body: '첫 줄\n둘째 줄' }).body).toBe('첫 줄\n둘째 줄');
  });

  it('공백만 있으면 거절한다', () => {
    expect(() => normalizeEntry({ ...ok, body: '\n\n   ' })).toThrow(ApiError);
  });
});

describe('normalizeEntry — 오류의 모양', () => {
  it('방문자에게 보여도 되는 문구를 담는다', () => {
    try {
      normalizeEntry({ author: '', body: '내용' });
      expect.unreachable('거절했어야 한다');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      const api = err as ApiError;
      expect(api.code).toBe('invalid_input');
      expect(api.statusCode).toBe(400);
      // 코드 이름이 아니라 사람 말이어야 한다 (원칙 II)
      expect(api.message).toMatch(/이름/);
    }
  });

  it('이름과 내용이 모두 잘못되면 이름을 먼저 알린다 — 한 번에 하나씩 고치게 한다', () => {
    try {
      normalizeEntry({ author: '', body: '' });
      expect.unreachable('거절했어야 한다');
    } catch (err) {
      expect((err as ApiError).message).toMatch(/이름/);
    }
  });
});

describe('countChars — 코드 포인트로 센다', () => {
  it('이모지 하나를 1자로 센다', () => {
    // '.length' 로 세면 2 다. 그대로 세면 이모지를 쓴 사람이 손해를 본다.
    expect('🙂'.length).toBe(2);
    expect(countChars('🙂')).toBe(1);
  });

  it('이모지 20자 이름을 통과시킨다', () => {
    const name = '🙂'.repeat(AUTHOR_MAX);
    expect(normalizeEntry({ ...ok, author: name }).author).toBe(name);
  });

  it('이모지 21자 이름은 거절한다', () => {
    expect(() => normalizeEntry({ ...ok, author: '🙂'.repeat(AUTHOR_MAX + 1) })).toThrow(ApiError);
  });
});

describe('normalizeListQuery', () => {
  it('아무것도 없으면 기본값', () => {
    expect(normalizeListQuery({})).toEqual({ limit: LIMIT_DEFAULT, before: undefined });
  });

  it('범위 안의 limit 은 그대로', () => {
    expect(normalizeListQuery({ limit: '5' }).limit).toBe(5);
  });

  it.each([['0'], ['-1'], [String(LIMIT_MAX + 1)], ['abc'], ['1.5']])(
    'limit=%s 은 거절하지 않고 기본값으로 되돌린다',
    (raw) => {
      expect(normalizeListQuery({ limit: raw }).limit).toBe(LIMIT_DEFAULT);
    },
  );

  it('before 는 ISO 문자열을 시각으로 바꾼다', () => {
    const iso = '2026-07-31T02:11:09.482Z';
    expect(normalizeListQuery({ before: iso }).before?.toISOString()).toBe(iso);
  });

  it('말이 안 되는 before 는 없는 것으로 본다', () => {
    expect(normalizeListQuery({ before: '어제' }).before).toBeUndefined();
  });
});
