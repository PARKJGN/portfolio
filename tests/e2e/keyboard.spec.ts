import { test, expect, type Page } from '@playwright/test';

/** 초점이 놓인 요소를 사람이 읽을 수 있는 형태로 */
const focused = (page: Page) =>
  page.evaluate(() => {
    const a = document.activeElement as HTMLElement | null;
    if (!a) return 'none';
    const slug = a.closest<HTMLElement>('[data-book-slug]')?.dataset.bookSlug;
    if (slug) return `spine:${slug}`;
    if (a.dataset.shelfLink) return `shelfLink:${a.dataset.shelfLink}`;
    if (a.dataset.action) return `action:${a.dataset.action}`;
    return `${a.tagName.toLowerCase()}${a.className ? '.' + a.className.split(' ')[0] : ''}`;
  });

/** Tab 을 눌러가며 조건을 만족하는 요소에 도달할 때까지 (최대 n회) */
async function tabUntil(page: Page, predicate: (f: string) => boolean, max = 25) {
  const seen: string[] = [];
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab');
    const f = await focused(page);
    seen.push(f);
    if (predicate(f)) return { ok: true, seen };
  }
  return { ok: false, seen };
}

test.describe('마우스 없이 (US3)', () => {
  test('방에서 Tab 만으로 모든 책등에 도달한다 (FR-019)', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('html[data-book-ready]');

    const reached = new Set<string>();
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('Tab');
      const f = await focused(page);
      if (f.startsWith('spine:')) reached.add(f.slice(6));
    }

    expect([...reached].sort()).toEqual([
      'a',
      'b',
      'c',
      'hello',
      'how-i-work',
      'sample-project',
    ]);
  });

  test('초점이 간 책등에는 보이는 표시가 있다', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('html[data-book-ready]');
    const r = await tabUntil(page, (f) => f.startsWith('spine:'));
    expect(r.ok, `초점 경로: ${r.seen.join(' → ')}`).toBe(true);

    const outline = await page.evaluate(() => {
      const a = document.activeElement as HTMLElement;
      const s = getComputedStyle(a);
      return { width: s.outlineWidth, style: s.outlineStyle };
    });
    expect(outline.style).not.toBe('none');
    expect(parseFloat(outline.width)).toBeGreaterThan(0);
  });

  test('Enter 로 책을 열고 Esc 로 닫는 전체 경로 (US3 독립 검증)', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('html[data-book-ready]');

    const r = await tabUntil(page, (f) => f === 'spine:hello');
    expect(r.ok, `초점 경로: ${r.seen.join(' → ')}`).toBe(true);

    await page.keyboard.press('Enter');
    await expect(page.locator('#book-dialog-hello')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.locator('#book-dialog-hello')).toBeHidden();
    expect(await focused(page)).toBe('spine:hello');
  });

  test('책 창 안에서 Tab 으로 조작부에 도달한다', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('html[data-book-ready]');
    await page.locator('[data-book-slug="hello"]').click();

    const r = await tabUntil(page, (f) => f === 'action:toggle-view', 12);
    expect(r.ok, `초점 경로: ${r.seen.join(' → ')}`).toBe(true);
  });
});

test.describe('좁은 화면에서 키보드로 책장 이동 (FR-019)', () => {
  test.use({ viewport: { width: 320, height: 640 } });

  test('바로가기 링크로 세 책장 모두에 도달한다', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('html[data-book-ready]');

    const links = page.locator('[data-shelf-link]');
    await expect(links).toHaveCount(3);
    // 좁은 화면에서만 보이는 이동 수단이다
    await expect(links.first()).toBeVisible();

    // 넘기기 동작 없이 키보드만으로 마지막 책장에 도달한다
    const r = await tabUntil(page, (f) => f === 'shelfLink:guestbook', 10);
    expect(r.ok, `초점 경로: ${r.seen.join(' → ')}`).toBe(true);

    await page.keyboard.press('Enter');
    await page.waitForTimeout(400);

    const visible = await page
      .locator('[data-shelf-slug="guestbook"]')
      .evaluate((el) => {
        const r = el.getBoundingClientRect();
        return r.left >= -5 && r.right <= window.innerWidth + 5;
      });
    expect(visible).toBe(true);
  });

  test('넓은 화면에서는 바로가기가 필요 없어 감춰진다', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await page.waitForSelector('html[data-book-ready]');
    await expect(page.locator('.shelf-nav')).toBeHidden();
  });
});
