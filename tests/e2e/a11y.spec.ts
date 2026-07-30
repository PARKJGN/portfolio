import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * 헌장 원칙 II 의 머지 게이트 — 위반 0건.
 *
 * 자동 검사가 모든 것을 잡지는 못한다(순서·맥락·의미는 사람이 봐야 한다 → T050).
 * 다만 대비·이름·역할·구조처럼 기계가 확실히 아는 것은 매번 도구가 본다.
 */

const scan = (page: import('@playwright/test').Page) =>
  new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']);

/** 열림 애니메이션(FLIP·표지 펼침)이 끝나길 기다린다 — 애니메이션 중에는 책이
 *  작게 축소돼 버튼이 24px 미만으로 보여 target-size 에 걸린다. 정지 상태를 검사한다. */
async function settleOpen(page: import('@playwright/test').Page) {
  await expect(page.locator('dialog[open]')).toBeVisible();
  await page.evaluate(async () => {
    const open = document.querySelector('dialog[open]');
    if (!open) return;
    const anims = open.getAnimations({ subtree: true });
    await Promise.all(anims.map((a) => a.finished.catch(() => undefined)));
  });
}

function report(violations: Awaited<ReturnType<AxeBuilder['analyze']>>['violations']) {
  return violations
    .map((v) => `[${v.impact}] ${v.id}: ${v.help}\n    ${v.nodes.map((n) => n.target).join('\n    ')}`)
    .join('\n');
}

test.describe('접근성 자동 검사 (원칙 II)', () => {
  // 접근성의 실체는 HTML 본문이다(3D 캔버스는 aria-hidden). 움직임 최소화로 3D 등장을
  // 끄면 그 HTML 모달이 결정적으로 정착해(등장 경쟁 없음) axe 가 안정적으로 본다.
  test.use({ reducedMotion: 'reduce' });

  test('방', async ({ page }) => {
    await page.goto('/');
    const { violations } = await scan(page).analyze();
    expect(report(violations)).toBe('');
  });

  test('책 창이 열린 상태', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-book-slug="hello"]').click();
    await settleOpen(page);

    const { violations } = await scan(page).analyze();
    expect(report(violations)).toBe('');
  });

  test('전체 이어보기 모드', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-book-slug="hello"]').click();
    await settleOpen(page);
    await page.getByRole('button', { name: '전체 이어보기' }).click();

    const { violations } = await scan(page).analyze();
    expect(report(violations)).toBe('');
  });

  test('어두운 테마 (SC-009)', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');
    const { violations } = await scan(page).analyze();
    expect(report(violations)).toBe('');
  });

  test('어두운 테마에서 책 창', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');
    await page.locator('[data-book-slug="hello"]').click();
    await settleOpen(page);

    const { violations } = await scan(page).analyze();
    expect(report(violations)).toBe('');
  });
});

test.describe('움직임 최소화 (FR-016)', () => {
  test('책등 호버 연출과 스크롤 애니메이션이 꺼진다', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');

    // 미디어 쿼리가 실제로 걸렸는지 먼저 확인한다 — 이걸 빼면 에뮬레이션이
    // 동작하지 않을 때 "연출이 꺼졌다"고 잘못 통과할 수 있다.
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(
      true,
    );

    const durations = await page.evaluate(() => {
      const spine = document.querySelector('[data-book-slug]') as HTMLElement;
      const row = document.querySelector('.shelf-row') as HTMLElement;
      return {
        spineTransition: getComputedStyle(spine).transitionDuration,
        rowScroll: getComputedStyle(row).scrollBehavior,
      };
    });

    expect(durations.spineTransition).toBe('0s');
    expect(durations.rowScroll).toBe('auto');
  });

  test('책 본문의 부드러운 스크롤도 꺼진다', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await page.locator('[data-book-slug="hello"]').click();

    const behavior = await page
      .locator('dialog[open] .book__body')
      .evaluate((el) => getComputedStyle(el).scrollBehavior);
    expect(behavior).toBe('auto');
  });
});

test.describe('가로 스크롤 없음 (FR-017, SC-005)', () => {
  for (const width of [320, 375, 768, 1024, 1440, 1920]) {
    test(`${width}px 에서 페이지 가로 스크롤이 없다`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/');

      const overflows = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      );
      expect(overflows).toBe(false);
    });
  }

  test('책 창을 연 상태에서도 320px 에서 가로 스크롤이 없다', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto('/');
    await page.locator('[data-book-slug="hello"]').click();

    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(overflows).toBe(false);
  });
});
