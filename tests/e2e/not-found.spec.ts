import { test, expect } from '@playwright/test';

/**
 * 없는 주소로 들어왔을 때.
 *
 * 오래 Next 기본 화면이 나왔다 — 흰 바탕에 영어로 "404 | This page could not be
 * found." 방과 아무 상관 없는 화면이라 주소를 잘못 친 사람은 사이트가 깨진 줄 안다.
 *
 * **메인으로 돌려보내지 않는다.** 편하기는 하지만 두 가지를 잃는다 — 검색엔진이
 * 없는 문서를 있는 것으로 색인하고(soft 404), 어떤 링크가 깨졌는지 우리가 알 수
 * 없게 된다. 그걸 보려고 대시보드에 「404 가 난 주소」 패널을 뒀다.
 */
test.describe('없는 주소', () => {
  const MISSING = '/이런-책은-없다';

  test('방 모양의 안내가 나오고 서재로 돌아갈 수 있다', async ({ page }) => {
    await page.goto(MISSING);

    await expect(page.getByRole('heading', { name: '그 책은 여기 없습니다' })).toBeVisible();

    const home = page.getByRole('link', { name: '서재로 돌아가기' });
    await expect(home).toBeVisible();
    await home.click();
    await expect(page.getByRole('heading', { name: '서재' })).toBeVisible();
  });

  test('상태 코드는 404 다', async ({ page }) => {
    const res = await page.goto(MISSING);
    expect(res?.status(), '메인으로 돌려보내거나 200 을 주면 안 된다').toBe(404);
  });

  test('영어 기본 화면이 아니다 (회귀)', async ({ page }) => {
    await page.goto(MISSING);
    await expect(page.locator('body')).not.toContainText('This page could not be found');
  });
});
