/**
 * 관리 토큰 보관소.
 *
 * `sessionStorage` 는 React 바깥의 저장소다. effect 안에서 읽어 setState 하면 화면이 한 번
 * 그려진 뒤 다시 그려지고, 린트도 그것을 막는다. `useSyncExternalStore` 가 쓰라고 있는
 * 자리라 작은 구독 가능한 저장소로 감싼다.
 *
 * `localStorage` 가 아닌 이유: 토큰은 자격 증명이다. 보류함은 평소 열 일이 없는 화면이라,
 * 다시 붙여 넣는 수고보다 창을 닫으면 사라지는 편이 낫다.
 */

const KEY = 'portfolio.guestbook.adminToken';

/**
 * 이 토큰을 헤더에 실을 수 있는가.
 *
 * HTTP 헤더 값은 ASCII 여야 한다. 한글이나 이모지가 섞이면 `fetch` 가 요청을 보내기도 전에
 * 던지고, 그 오류는 "서버에 닿지 못했다" 와 구분되지 않는다 — 실제로 그랬다. 주인은 서버가
 * 죽은 줄 알고 엉뚱한 곳을 들여다보게 된다. 넣는 자리에서 막고 이유를 말해 준다.
 *
 * `openssl rand -hex 32` 로 만든 값은 언제나 통과한다.
 */
export function isUsableToken(value: string): boolean {
  // 출력 가능한 ASCII(공백~물결표)만. 줄바꿈은 헤더를 쪼개는 데 쓰일 수 있어 특히 막는다.
  return value !== '' && /^[\x20-\x7e]+$/.test(value);
}

const listeners = new Set<() => void>();

export function subscribeToken(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

export function readToken(): string | null {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    // 저장소를 막아 둔 브라우저. 토큰 없이 시작하고, 넣어도 이 창에서만 산다.
    return null;
  }
}

/** 정적 렌더 시점에는 저장소가 없다. 서버 스냅샷은 언제나 "없음" 이다. */
export function readTokenOnServer(): null {
  return null;
}

export function writeToken(value: string | null): void {
  try {
    if (value === null) sessionStorage.removeItem(KEY);
    else sessionStorage.setItem(KEY, value);
  } catch {
    // 저장하지 못해도 화면은 계속 돌아야 한다.
  }
  for (const listener of listeners) listener();
}
