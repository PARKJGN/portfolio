import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
// @ts-expect-error — 빌드 스크립트라 타입 선언이 없다. 순수 함수 하나만 가져온다.
import { collectCharacters } from '../../scripts/collect-characters.mjs';

/**
 * 서브셋 글꼴이 현재 콘텐츠를 담고 있는지 확인한다.
 *
 * 이 검사가 없으면, 한글을 새로 추가하고 `npm run fonts:build` 를 잊었을 때
 * 그 글자만 폴백 글꼴로 렌더된다. 화면이 깨지지 않고 조용히 어긋나기 때문에
 * 사람 눈으로는 놓치기 쉽다.
 */
describe('서브셋 글꼴이 콘텐츠를 담고 있는가', () => {
  const CHARSET = 'scripts/generated-charset.txt';

  it('생성 기록(charset.txt)이 있다', () => {
    expect(existsSync(CHARSET), `${CHARSET} 없음 — npm run fonts:build 실행 필요`).toBe(true);
  });

  it('두 굵기 파일이 모두 있다', () => {
    for (const w of [400, 700]) {
      expect(existsSync(`public/fonts/noto-serif-kr-${w}.woff2`), `${w} 굵기 없음`).toBe(true);
    }
  });

  it('콘텐츠에 쓰인 글자가 전부 글꼴에 들어 있다', () => {
    const generated = new Set([...readFileSync(CHARSET, 'utf8')]);
    const current = [...collectCharacters()];

    const missing = current.filter((c) => !generated.has(c));

    expect(
      missing,
      missing.length
        ? `글꼴에 없는 글자 ${missing.length}자: ${missing.join('')}\n` +
            `→ npm run fonts:fetch && npm run fonts:build 실행 후 다시 커밋할 것`
        : '',
    ).toEqual([]);
  });
});
