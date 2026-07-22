import { test, expect } from '@playwright/test';

/**
 * 헌장 원칙 I — JS 가 실패해도 핵심 콘텐츠는 읽혀야 한다.
 *
 * 이 파일은 playwright.config.ts 의 'no-js' 프로젝트에서만 돈다
 * (javaScriptEnabled: false). 개발 서버가 아니라 실제 정적 산출물을 띄워 검사한다.
 */
test.describe('JavaScript 없이', () => {
  test('방에서 책장 셋과 책들이 보인다', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: '프로필' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '프로젝트' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '방명록' })).toBeVisible();

    await expect(page.locator('[data-book-slug]')).toHaveCount(3);
  });

  test('책을 누르면 모달이 아니라 책 페이지로 이동해 내용이 읽힌다', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-book-slug="hello"]').click();

    await expect(page).toHaveURL(/\/books\/hello/);
    await expect(page.getByRole('heading', { name: '안녕하세요', level: 1 })).toBeVisible();
    await expect(page.getByText('첫 장')).toBeVisible();
  });

  test('공유받은 주소로 바로 들어가도 읽힌다 (FR-012)', async ({ page }) => {
    await page.goto('/books/how-i-work');
    await expect(page.getByRole('heading', { name: '일하는 방식', level: 1 })).toBeVisible();
  });

  test('책 페이지에서 방으로 돌아갈 수 있다', async ({ page }) => {
    await page.goto('/books/hello');
    await page.getByRole('link', { name: '방으로 돌아가기' }).click();
    await expect(page.getByRole('heading', { name: '서재' })).toBeVisible();
  });

  test('모든 책에 도달할 수 있다', async ({ page }) => {
    for (const slug of ['hello', 'how-i-work', 'sample-project']) {
      await page.goto(`/books/${slug}`);
      await expect(page.locator('.book__body')).not.toBeEmpty();
    }
  });
});
