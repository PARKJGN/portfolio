/**
 * 1층 — 봇 판별.
 *
 * 두 가지만 본다. 사람은 보이지 않는 칸을 채우지 않고, 폼이 뜬 지 3초 만에 글을 다 적고
 * 누르지 않는다. 값싼 검사라 맨 앞에 둔다 — 여기서 걸리면 데이터베이스도 판정도 부르지
 * 않는다.
 *
 * 걸린 요청은 **저장하지 않고 버린다**(data-model.md 상태 전이). 보류함에 넣지 않는 이유는
 * 봇이 보류함을 채우게 둘 이유가 없기 때문이다. 응답은 성공처럼 보이게 한다 — 실패를
 * 알려 주면 조건을 바꿔 다시 온다(contracts/guestbook-api.md).
 */

/** 폼이 뜬 뒤 이만큼은 지나야 사람이 적은 것으로 본다. */
export const MIN_FILL_MS = 3000;

export type BotReason = 'honeypot' | 'too_fast' | 'bad_timestamp';

export type BotCheck = { bot: true; reason: BotReason } | { bot: false };

export interface BotInput {
  /** 숨은 칸. 사람에게는 보이지 않으므로 항상 빈 문자열이어야 한다. */
  website: unknown;
  /** 폼이 화면에 나타난 시각(ISO 8601). 브라우저가 넣는다. */
  openedAt: unknown;
  /** 지금. 테스트가 시간을 고정할 수 있게 밖에서 받는다. */
  now?: number;
}

export function checkBot({ website, openedAt, now = Date.now() }: BotInput): BotCheck {
  if (typeof website === 'string' && website.trim() !== '') {
    return { bot: true, reason: 'honeypot' };
  }

  if (typeof openedAt !== 'string') return { bot: true, reason: 'bad_timestamp' };
  const opened = Date.parse(openedAt);
  // 브라우저는 언제나 제대로 된 시각을 넣는다. 읽을 수 없는 값은 브라우저가 아니라는 뜻이다.
  if (Number.isNaN(opened)) return { bot: true, reason: 'bad_timestamp' };

  const elapsed = now - opened;
  // 음수 — 방문자 시계가 앞서 있다. 시계가 틀어진 사람은 흔하고, 그 사람을 봇으로 몰면
  // 되돌릴 방법이 없다. 판단하지 않고 다음 겹에 맡긴다.
  if (elapsed < 0) return { bot: false };
  if (elapsed < MIN_FILL_MS) return { bot: true, reason: 'too_fast' };

  return { bot: false };
}
