import { test, expect } from '@playwright/test';

/**
 * 배경 장면의 만질 수 있는 요소들 — 창(해 뜨고 짐)과 화분(잎·꽃).
 * 장식이지만 접근 가능한 버튼이라 클릭·키보드로 동작해야 한다.
 */

const sky = (page: import('@playwright/test').Page) =>
  page.locator('html').getAttribute('data-sky');

// 창·화분은 좁은 화면에서 방을 답답하지 않게 가장자리로 밀린다(창은 반쯤 화면 밖,
// 화분은 왼쪽 책장 뒤). 그래서 모바일에선 조작이 어렵다 — 같은 코드라 데스크톱에서
// 검증한다.
test.beforeEach(({ viewport }) => {
  test.skip((viewport?.width ?? 9999) < 900, '장면 상호작용은 데스크톱에서 검증');
});

test.describe('창 — 해가 떴다 진다', () => {
  test('누르면 해가 뜨고, 다시 누르면 진다', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('html[data-book-ready]');
    const win = page.locator('[data-action="toggle-sky"]');
    await expect(win).toHaveAttribute('aria-label', '해 띄우기');

    await win.click();
    expect(await sky(page)).toBe('day');
    await expect(win).toHaveAttribute('aria-label', '해 지우기');
    await expect(page.locator('.scene__sun')).toBeVisible();

    await win.click();
    expect(await sky(page)).toBe('night');
    await expect(win).toHaveAttribute('aria-label', '해 띄우기');
  });

  test('키보드로도 동작한다 (Enter)', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('html[data-book-ready]');
    await page.locator('[data-action="toggle-sky"]').focus();
    await page.keyboard.press('Enter');
    expect(await sky(page)).toBe('day');
  });
});

test.describe('화분 — 잎이 떨어지고 꽃이 핀다', () => {
  test('두 번 누르면 잎 두 장이 떨어지고, 세 번째에 꽃이 핀다', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('html[data-book-ready]');
    const plant = page.locator('[data-action="plant"]');

    await expect(page.locator('.leaf--fallen')).toHaveCount(0);
    await expect(page.locator('.scene__plant.is-bloomed')).toHaveCount(0);

    await plant.click();
    await expect(page.locator('.leaf--fallen')).toHaveCount(1);

    await plant.click();
    await expect(page.locator('.leaf--fallen')).toHaveCount(2);

    await plant.click();
    await expect(page.locator('.scene__plant.is-bloomed')).toHaveCount(1);

    // 한 번 더 누르면 처음으로 돌아간다
    await plant.click();
    await expect(page.locator('.leaf--fallen')).toHaveCount(0);
    await expect(page.locator('.scene__plant.is-bloomed')).toHaveCount(0);
  });
});

test.describe('책장·책 클릭은 그대로 동작한다', () => {
  test('장면 버튼을 넣어도 책이 열린다', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('html[data-book-ready]');
    await page.locator('[data-book-slug="hello"]').click();
    await expect(page.locator('#book-dialog-hello')).toBeVisible();
  });
});
