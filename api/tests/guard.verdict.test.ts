import { describe, it, expect, vi } from 'vitest';
import { withFailSafe, VERDICT_UNAVAILABLE, type Verdict } from '../src/guard/verdict.js';

/**
 * 3층 — 판정 (T035).
 *
 * 여기서 확인하는 것은 판정의 정확도가 아니다. 그것은 모델의 몫이고 단위 테스트로 고정할
 * 수 없다. 확인하는 것은 **판정을 받지 못했을 때 어디로 떨어지는가** 다 — 공개가 아니라
 * 보류여야 한다(FR-013). 방어의 실패는 닫히는 쪽으로 향해야 한다.
 *
 * 실제 API 를 부르지 않는다.
 */

const input = { author: '지나가던 개발자', body: '3D 책 재밌네요.' };

const PUBLISH: Verdict = { decision: 'publish', reason: '평범한 인사', score: 0.02 };

describe('판정을 받았을 때', () => {
  it('결과를 그대로 돌려준다', async () => {
    const judge = withFailSafe(async () => PUBLISH, 1000);
    await expect(judge(input)).resolves.toEqual(PUBLISH);
  });
});

describe('판정을 받지 못했을 때', () => {
  it('오류가 나면 보류다', async () => {
    const judge = withFailSafe(() => Promise.reject(new Error('401 Unauthorized')), 1000);
    await expect(judge(input)).resolves.toEqual(VERDICT_UNAVAILABLE);
  });

  it('보류로 떨어져도 공개는 아니다', async () => {
    expect(VERDICT_UNAVAILABLE.decision).not.toBe('publish');
    expect(VERDICT_UNAVAILABLE.score).toBeNull();
  });

  it('시간이 지나면 기다리지 않는다', async () => {
    vi.useFakeTimers();
    try {
      // signal 을 무시하고 영원히 붙잡는 호출. 응답은 그래도 나와야 한다.
      const judge = withFailSafe(() => new Promise<Verdict>(() => {}), 4000);
      const pending = judge(input);
      await vi.advanceTimersByTimeAsync(4000);
      await expect(pending).resolves.toEqual(VERDICT_UNAVAILABLE);
    } finally {
      vi.useRealTimers();
    }
  });

  it('시간이 지나면 호출을 끊는다 — 답 없는 요청을 붙들고 있지 않는다', async () => {
    vi.useFakeTimers();
    try {
      let seen: AbortSignal | undefined;
      const judge = withFailSafe((_i, signal) => {
        seen = signal;
        return new Promise<Verdict>(() => {});
      }, 4000);
      const pending = judge(input);
      expect(seen?.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(4000);
      await pending;
      expect(seen?.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
