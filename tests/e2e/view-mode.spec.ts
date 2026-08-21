import { test, expect, type Page } from '@playwright/test';

const mode = (page: Page) => page.locator('html').getAttribute('data-view-mode');
const body = (page: Page) => page.locator('dialog[open] .book__body');

async function openBook(page: Page, slug = 'hello') {
  await page.goto('/');
  await page.waitForSelector('html[data-book-ready]');
  await page.locator(`[data-book-slug="${slug}"]`).click();
  await expect(page.locator(`#book-dialog-${slug}`)).toBeVisible();
}

// 이 스위트는 HTML 읽기 모드(한 장씩/이어보기, 보기 전환 토글)를 검증한다. 그 모드는
// 3D 리더가 없는 경로(WebGL 불가·움직임 최소화)에서만 나타난다 — 3D 리더는 토글을
// 숨기고 종이를 opacity 0 으로 둔다. 움직임 최소화로 3D 를 끄고 결정적으로 검사한다.
test.describe('두 보기 방식', () => {
  test.use({ reducedMotion: 'reduce' });

  test('기본은 한 장씩 넘기기다', async ({ page }) => {
    await openBook(page);
    expect(await mode(page)).toBe('paged');
  });

  test('한 번의 조작으로 전환된다 (FR-008)', async ({ page }) => {
    await openBook(page);
    await page.getByRole('button', { name: '전체 이어보기' }).click();
    expect(await mode(page)).toBe('continuous');
  });

  test('전환하면 버튼 라벨과 눌림 상태가 바뀐다', async ({ page }) => {
    await openBook(page);
    const toggle = page.locator('dialog[open] [data-action="toggle-view"]');
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(toggle).toHaveText('한 장씩 넘기기');
  });

  test('한 장씩 모드에서는 본문이 가로로 나뉜다', async ({ page }) => {
    // 넓은 화면에선 이 책이 한 장에 다 들어가므로, 여러 장으로 나뉘는 폭을 잡는다.
    await page.setViewportSize({ width: 640, height: 700 });
    await openBook(page);
    const metrics = await body(page).evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    }));
    // 내용이 한 화면보다 길므로 가로로 여러 장이 만들어져야 한다
    expect(metrics.scrollWidth).toBeGreaterThan(metrics.clientWidth);
  });

  test('전체 이어보기에서는 세로로 이어진다', async ({ page }) => {
    await openBook(page);
    await page.getByRole('button', { name: '전체 이어보기' }).click();

    const metrics = await body(page).evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    }));
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);
    expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight);
  });

  test('두 모드가 같은 내용을 담는다 (FR-011)', async ({ page }) => {
    await openBook(page);
    const paged = await body(page).innerText();

    await page.getByRole('button', { name: '전체 이어보기' }).click();
    const continuous = await body(page).innerText();

    expect(continuous).toBe(paged);
    expect(continuous).toContain('PostgreSQL');
  });

  test('선택이 다른 책에도 유지된다 (FR-009)', async ({ page }) => {
    await openBook(page);
    await page.getByRole('button', { name: '전체 이어보기' }).click();
    await page.keyboard.press('Escape');

    await page.locator('[data-book-slug="onebite"]').click();
    expect(await mode(page)).toBe('continuous');
  });

  test('선택이 새로고침 후에도 남는다', async ({ page }) => {
    await openBook(page);
    await page.getByRole('button', { name: '전체 이어보기' }).click();

    await page.goto('/');
    expect(await mode(page)).toBe('continuous');
  });

  test('장을 넘기면 위치 표시가 바뀐다 (FR-010)', async ({ page }) => {
    // 넓은 화면에서는 이 책이 한 장에 다 들어가 넘길 것이 없다.
    // 여러 장으로 나뉘는 폭을 잡아야 이동 자체를 검증할 수 있다.
    await page.setViewportSize({ width: 640, height: 700 });
    await openBook(page);

    const progress = page.locator('dialog[open] [data-progress]');
    await expect(progress).toHaveText(/^1 \/ [2-9]\d*$/);

    await page.locator('dialog[open] [data-action="page-next"]').click();
    await expect(progress).toHaveText(/^2 \/ \d+$/);
  });

  test('첫 장에서는 이전 버튼이, 마지막 장에서는 다음 버튼이 잠긴다', async ({ page }) => {
    // 여러 장으로 나뉘는 폭을 잡아야 앞뒤 이동 잠금을 검증할 수 있다.
    await page.setViewportSize({ width: 640, height: 700 });
    await openBook(page);
    const prev = page.locator('dialog[open] [data-action="page-prev"]');
    const next = page.locator('dialog[open] [data-action="page-next"]');

    await expect(prev).toBeDisabled();
    await expect(next).toBeEnabled();

    // 끝까지 이동한다. 버튼을 반복해서 누르면 부드러운 스크롤이 끝나는 시점과
    // 경쟁해서(누르려는 순간 버튼이 잠김) 불안정해진다. 여기서 검증하려는 것은
    // 애니메이션이 아니라 "끝에 도달했을 때의 버튼 상태"이므로 위치만 옮긴다.
    await body(page).evaluate((el) => el.scrollTo({ left: el.scrollWidth, behavior: 'instant' }));

    await expect(next).toBeDisabled();
    await expect(prev).toBeEnabled();
  });

  test('전체 이어보기에서는 장 이동 조작이 사라진다', async ({ page }) => {
    await openBook(page);
    await page.getByRole('button', { name: '전체 이어보기' }).click();
    await expect(page.locator('dialog[open] [data-action="page-next"]')).toBeHidden();
  });

  test('창 크기를 바꿔도 읽던 내용이 사라지지 않는다', async ({ page }) => {
    await openBook(page);
    await page.setViewportSize({ width: 700, height: 700 });
    await page.waitForTimeout(200);

    await expect(body(page)).toContainText('박종건');
    const { current, total } = await page
      .locator('dialog[open] [data-progress]')
      .innerText()
      .then((t) => {
        const [c, tt] = t.split('/').map((s) => Number(s.trim()));
        return { current: c, total: tt };
      });
    expect(current).toBeGreaterThanOrEqual(1);
    expect(current).toBeLessThanOrEqual(total);
  });
});

/**
 * 한번에 보기 — 3D 책에서 벗어나 세로로 죽 훑는다.
 *
 * 위의 '전체 이어보기' 와 다른 점은 **3D 를 걷어낸다**는 것이다. 그 아래 HTML 본문은
 * 낭독기용으로 늘 거기 있었으므로 새로 그릴 것이 없다(book.css 가 data-reader 일
 * 때만 감춘다).
 *
 * 움직임 최소화에서는 3D 가 아예 안 켜져 이 버튼이 나오지 않는다 — 그때는 위쪽
 * '전체 이어보기' 가 같은 일을 한다. 그래서 여기서는 움직임을 켠 채로 본다.
 */
test.describe('한번에 보기 (책 ↔ 스크롤)', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', '3D 는 desktop 에서 본다');
  });

  const openBook = async (page: import('@playwright/test').Page) => {
    await page.goto('/');
    await page.waitForSelector('html[data-book-ready]');
    await page.locator('[data-book-slug="career"]').click();
    // 3D 가 다 펼쳐져야 리더로 승격된다.
    await expect(page.locator('#book-dialog-career[data-reader]')).toBeAttached({
      timeout: 15000,
    });
  };

  test('누르면 3D 가 걷히고 본문이 세로로 이어진다', async ({ page }) => {
    await openBook(page);
    const dialog = page.locator('#book-dialog-career');

    await page.getByRole('button', { name: '한번에 보기' }).click();

    await expect(dialog).toHaveAttribute('data-scroll', '');
    await expect(dialog).not.toHaveAttribute('data-reader', /.*/);
    // 본문이 다시 보인다 — 3D 아래 감춰져 있던 그 HTML 이다.
    await expect(dialog.locator('.book__body')).toBeVisible();
    // 세로로 이어진다: 넘길 단이 없으므로 가로 스크롤이 생기지 않는다.
    const body = dialog.locator('.book__body');
    const overflowsX = await body.evaluate((el) => el.scrollWidth > el.clientWidth + 2);
    expect(overflowsX).toBe(false);
  });

  test('다시 누르면 책으로 돌아온다', async ({ page }) => {
    await openBook(page);
    const dialog = page.locator('#book-dialog-career');

    await page.getByRole('button', { name: '한번에 보기' }).click();
    await expect(dialog).toHaveAttribute('data-scroll', '');

    await page.getByRole('button', { name: '책으로 보기' }).click();
    await expect(dialog).toHaveAttribute('data-reader', '', { timeout: 15000 });
    await expect(dialog).not.toHaveAttribute('data-scroll', /.*/);
  });

  test('닫았다 다시 열면 책으로 열린다', async ({ page }) => {
    await openBook(page);
    await page.getByRole('button', { name: '한번에 보기' }).click();
    await expect(page.locator('#book-dialog-career')).toHaveAttribute('data-scroll', '');

    await page.keyboard.press('Escape');
    await expect(page.locator('dialog[open]')).toHaveCount(0);

    await page.locator('[data-book-slug="career"]').click();
    await expect(page.locator('#book-dialog-career[data-reader]')).toBeAttached({
      timeout: 15000,
    });
    await expect(page.locator('#book-dialog-career')).not.toHaveAttribute('data-scroll', /.*/);
  });
});
