import { invalidInput } from './errors.js';

/**
 * 방명록 글의 입력 검증.
 *
 * 라우트에서 떼어 낸 이유는 이것이 헌장 원칙 IV 가 REQUIRED 로 지목한 "입력 검증" 이라
 * 서버를 띄우지 않고 테스트할 수 있어야 하기 때문이다. 순수 함수라 데이터베이스도
 * HTTP 도 필요 없다.
 *
 * Fastify 의 JSON Schema 는 타입과 필수 여부를 본다. 여기서는 그다음 — **다듬은 뒤의
 * 길이** — 를 본다. 공백만 500자인 글은 스키마를 통과하지만 내용이 없다.
 */

export const AUTHOR_MAX = 20;
export const BODY_MAX = 500;

export interface EntryInput {
  author: string;
  body: string;
}

/**
 * 앞뒤 공백을 제거하고 길이를 확인한다.
 *
 * 문자 수는 코드 포인트 기준으로 센다. `'가'.length` 는 1 이지만 이모지처럼 서로게이트
 * 쌍으로 이루어진 글자는 `.length` 가 2 라, 그대로 세면 이모지를 쓴 사람이 손해를 본다.
 */
export function normalizeEntry(raw: { author?: unknown; body?: unknown }): EntryInput {
  const author = typeof raw.author === 'string' ? raw.author.trim() : '';
  const body = typeof raw.body === 'string' ? raw.body.trim() : '';

  if (author.length === 0) throw invalidInput('이름을 적어 주세요.');
  if (countChars(author) > AUTHOR_MAX) {
    throw invalidInput(`이름은 ${AUTHOR_MAX}자까지 적을 수 있습니다.`);
  }

  if (body.length === 0) throw invalidInput('내용을 적어 주세요.');
  if (countChars(body) > BODY_MAX) {
    throw invalidInput(`내용은 ${BODY_MAX}자까지 적을 수 있습니다.`);
  }

  return { author, body };
}

export function countChars(text: string): number {
  return [...text].length;
}

export interface ListQuery {
  limit: number;
  before: Date | undefined;
}

export const LIMIT_DEFAULT = 20;
export const LIMIT_MAX = 50;

/** 목록 조회의 쿼리를 다듬는다. 잘못된 값은 거절하지 않고 기본값으로 되돌린다. */
export function normalizeListQuery(raw: { limit?: unknown; before?: unknown }): ListQuery {
  let limit = LIMIT_DEFAULT;
  if (raw.limit !== undefined) {
    const parsed = Number(raw.limit);
    if (Number.isInteger(parsed) && parsed >= 1 && parsed <= LIMIT_MAX) limit = parsed;
  }

  let before: Date | undefined;
  if (typeof raw.before === 'string' && raw.before !== '') {
    const parsed = new Date(raw.before);
    if (!Number.isNaN(parsed.getTime())) before = parsed;
  }

  return { limit, before };
}
