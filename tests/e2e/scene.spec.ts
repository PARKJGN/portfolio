import { test, expect } from '@playwright/test';

/**
 * 배경 장면의 만질 수 있는 요소들 — 창(해 뜨고 짐)과 화분(잎·꽃).
 * 장식이지만 접근 가능한 버튼이라 클릭·키보드로 동작해야 한다.
 */

const sky = (page: import('@playwright/test').Page) =>
  page.locator('html').getAttribute('data-sky');

// 창·화분은 좁은 화면에서 방을 답답하지 않게 가장자리로 밀린다(아주 좁으면 화분은
// 왼쪽 가장자리에 반쯤 걸친다). 그래서 모바일에선 조작이 어렵다 — 같은 코드라
// 데스크톱에서 검증한다.
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

    // 해가 지면 처음 상태로 돌아간다(밤 없음)
    await win.click();
    expect(await sky(page)).toBeNull();
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

/**
 * 화분이 책장을 파고들던 회귀.
 *
 * 화분은 화면 폭에 그대로 비례해 자랐다(left 7vw + width 10vw). 그런데 화분이 설
 * 자리 — 책장 왼쪽에 남는 폭 — 은 화면이 좁아질수록 훨씬 빠르게 줄어든다. 책장
 * 세 칸이 최소 폭을 지키느라 자리를 먼저 가져가기 때문이다. 그래서 1290px 아래부터
 * 화분 오른쪽이 첫 책장에 가려졌다(1100px 에서 46px, 900px 에서 69px).
 *
 * 한 폭만 재면 못 잡는다 — 1400px 는 고치기 전에도 통과했다. 겹치기 시작하는
 * 경계를 포함해 여러 폭에서 잰다.
 *
 * 화분은 줄어들지 않으므로 900~1030px 에서는 아예 설 자리가 없다(900px 에서 책장
 * 왼쪽에 남는 폭이 84px 뿐이다). 그 구간은 치운다 — 그러니 "보인다면 온전히 보이고
 * 겹치지도 않는다"를 잰다. 왼쪽으로 물려 반쯤 잘려 보이던 것도 여기서 걸린다.
 */
test.describe('화분과 책장이 겹치지 않는다 (회귀)', () => {
  for (const width of [
    1920, 1400, 1320, 1280, 1220, 1150, 1100, 1060, 1040, 1024, 1000, 940, 900,
  ]) {
    test(`${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 760 });
      await page.goto('/');
      await page.waitForSelector('html[data-book-ready]');

      const seen = await page.evaluate(() => {
        const el = document.querySelector('.scene__plant')!;
        if (!el.getClientRects().length) return null; // 치웠다
        const plant = el.getBoundingClientRect();
        const shelf = document.querySelector('section.shelf')!.getBoundingClientRect();
        return { left: plant.left, gap: shelf.left - plant.right };
      });

      if (seen === null) {
        // 치우는 것이 허용되는 구간인지까지 본다 — 넉넉한 폭에서 사라지면 그것도 버그다.
        expect(width, '자리가 넉넉한 폭인데 화분이 없다').toBeLessThanOrEqual(1030);
        return;
      }
      expect(seen.gap, '화분 오른쪽이 첫 책장에 닿는다').toBeGreaterThan(8);
      expect(seen.left, '화분 왼쪽이 화면 밖으로 잘렸다').toBeGreaterThanOrEqual(0);
    });
  }
});

/**
 * 화분은 방의 물건이지 화면의 장식이 아니다 — 창을 늘리면 같이 커지던 것이 어색했다.
 * 자리는 옮겨도, 자리가 없어 치우는 일은 있어도, 크기는 어느 폭에서나 같아야 한다.
 *
 * 겹침을 피하려고 폭을 줄이는 손쉬운 고침이 늘 손짓하는 자리라, 위 규칙과 짝으로 둔다.
 */
test('화면 폭이 달라져도 화분 크기는 그대로다', async ({ page }) => {
  const widths: number[] = [];
  for (const width of [1920, 1280, 1060, 899, 700, 480, 320]) {
    await page.setViewportSize({ width, height: 760 });
    await page.goto('/');
    await page.waitForSelector('html[data-book-ready]');
    widths.push(
      await page.evaluate(
        () => document.querySelector('.scene__plant')!.getBoundingClientRect().width,
      ),
    );
  }
  expect(new Set(widths.map(Math.round)).size, `화면마다 다르다: ${widths.join(' ')}`).toBe(1);
});
