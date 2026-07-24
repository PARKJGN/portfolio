import { test, expect } from '@playwright/test';

const dialog = (slug: string) => `#book-dialog-${slug}`;

test.describe('책 열기와 닫기', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('html[data-book-ready]');
  });

  test('책을 누르면 모달로 열리고 주소가 바뀐다 (FR-004, FR-012)', async ({ page }) => {
    await page.locator('[data-book-slug="hello"]').click();

    await expect(page.locator(dialog('hello'))).toBeVisible();
    await expect(page).toHaveURL(/\/books\/hello/);
    // 방은 그대로 남아 있다 — 페이지 이동이 아니라 가로채기다
    await expect(page.getByRole('heading', { name: '서재' })).toBeAttached();
  });

  test('Esc 로 닫힌다 (FR-005)', async ({ page }) => {
    await page.locator('[data-book-slug="hello"]').click();
    await expect(page.locator(dialog('hello'))).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.locator(dialog('hello'))).toBeHidden();
  });

  test('닫기 버튼으로 닫힌다 (FR-005)', async ({ page }) => {
    await page.locator('[data-book-slug="hello"]').click();
    await page.getByRole('button', { name: '덮기' }).click();
    await expect(page.locator(dialog('hello'))).toBeHidden();
  });

  test('바깥 영역을 누르면 닫힌다 (FR-005 — dialog 가 기본 제공하지 않는 항목)', async ({
    page,
  }) => {
    await page.locator('[data-book-slug="hello"]').click();
    const d = page.locator(dialog('hello'));
    await expect(d).toBeVisible();

    // ::backdrop 은 dialog 박스 *바깥*이므로 요소 내부 좌표로는 누를 수 없다.
    // 화면 좌상단을 누르면 backdrop 이고, 그 클릭의 target 은 dialog 요소가 된다.
    await page.mouse.click(20, 20);
    await expect(d).toBeHidden();
  });

  test('닫으면 직전에 열었던 책으로 초점이 돌아온다 (FR-006)', async ({ page }) => {
    const spine = page.locator('[data-book-slug="how-i-work"]');
    await spine.click();
    await page.keyboard.press('Escape');

    await expect(spine).toBeFocused();
  });

  test('닫으면 주소가 방으로 되돌아간다', async ({ page }) => {
    await page.locator('[data-book-slug="hello"]').click();
    await expect(page).toHaveURL(/\/books\/hello/);

    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(/\/$/);
  });

  test('모달이 열린 상태에서 뒤로 가기를 누르면 방으로 돌아온다 (엣지 케이스)', async ({
    page,
  }) => {
    await page.locator('[data-book-slug="hello"]').click();
    await expect(page.locator(dialog('hello'))).toBeVisible();

    await page.goBack();

    await expect(page.locator(dialog('hello'))).toBeHidden();
    await expect(page.getByRole('heading', { name: '서재' })).toBeVisible();
  });

  test('초점이 창 밖으로 새지 않는다 (FR-013)', async ({ page }) => {
    await page.locator('[data-book-slug="hello"]').click();
    await expect(page.locator(dialog('hello'))).toBeVisible();

    // 초점 순환은 dialog 안의 요소들과 <body> 사이를 돈다. body 를 거치는 것은
    // Chromium 의 모달 순환 방식이고 body 는 상호작용 요소가 아니다.
    // 실제로 지켜져야 할 것은 "창 뒤의 조작 가능한 요소에 도달하지 못한다"이다.
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab');
      const escaped = await page.evaluate(() => {
        const a = document.activeElement as HTMLElement | null;
        const open = document.querySelector('dialog[open]');
        if (!a || !open || open.contains(a)) return null;
        // 창 밖으로 나갔다면, 그것이 조작 가능한 요소인지 본다
        const interactive = a.matches('a[href], button, input, select, textarea, [tabindex]');
        return interactive ? `${a.tagName}.${a.className}` : null;
      });
      expect(escaped, `Tab ${i + 1}회 후 창 밖의 조작 가능한 요소로 초점이 나갔다`).toBeNull();
    }

    // 방의 책등에는 절대 도달할 수 없어야 한다
    const spineFocused = await page.evaluate(() =>
      Boolean(document.activeElement?.closest('[data-book-slug]')),
    );
    expect(spineFocused).toBe(false);
  });

  test('방명록 책장에 책 3권(A·B·C)이 있다', async ({ page }) => {
    const guestbook = page.locator('section.shelf', { hasText: '방명록' });
    await expect(guestbook.locator('[data-book-slug]')).toHaveCount(3);
    for (const slug of ['a', 'b', 'c']) {
      await expect(guestbook.locator(`[data-book-slug="${slug}"]`)).toBeVisible();
    }
  });
});
