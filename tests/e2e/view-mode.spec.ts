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

    // **속성만 보면 안 된다.** 예전에 이 검사가 통과하는데도 화면은 깨져 있었다 —
    // data-open3d 를 떼면서 CSS 표지와 등장 애니메이션이 처음부터 다시 재생돼,
    // 표지가 책을 덮고 본문은 책등만 하게 쪼그라들었다. 그러니 실제로 읽을 만한
    // 크기인지, 표지가 덮고 있지 않은지를 본다.
    await expect(dialog.locator('.book__cover')).toBeHidden();
    const bodyH = await dialog.locator('.book__body').evaluate((el) => el.clientHeight);
    expect(bodyH, '본문이 읽을 수 없을 만큼 작다').toBeGreaterThan(200);
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

  /**
   * 닫힘 연출의 자국이 다음 열림에 묻어 나오던 회귀.
   *
   * 닫는 길과 여는 길은 원래 짝이 맞았다 — 3D 로 열었으면 3D 로 닫고, 평면이면
   * 평면으로. 닫힘 FLIP 이 fill:forwards 로 남긴 축소·반투명은 평면 열기 함수가
   * 지웠다. '한번에 보기' 가 그 짝을 깼다: 3D 를 걷어낸 뒤 닫으면 **평면 닫힘**이
   * 자국을 남기는데, 다시 열 때는 **3D 경로**라 아무도 지우지 않는다.
   *
   * 그래서 책이 나오는 내내 그 화면이 48% 크기에 투명도 0.2 로 떠 있었다.
   * 속성만 보는 검사로는 안 잡힌다 — 계산된 transform 과 opacity 를 본다.
   */
  test('한번에 보기로 보다 덮은 뒤 다시 열면 자국이 남지 않는다 (회귀)', async ({ page }) => {
    await openBook(page);
    await page.getByRole('button', { name: '한번에 보기' }).click();
    await expect(page.locator('#book-dialog-career')).toHaveAttribute('data-scroll', '');

    await page.getByRole('button', { name: '덮기' }).click();
    await expect(page.locator('dialog[open]')).toHaveCount(0, { timeout: 10000 });

    await page.locator('[data-book-slug="career"]').click();
    // **나오는 도중**에 본다 — 자국은 여기서 보였다.
    await page.waitForTimeout(250);
    const st = await page.locator('#book-dialog-career .book-stage').evaluate((el) => {
      const cs = getComputedStyle(el);
      return { transform: cs.transform, opacity: cs.opacity };
    });
    expect(st.transform, '닫힘 연출의 축소가 남아 있다').toBe('none');
    // 등장 중이면 0, 끝났으면 1. 어중간한 값은 남은 자국이다.
    expect(['0', '1']).toContain(st.opacity);
  });

  /**
   * '한번에 보기' 는 저장하지 않고 이어보기로 바꾼다 — 그건 이번 한 번의 편의지
   * 취향이 아니기 때문이다. 그런데 그대로 닫으면 data-view-mode 에 continuous 가
   * 남았고, [data-view-mode='continuous'] 가 장 이동 조작을 통째로 감춰 **다음에 연
   * 책에서 페이지네이션이 사라졌다.**
   */
  test('한번에 보기로 보다 덮어도 다음 책의 장 이동 조작이 남는다 (회귀)', async ({ page }) => {
    await openBook(page);
    await page.getByRole('button', { name: '한번에 보기' }).click();
    await expect(page.locator('#book-dialog-career')).toHaveAttribute('data-scroll', '');

    await page.getByRole('button', { name: '덮기' }).click();
    await expect(page.locator('dialog[open]')).toHaveCount(0, { timeout: 10000 });

    await page.locator('[data-book-slug="career"]').click();
    await expect(page.locator('#book-dialog-career[data-reader]')).toBeAttached({
      timeout: 15000,
    });
    await expect(page.locator('#book-dialog-career .book__paging')).toBeVisible();
  });

  /**
   * 방명록 책은 종이(.book__pages)가 비어 있고 목록은 그 밖에 있다. 그래서 3D 를
   * 걷어내면 목록이 종이 없이 하드커버 보드 위에 얹혀, 어두운 바탕에 짙은 갈색
   * 글씨가 되어 읽을 수 없었다.
   */
  test('방명록도 스크롤에서 종이 위에 얹힌다 (회귀)', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('html[data-book-ready]');
    await page.locator('[data-book-slug="about-guestbook"]').click();
    await expect(page.locator('#book-dialog-about-guestbook[data-reader]')).toBeAttached({
      timeout: 15000,
    });
    await page.getByRole('button', { name: '한번에 보기' }).click();
    await expect(page.locator('#book-dialog-about-guestbook')).toHaveAttribute('data-scroll', '');

    const bg = await page
      .locator('#book-dialog-about-guestbook .guestbook')
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg, '방명록 자리에 종이가 없다 — 보드 위에 글이 그대로 얹힌다').not.toBe(
      'rgba(0, 0, 0, 0)',
    );
  });

  /**
   * 넓은 폭에서 제품 로고가 어두운 판만 남고 사라지던 회귀.
   *
   * 흰 로고에 깔아 주는 판의 여백이  였다. **백분율 여백은 담는
   * 상자의 폭**을 기준으로 잡히지 자기 크기가 아니다 — '한번에 보기' 는 담는 상자가
   * 1148px 이라 한 쪽 여백이 115px 이 됐고, box-sizing:border-box 라 96px 상자에
   * 이미지가 들어갈 자리가 0 이 됐다.
   *
   * 그래서 상자 크기가 아니라 **안쪽에 남는 자리**를 잰다. 크기만 보면 통과한다.
   */
  test('넓은 폭에서도 제품 로고가 그려질 자리가 남는다 (회귀)', async ({ page }) => {
    await openBook(page);
    await page.getByRole('button', { name: '한번에 보기' }).click();
    await expect(page.locator('#book-dialog-career')).toHaveAttribute('data-scroll', '');

    const logos = await page.locator('#book-dialog-career img.product__logo').all();
    expect(logos.length, '경력 책에 제품 로고가 없다').toBeGreaterThan(0);
    for (const logo of logos) {
      const inner = await logo.evaluate((el) => {
        const cs = getComputedStyle(el);
        const w = el.getBoundingClientRect().width;
        return w - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      });
      expect(inner, '여백이 상자를 다 먹어 로고가 그려질 자리가 없다').toBeGreaterThan(40);
    }
  });
});

/**
 * 좁은 화면에서 책을 누르는 축.
 *
 * 한 면 모드에서 장은 위 모서리를 축으로 **위로** 젖혀지고 스와이프도 위/아래인데,
 * 누르기만 좌/우 반쪽이었다. 화면 왼쪽을 눌렀는데 장이 위로 넘어가니 어디를 눌러야
 * 앞으로 가는지 몸에 남지 않았다. 이제 위=이전, 아래=다음이다.
 *
 * 가로 위치를 일부러 반대쪽에 둔다 — 왼쪽 아래를 눌러도 **다음**으로 가야 세로축이
 * 실제로 판정에 쓰인다는 뜻이다. 예전 규칙이면 왼쪽이라 이전으로 읽혀 첫 장에 멈춘다.
 */
test.describe('좁은 화면에서는 위·아래로 넘긴다 (회귀)', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 9999) >= 900, '한 면 모드에서만');

  test('아래를 누르면 다음 장, 위를 누르면 이전 장', async ({ page }) => {
    await openBook(page);
    // 3D 가 다 펼칠 때까지 기다린다 — data-intro 는 그때 떨어진다. 펼치는 도중에는
    // 아직 평면 쪽 장 수가 보여, 위치 표시만 보고 기다리면 너무 일찍 누르게 된다.
    await page.waitForSelector('dialog[open]:not([data-intro])');
    const progress = page.locator('dialog[open] [data-progress]');
    await expect(progress).toHaveText(/^1 \/ [2-9]\d*$/);

    // 책이 차지한 세로 구간 — 위는 창 꼭대기, 아래는 도구막대 바로 위.
    const box = await page.evaluate(() => ({
      w: innerWidth,
      tools: document.querySelector('dialog[open] .book__tools')!.getBoundingClientRect().top,
    }));

    await page.mouse.click(box.w * 0.3, box.tools * 0.75); // 왼쪽 **아래**
    await expect(progress).toHaveText(/^2 \/ \d+$/);

    await page.mouse.click(box.w * 0.7, box.tools * 0.25); // 오른쪽 **위**
    await expect(progress).toHaveText(/^1 \/ \d+$/);
  });
});

/**
 * 한 면 보기에서 표지는 **첫 장 앞의 한 자리**다.
 *
 * 첫 장에서 뒤로 가면 표지가 도로 덮이고, 거기서 앞으로 가면 다시 열린다. 표지를
 * 보고 싶은데 책을 덮었다 다시 여는 수밖에 없던 것이 답답했다.
 *
 * 두 면 보기엔 이 자리가 없다 — 거기서 표지는 왼쪽에 눕는 순간 곧 왼 면이라, 덮으면
 * 책이 한쪽으로 치우친 채 닫힌 책이 된다. 그래서 첫 장에서 '이전' 은 잠긴 채다.
 */
test.describe('한 면 보기에서 첫 장 앞은 표지다', () => {
  const open = async (page: Page) => {
    await openBook(page, 'career');
    await page.waitForSelector('dialog[open]:not([data-intro])');
  };
  const progress = (page: Page) => page.locator('dialog[open] [data-progress]');
  const prev = (page: Page) => page.locator('dialog[open] [data-action="page-prev"]');
  const next = (page: Page) => page.locator('dialog[open] [data-action="page-next"]');

  test('첫 장에서 이전으로 가면 표지, 다시 다음으로 가면 첫 장', async ({ page, viewport }) => {
    test.skip((viewport?.width ?? 9999) >= 900, '한 면 보기에서만 있는 자리');
    await open(page);
    await expect(progress(page)).toHaveText(/^1 \/ \d+$/);
    await expect(prev(page)).toBeEnabled();

    await prev(page).click();
    await expect(progress(page)).toHaveText('표지');
    // 표지보다 앞은 없고, 앞으로는 갈 수 있다.
    await expect(prev(page)).toBeDisabled();
    await expect(next(page)).toBeEnabled();
    // 종이 위에 얹히는 것들은 표지 위에 떠 있으면 안 된다.
    await expect(page.locator('dialog[open] .book__link')).toHaveCount(0);

    await next(page).click();
    await expect(progress(page)).toHaveText(/^1 \/ \d+$/);
  });

  test('책 위쪽을 눌러도 표지로 간다', async ({ page, viewport }) => {
    test.skip((viewport?.width ?? 9999) >= 900, '한 면 보기에서만 있는 자리');
    await open(page);
    await expect(progress(page)).toHaveText(/^1 \/ \d+$/);

    const box = await page.evaluate(() => ({
      w: innerWidth,
      tools: document.querySelector('dialog[open] .book__tools')!.getBoundingClientRect().top,
    }));
    await page.mouse.click(box.w * 0.5, box.tools * 0.25);
    await expect(progress(page)).toHaveText('표지');
  });

  test('두 면 보기에서는 첫 장 앞이 없다', async ({ page, viewport }) => {
    test.skip((viewport?.width ?? 0) < 900, '두 면 보기에서만');
    await open(page);
    await expect(progress(page)).toHaveText(/^1 \/ \d+$/);
    await expect(prev(page)).toBeDisabled();
  });
});
