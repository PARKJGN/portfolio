/**
 * 2층 — 규칙.
 *
 * 광고 글이 가진 눈에 보이는 특징만 본다(data-model.md 검증 규칙). 맥락이 필요한 판단은
 * 3층에 맡긴다 — 여기서 욕설 사전을 굴리기 시작하면 `ㅅㅂ`·`씨1발` 같은 변형을 쫓느라
 * 끝이 없다(research.md R-7).
 *
 * 순수 함수다. 데이터베이스가 필요한 중복 검사는 `db/entries.ts` 의 `hasRecentDuplicate`
 * 가 맡는다 — 규칙이지만 상태를 봐야 해서 여기 둘 수 없다.
 */

/** 링크로 보이는 토큰이 이 수를 넘으면 걸린다. */
export const LINK_MAX = 2;
/** 같은 문자가 이만큼 이어지면 걸린다. */
export const REPEAT_MAX = 20;

export type RuleCheck = { ok: true } | { ok: false; reason: string };

/**
 * 링크로 보이는 토큰.
 *
 * 앞쪽 갈래(`http://`·`www.`)가 먼저 걸리므로 `https://naver.com` 은 한 번만 센다 —
 * 정규식 갈래는 왼쪽부터 시도되고, 맞으면 그 길이만큼 건너뛴다.
 * 뒤쪽 갈래는 `naver.com` 처럼 앞머리 없이 적은 주소를 잡는다.
 */
const LINK_RE =
  /(?:https?:\/\/|www\.)\S+|\b[\p{L}\p{N}][\p{L}\p{N}-]*\.(?:com|net|org|io|co|kr|jp|cn|ru|us|de|xyz|top|shop|info|biz|link|click|site|online|me|tv|cc)\b/giu;

/** 같은 문자가 REPEAT_MAX 번 이어지는 자리. `u` 플래그라 이모지도 한 글자로 센다. */
const REPEAT_RE = new RegExp(`(.)\\1{${REPEAT_MAX - 1},}`, 'su');

export function countLinks(body: string): number {
  return body.match(LINK_RE)?.length ?? 0;
}

export function checkRules(body: string): RuleCheck {
  const links = countLinks(body);
  if (links > LINK_MAX) return { ok: false, reason: `규칙: 링크 ${links}개` };

  if (REPEAT_RE.test(body)) return { ok: false, reason: '규칙: 같은 문자 반복' };

  return { ok: true };
}
