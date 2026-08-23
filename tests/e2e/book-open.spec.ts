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

  /**
   * 닫은 책이 저절로 다시 열리던 회귀.
   *
   * 원인은 우리가 `history.state` 에 `{bookSlug}` 를 담고 popstate 에서 그걸 읽어 책을
   * 열었던 것이다. 그 저장소는 **Next 앱 라우터의 것**이라, 라우터가 제 내부 상태
   * (`__PRIVATE_NEXTJS_INTERNALS_TREE`)로 replaceState 를 돌리며 우리 값을 덮어쓴다.
   * 지워진 뒤에 popstate 가 오면 정상이지만, 아직 남아 있을 때 오면 그 책이 다시 열렸다.
   * 낡은 슬러그가 남아 있으면 **다른 책**이 열렸다.
   *
   * 그냥 열고 닫아서는 못 잡는다 — 라우터의 타이밍에 달려 있어 대개는 통과한다
   * (실제로 고치기 전 코드에서도 통과했다). 그래서 **그 상황을 손으로 만든다.**
   * 상태에 슬러그를 박고 popstate 를 던지는 것은 라우터가 늦게 덮어쓴 순간과 같다.
   *
   * 지금 코드는 history.state 를 아예 읽지 않으므로 무엇이 담겨 있든 열리지 않는다.
   */
  test('히스토리 상태에 슬러그가 남아 있어도 책이 다시 열리지 않는다 (회귀)', async ({ page }) => {
    await page.locator('[data-book-slug="hello"]').click();
    await expect(page.locator(dialog('hello'))).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.locator('dialog[open]')).toHaveCount(0);

    // 라우터가 아직 우리 표식을 지우지 않은 채 popstate 가 온 상황.
    await page.evaluate(() => {
      history.replaceState({ bookSlug: 'onebite' }, '');
      window.dispatchEvent(new PopStateEvent('popstate', { state: history.state }));
    });

    await page.waitForTimeout(400);
    await expect(page.locator('dialog[open]')).toHaveCount(0);
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
    await page
      .locator(`${dialog('hello')} .book__nav button`)
      .first()
      .click();

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

/**
 * 표지 없이 본문부터 나오던 회귀 — 모바일(한 면 모드).
 *
 * 두 면 모드의 표지는 왼쪽으로 눕고 그 안쪽이 곧 왼 면이 된다. 한 면 모드엔 눕힐
 * 왼쪽이 없어서 한동안 표지를 아예 만들지 않았다. 그래서 책이 뽑혀 나오자마자
 * 앞면이 본문이었다 — 책을 여는 게 아니라 종이 한 장이 날아오는 것처럼 보였다.
 * 지금은 페이지와 같은 축(위 모서리)으로 위로 젖혀 올린다.
 *
 * WebGL 이라 DOM 으로는 못 본다. 여는 동안 화면 가운데를 여러 번 찍어 밝기를 잰다.
 * 어두운 표지(경력)가 한 번이라도 가운데를 덮었는지, 그리고 끝에는 종이가 남았는지.
 * 시각을 하나 찍어 재면 연출 길이가 조금만 바뀌어도 깨지므로 구간 전체를 본다.
 *
 * **넓게** 재야 한다. 좁은 사각은 뽑혀 나오는 동안의 어두운 **책등**을 표지로 착각한다
 * (그래서 첫 판은 고치기 전 코드에서도 통과했다). 책 면만 한 사각이면 책등은 가는
 * 막대라 평균이 밝게 남고, 면을 덮은 표지만 어둡게 잡힌다 — 고치기 전 161, 지금 55.
 */
test.describe('표지가 열리며 책이 펼쳐진다 (회귀)', () => {
  // 두 면 모드엔 표지가 늘 있었다. 이 회귀는 한 면 모드의 것이다.
  test.beforeEach(({ viewport }) => {
    test.skip((viewport?.width ?? 0) >= 900, '한 면 모드(모바일)에서만 났던 회귀');
  });

  test('여는 동안 표지가 보이고, 끝나면 종이가 남는다', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('html[data-book-ready]');

    // 화면 가운데, 펼친 책 면쯤 되는 사각의 평균 밝기. 캔버스는 preserveDrawingBuffer 가
    // 없어 toDataURL 로는 못 읽는다 — 스크린숏을 다시 페이지 안으로 들여보내 잰다.
    const middle = async () => {
      const size = await page.evaluate(() => ({ w: innerWidth, h: innerHeight }));
      const w = Math.round(size.w * 0.55);
      const h = Math.round(size.h * 0.45);
      const shot = await page.screenshot({
        clip: {
          x: Math.round((size.w - w) / 2),
          y: Math.round((size.h - h) / 2),
          width: w,
          height: h,
        },
      });
      return page.evaluate(async (b64) => {
        const blob = await (await fetch(`data:image/png;base64,${b64}`)).blob();
        const bmp = await createImageBitmap(blob);
        const c = document.createElement('canvas');
        c.width = bmp.width;
        c.height = bmp.height;
        const g = c.getContext('2d')!;
        g.drawImage(bmp, 0, 0);
        const { data } = g.getImageData(0, 0, c.width, c.height);
        let sum = 0;
        for (let i = 0; i < data.length; i += 4) sum += (data[i] + data[i + 1] + data[i + 2]) / 3;
        return sum / (data.length / 4);
      }, shot.toString('base64'));
    };

    await page.locator('[data-book-slug="career"]').click();
    const frames: number[] = [];
    for (let i = 0; i < 16; i += 1) frames.push(await middle());
    await expect(page.locator(dialog('career'))).toBeVisible();

    // 경력 표지는 짙은 갈색, 종이는 밝은 미색이라 사이가 넉넉하다.
    expect(Math.min(...frames), '어두운 표지가 한 번도 책 면을 덮지 않았다').toBeLessThan(120);

    await page.waitForTimeout(600); // 연출이 끝나기를 기다린다
    expect(await middle(), '다 열렸는데 종이가 아니다').toBeGreaterThan(150);
  });
});
