import { test, expect } from '@playwright/test';

const dialog = (slug: string) => `#book-dialog-${slug}`;

test.describe('책 열기와 닫기', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('html[data-book-ready]');
  });

  test('책을 누르면 모달로 열린다 (FR-004)', async ({ page }) => {
    await page.locator('[data-book-slug="hello"]').click();

    await expect(page.locator(dialog('hello'))).toBeVisible();
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
    const spine = page.locator('[data-book-slug="career"]');
    await spine.click();
    await page.keyboard.press('Escape');

    await expect(spine).toBeFocused();
  });

  test('열린 책에서 다른 책 버튼을 누르면 그 책으로 갈아탄다', async ({ page }) => {
    await page.locator('[data-book-slug="hello"]').click();
    await expect(page.locator(dialog('hello'))).toBeVisible();

    // 프로필 책장의 '박종건'과 '경력'은 서로 이웃이라 '다른 책' 버튼이 뜬다.
    await page.locator(`${dialog('hello')} .book__nav button`).first().click();

    // 원래 책은 닫히고 다른 책이 열린다.
    await expect(page.locator(dialog('hello'))).toBeHidden();
    await expect(page.locator('dialog[open]')).toBeVisible();
  });

  test('등장 애니메이션 도중에 닫아도 3D 책이 화면에 남지 않는다 (회귀)', async ({ page }) => {
    await page.locator('[data-book-slug="hello"]').click();
    await page.waitForTimeout(300); // 등장(펼침) 도중 — activeReader 가 아직 없는 시점
    await page.keyboard.press('Escape');

    // 등장 트윈이 끝났을 시간까지 지나도 창은 닫혀 있고 3D 캔버스는 걷혀 있어야 한다.
    // (예전엔 등장이 뒤늦게 끝나며 캔버스에 책만 남아 조작이 불가능했다.)
    await expect(page.locator(dialog('hello'))).toBeHidden();
    const canvas = page.locator('canvas[aria-hidden="true"]');
    if (await canvas.count()) await expect(canvas).toHaveCSS('opacity', '0');

    // 다시 열면 정상: 덮기 버튼이 다시 보인다.
    await page.locator('[data-book-slug="hello"]').click();
    await expect(page.getByRole('button', { name: '덮기' })).toBeVisible();
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

  test('세 책장에 각각 제 책이 꽂혀 있다', async ({ page }) => {
    const shelf = (name: string) => page.locator('section.shelf', { hasText: name });

    // 프로필 2권 · 프로젝트 4권 · 방명록은 아직 안내문 1권.
    await expect(shelf('프로필').locator('[data-book-slug]')).toHaveCount(2);
    await expect(shelf('프로젝트').locator('[data-book-slug]')).toHaveCount(4);
    await expect(shelf('방명록').locator('[data-book-slug]')).toHaveCount(1);

    for (const slug of ['hello', 'career', 'onebite', 'about-guestbook']) {
      await expect(page.locator(`[data-book-slug="${slug}"]`)).toBeVisible();
    }
  });
});
