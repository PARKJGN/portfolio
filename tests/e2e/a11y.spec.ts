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
    .map(
      (v) => `[${v.impact}] ${v.id}: ${v.help}\n    ${v.nodes.map((n) => n.target).join('\n    ')}`,
    )
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

  test('없는 주소', async ({ page }) => {
    await page.goto('/이런-책은-없다');
    const { violations } = await scan(page).analyze();
    expect(report(violations)).toBe('');
  });

  test('책 창이 열린 상태', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('html[data-book-ready]');
    await page.locator('[data-book-slug="hello"]').click();
    await settleOpen(page);

    const { violations } = await scan(page).analyze();
    expect(report(violations)).toBe('');
  });

  test('전체 이어보기 모드', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('html[data-book-ready]');
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
    await page.waitForSelector('html[data-book-ready]');
    await page.locator('[data-book-slug="hello"]').click();
    await settleOpen(page);

    const { violations } = await scan(page).analyze();
    expect(report(violations)).toBe('');
  });
});

/**
 * 방명록 화면 (T055).
 *
 * 다른 책과 달리 여기에는 입력칸과 버튼이 있다 — 라벨, 초점 표시, 대비, 상태 알림이
 * 실제로 걸려 있는지 기계가 매번 본다. API 가 떠 있지 않아도 폼은 그려지므로 도커 없이도
 * 돈다. 목록이 있는 상태는 아래 별도 항목에서 본다.
 */
test.describe('접근성 — 방명록 (T055)', () => {
  test.use({ reducedMotion: 'reduce' });

  const GUESTBOOK = '[data-book-slug="about-guestbook"]';

  async function openGuestbook(page: import('@playwright/test').Page) {
    await page.goto('/');
    await page.waitForSelector('html[data-book-ready]');
    await page.locator(GUESTBOOK).click();
    await settleOpen(page);
    // 목록을 받아 오는 중이면 기다린다 — "불러오는 중" 상태만 검사하고 끝나지 않게.
    await expect(page.locator('.guestbook__empty', { hasText: '불러오는 중' })).toHaveCount(0);
  }

  test('방명록 창이 열린 상태', async ({ page }) => {
    await openGuestbook(page);
    const { violations } = await scan(page).analyze();
    expect(report(violations)).toBe('');
  });

  test('어두운 테마에서 방명록 창', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await openGuestbook(page);
    const { violations } = await scan(page).analyze();
    expect(report(violations)).toBe('');
  });

  test('숨은 칸이 보조기술에 잡히지 않는다', async ({ page }) => {
    await openGuestbook(page);

    // aria-hidden 안에 초점 갈 수 있는 요소가 있으면 axe 의 aria-hidden-focus 가 잡는다.
    // 위 검사에 이미 포함되지만, 이 칸은 봇 방어의 일부라 깨지면 바로 알아야 한다.
    const honey = page.locator('.guestbook__honey input');
    await expect(honey).toHaveAttribute('tabindex', '-1');
    await expect(page.locator('.guestbook__honey')).toHaveAttribute('aria-hidden', 'true');
    // 접근성 트리에 없다 — 낭독기 사용자에게는 없는 칸이다.
    // `getByLabel` 은 DOM 을 보므로 aria-hidden 을 무시한다. 역할로 찾아야 트리를 본다.
    await expect(page.getByRole('textbox', { name: '홈페이지' })).toHaveCount(0);
    // DOM 에는 있다 — 봇이 채워야 걸리는 함정이므로 사라지면 안 된다.
    await expect(honey).toHaveCount(1);
  });
});

/**
 * 보류함 (T055).
 *
 * 주인만 오는 화면이라도 접근성 기준은 같다 — 특히 "정말 지웁니다" 처럼 색으로 위험을
 * 알리는 자리는 색을 구별하지 못해도 알 수 있어야 한다.
 */
test.describe('접근성 — 보류함 (T055)', () => {
  test.use({ reducedMotion: 'reduce' });

  test('토큰 입력 화면', async ({ page }) => {
    await page.goto('/admin');
    await expect(page.getByLabel('관리 토큰')).toBeVisible();

    const { violations } = await scan(page).analyze();
    expect(report(violations)).toBe('');
  });

  test('어두운 테마에서 토큰 입력 화면', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/admin');
    await expect(page.getByLabel('관리 토큰')).toBeVisible();

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
    await page.waitForSelector('html[data-book-ready]');
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
    await page.waitForSelector('html[data-book-ready]');
    await page.locator('[data-book-slug="hello"]').click();

    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(overflows).toBe(false);
  });
});

/**
 * 종이에 그려진 링크의 손잡이 (3D 전용).
 *
 * 위의 검사들은 `reducedMotion: 'reduce'` 로 돈다 — 그러면 3D 가 아예 켜지지 않아
 * 이 손잡이가 만들어지지 않는다. 여기서만 움직임을 켜고 본다.
 *
 * 손잡이는 캔버스가 그린 글자 위에 얹히는 빈 `<a>` 다. 글자가 없으니 이름은
 * aria-label 이 대고, 그 이름이 없으면 낭독기에는 "링크" 라고만 들린다.
 */
test.describe('종이 위의 링크 (3D)', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', '3D 링크는 desktop 에서 본다');
  });

  async function openOneBite(page: import('@playwright/test').Page) {
    await page.goto('/');
    await page.waitForSelector('html[data-book-ready]');
    await page.locator('[data-book-slug="onebite"]').click();
    await expect(page.locator('dialog[open]')).toBeVisible();
    // 3D 가 다 펼쳐져야 손잡이가 자리를 잡는다.
    await page.locator('.book__link').first().waitFor({ timeout: 15000 });
  }

  test('손잡이에 이름이 있고 새 탭으로 연다', async ({ page }) => {
    await openOneBite(page);

    const link = page.locator('.book__link').first();
    await expect(link).toHaveAttribute('href', /onebite\.jgbak-land\.com/);
    await expect(link).toHaveAttribute('target', '_blank');
    // 연 쪽이 이 창을 건드리지 못하게 한다.
    await expect(link).toHaveAttribute('rel', /noopener/);
    // 이름이 없으면 낭독기에 "링크" 라고만 들린다.
    await expect(link).toHaveAttribute('aria-label', /onebite\.jgbak-land\.com/);
  });

  test('axe 위반이 없다', async ({ page }) => {
    await openOneBite(page);
    const { violations } = await scan(page).analyze();
    expect(report(violations)).toBe('');
  });
});
