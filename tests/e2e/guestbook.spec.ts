import { test, expect, type Page, request } from '@playwright/test';

/** `api/src/guard/bot.ts` 의 MIN_FILL_MS. 저쪽은 별도 프로젝트라 가져오지 않고 적는다. */
const MIN_FILL_MS = 3000;

/**
 * 방명록 E2E (T031 · T032 · T043).
 *
 * **이 파일만은 서버 셋이 떠 있어야 돈다** — PostgreSQL, 판정 대역, API. 없으면 통째로
 * 건너뛴다. 도커 없이 `npx playwright test` 를 도는 사람에게 방명록 때문에 빨간 줄이
 * 나오지 않게 하기 위해서다. 띄우는 방법은 `specs/003-guestbook/quickstart.md` 에 있다.
 *
 * 판정은 대역이 답한다(`api/tests/e2e-support/verdict-stub.mjs`). 진짜를 부르면 같은 글에
 * 다른 답이 올 수 있어 E2E 가 흔들린다.
 */

const API = process.env.NEXT_PUBLIC_GUESTBOOK_API ?? 'http://localhost:8080';
const SLUG = 'about-guestbook';
const dialog = `#book-dialog-${SLUG}`;

/**
 * 이 파일만 순서대로 돈다.
 *
 * 방명록은 서버 한 곳에 쌓이는 **공유 상태**다. 병렬로 돌리면 다른 테스트가 남긴 글이
 * 사이에 끼어 "맨 위에 있는가" 가 흔들리고, 시간당 한도도 서로 나눠 먹는다. 다른 파일은
 * 상태를 공유하지 않으므로 그대로 병렬이다.
 */
test.describe.configure({ mode: 'serial' });

let apiUp = false;
let skipWhy = '';

test.beforeAll(async ({ browser }) => {
  // ① API 자체가 떠 있는가.
  try {
    const ctx = await request.newContext();
    const res = await ctx.get(`${API}/api/health`, { timeout: 3000 });
    apiUp = res.ok();
    await ctx.dispose();
  } catch {
    apiUp = false;
  }
  if (!apiUp) {
    skipWhy = `방명록 API(${API}) 가 떠 있지 않다 — quickstart.md 참고`;
    return;
  }

  // ② **화면이** API 에 닿는가. ①만 보면 부족하다 — API 는 살아 있는데 페이지가 그것을
  //    못 부르는 상태가 실제로 있었다. 정적 export 라 API 주소가 빌드에 박히는데,
  //    3000 번에 다른 서버(`next dev` 등)가 떠 있으면 Playwright 가 그것을 그대로
  //    재사용해(reuseExistingServer) 주소가 안 박힌 화면을 검사하게 된다.
  //    그때 증상은 "목록이 안 뜬다" 라서 원인이 한참 뒤에야 보인다.
  //    화면이 쓰는 주소는 번들에 박혀 있어 밖에서 알 수 없다. 그래서 흉내내지 않고
  //    실제로 방명록을 열어 목록이 오는지 본다.
  const page = await browser.newPage({ baseURL: 'http://localhost:3000' });
  try {
    await page.goto('/');
    await page.waitForSelector('html[data-book-ready]');
    await page.locator(`[data-book-slug="${SLUG}"]`).click();
    const failed = page.locator('.guestbook__empty', { hasText: '닿을 수 없' });
    // 3D 에서는 목록이 낭독기용으로만 남아 화면에서 접힌다 — 있는지만 보므로 상관없다.
    // 목록이 오거나(list/empty) 실패 문구가 뜰 때까지 기다린다.
    await page
      .locator('.guestbook__list, .guestbook__empty')
      .first()
      .waitFor({ timeout: 8000 })
      .catch(() => undefined);
    if ((await failed.count()) > 0) {
      apiUp = false;
      skipWhy =
        '화면이 API 에 닿지 못한다. 빌드에 NEXT_PUBLIC_GUESTBOOK_API 가 박혔는지, ' +
        '3000 번에 다른 서버(next dev 등)가 떠 있어 재사용되고 있지 않은지 확인할 것.';
    }
  } finally {
    await page.close();
  }
});

/**
 * 방명록 책을 열고 **글을 쓸 수 있는 상태**가 될 때까지 기다린다.
 *
 * 3D 로 열리면 책이 다 펼쳐진 뒤에야 폼이 그 면 위에 얹힌다(.guestbook[data-on-page]).
 * 그 전에 누르면 아직 1px 로 접혀 있는 자리를 누르게 된다. WebGL 이 없는 환경에서는
 * 3D 가 아예 안 뜨므로 평면 폼을 기다린다 — 둘 중 먼저 오는 쪽을 잡는다.
 */
async function openGuestbook(page: Page): Promise<void> {
  await page.locator(`[data-book-slug="${SLUG}"]`).click();
  await expect(page.locator(dialog)).toBeVisible();
  await Promise.race([
    page.locator(`${dialog} .guestbook[data-on-page]`).waitFor({ timeout: 15000 }),
    page.locator(`${dialog}:not([data-reader]) .guestbook__submit`).waitFor({ timeout: 15000 }),
  ]);
}

test.beforeEach(async ({ page }) => {
  test.skip(!apiUp, skipWhy);
  await page.goto('/');
  await page.waitForSelector('html[data-book-ready]');
  await openGuestbook(page);
});

/**
 * 글을 남기는 검증은 desktop 한 곳에서만 한다.
 *
 * 방명록은 서버 한 곳에 쌓인다. 두 프로젝트가 같이 남기면 서로의 글이 목록에 끼어
 * "맨 위에 있는가" 가 어긋나고, 순간 폭주 막이도 나눠 먹는다.
 */
const writesOnlyOnDesktop = () =>
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', '쓰기 검증은 desktop 한 곳에서만 한다');
  });

/** 이번 실행에서만 쓰는 내용. 중복(409)에 걸리지 않게 매번 다르게 만든다. */
const unique = (prefix: string) => `${prefix} ${Date.now()}-${Math.random().toString(36).slice(2)}`;

/**
 * 목록이 다 그려질 때까지 기다린다.
 *
 * 책을 열면 목록은 그때부터 받아 온다. 기다리지 않고 세면 0 이 나오고, "없다" 를 확인하는
 * 테스트가 아직 안 온 것을 없는 것으로 착각한다.
 */
async function waitForList(page: Page): Promise<void> {
  await expect(page.locator('.guestbook__empty', { hasText: '불러오는 중' })).toHaveCount(0);
}

async function fill(page: Page, body: string): Promise<void> {
  await page.getByLabel('이름').fill('지나가던 개발자');
  await page.getByLabel('한마디').fill(body);
  // 서버는 3초 미만 제출을 봇으로 본다. 사람이 적는 속도를 흉내낸다.
  await page.waitForTimeout(MIN_FILL_MS + 300);
}

test.describe('US1 — 남기고 읽는다', () => {
  writesOnlyOnDesktop();

  test('남기면 목록 맨 위에 나타난다', async ({ page }) => {
    const body = unique('3D 책 재밌네요.');
    await fill(page, body);
    await page.getByRole('button', { name: '남기기' }).click();

    await expect(page.locator('.guestbook__body').first()).toHaveText(body);
    await expect(page.getByRole('status')).toContainText('고맙습니다');
  });

  test('새로고침해도 남아 있다 (FR-004)', async ({ page }) => {
    const body = unique('다시 와도 있어야 한다.');
    await fill(page, body);
    await page.getByRole('button', { name: '남기기' }).click();
    await expect(page.locator('.guestbook__body', { hasText: body })).toHaveCount(1);

    await page.reload();
    await page.waitForSelector('html[data-book-ready]');
    await openGuestbook(page);

    // 화면이 들고 있던 것이 아니라 서버에서 다시 받아 온 것이다.
    await expect(page.locator('.guestbook__body', { hasText: body })).toHaveCount(1);
  });

  test('HTML 을 적어도 글자로만 보인다 (R-8)', async ({ page }) => {
    const nasty = unique('<img src=x onerror=alert(1)> **굵게**');
    await fill(page, nasty);
    await page.getByRole('button', { name: '남기기' }).click();

    const first = page.locator('.guestbook__body').first();
    await expect(first).toHaveText(nasty);
    // 태그로 해석되지 않았다. 마크다운도 살아나지 않았다.
    expect(await first.locator('img, strong, b, script').count()).toBe(0);
  });

  test('빈 칸으로는 보낼 수 없다', async ({ page }) => {
    await page.getByRole('button', { name: '남기기' }).click();
    // 브라우저의 required 가 막는다 — 서버까지 가지 않는다.
    await expect(page.getByLabel('이름')).toBeFocused();
  });

  test('보내기 전에 외부 전송 고지가 보인다 (FR-014)', async ({ page }) => {
    const disclosure = page.locator('.guestbook__disclosure');
    await expect(disclosure).toBeVisible();
    await expect(disclosure).toContainText('외부');

    // 고지가 버튼보다 위에 있어야 "남기기 전에" 본 것이 된다.
    const noticeBox = await disclosure.boundingBox();
    const buttonBox = await page.getByRole('button', { name: '남기기' }).boundingBox();
    expect(noticeBox!.y).toBeLessThan(buttonBox!.y);
  });
});

test.describe('US2 — 걸린 글은 나오지 않는다 (T043)', () => {
  writesOnlyOnDesktop();

  /** 새로 열어 서버에서 다시 받아 온 목록에 그 글이 있는지 본다. */
  async function reopenAndExpectAbsent(page: Page, body: string): Promise<void> {
    await page.reload();
    await page.waitForSelector('html[data-book-ready]');
    await openGuestbook(page);
    await waitForList(page);

    // 목록이 살아 있다는 것부터 확인한다 — 못 받아 온 화면에서는 무엇이든 "없다".
    // toBeVisible 이 아닌 이유: 3D 로 열리면 캔버스가 목록을 그리고 HTML 목록은
    // 낭독기용으로만 남아 화면에서 접힌다(clip). DOM 에 있는지가 여기서 볼 것이다.
    await expect(page.locator('.guestbook__list')).toHaveCount(1);
    await expect(page.locator('.guestbook__body', { hasText: body })).toHaveCount(0);
  }

  test('링크가 셋이면 목록에 나타나지 않는다', async ({ page }) => {
    const body = unique('싸게 팝니다 https://a.example https://b.example https://c.example');

    await fill(page, body);
    await page.getByRole('button', { name: '남기기' }).click();

    // 방문자에게는 성공처럼 보인다 — 어느 규칙에 걸렸는지 알려 주지 않는다.
    await expect(page.getByRole('status')).toContainText('확인한 뒤');
    await expect(page.getByRole('status')).not.toContainText(/링크|규칙|반복/);

    await reopenAndExpectAbsent(page, body);
  });

  test('숨은 칸이 채워지면 성공처럼 보이되 남지 않는다', async ({ page }) => {
    const body = unique('봇이 남긴 글');

    await fill(page, body);
    // 봇이 하는 일: 화면에 없는 칸까지 채운다.
    await page.locator('.guestbook__honey input').fill('https://buy.example');
    await page.getByRole('button', { name: '남기기' }).click();

    // 봇에게는 성공으로 보인다. 실패를 알려 주면 조건을 바꿔 다시 온다.
    await expect(page.getByRole('status')).toContainText('고맙습니다');

    await reopenAndExpectAbsent(page, body);
  });

  test('같은 글을 두 번 남기면 알려 준다', async ({ page }) => {
    const body = unique('똑같이 남겨 본다');

    await fill(page, body);
    await page.getByRole('button', { name: '남기기' }).click();
    await expect(page.locator('.guestbook__body', { hasText: body })).toHaveCount(1);

    // 폼은 성공하면 비워진다. 같은 내용을 다시 적어 중복을 만든다.
    await fill(page, body);
    await page.getByRole('button', { name: '남기기' }).click();

    await expect(page.getByRole('status')).toContainText('같은 내용');
    // 적던 내용이 사라지지 않는다 (FR-007).
    await expect(page.getByLabel('한마디')).toHaveValue(body);
  });
});

/**
 * 방명록을 열어도 다른 책보다 화면이 더 튀지 않는다 (T056 · SC 의 CLS 기준).
 *
 * 라이트하우스는 `/` 를 열어 볼 뿐 책을 누르지 않는다. 방명록 목록은 그 뒤에 도착하므로
 * 저쪽 예산으로는 잡히지 않는다 — 그래서 여기서 직접 잰다.
 *
 * **절대값이 아니라 다른 책과 견준다.** 예전에는 방명록만 평면 모달로 열려 사실상 0 을
 * 요구할 수 있었다. 지금은 다른 책과 똑같이 3D 로 열리므로, 책이 펼쳐지며 생기는 이동은
 * 방명록의 문제가 아니라 리더 공통의 몫이다. 여기서 지켜야 할 것은 "방명록**이라서**
 * 더 튀지는 않는다" 이고, 그것은 같은 실행에서 나란히 재야만 말이 된다.
 *
 * 이 견줌이 실제로 잡아낸 회귀: 폼을 .book__pages 밖으로 옮긴 뒤, 책이 다 펼쳐질 때까지
 * 폼이 문서 흐름에 남아 상자가 부풀었다 접히며 CLS 0.175 가 났다(다른 책은 0.015).
 * guestbook.css 가 data-reader 가 아니라 data-open3d 를 기준으로 접는 이유다.
 */
test.describe('방명록을 열 때의 화면 흔들림 (T056)', () => {
  writesOnlyOnDesktop();

  /** 그 책을 열고 가라앉을 때까지 기다린 뒤, 그동안 쌓인 레이아웃 이동을 합쳐 준다. */
  async function shiftOnOpening(page: Page, slug: string): Promise<number> {
    await page.goto('/');
    await page.waitForSelector('html[data-book-ready]');
    await page.evaluate(() => {
      (window as unknown as { __shifts: number[] }).__shifts = [];
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const shift = entry as PerformanceEntry & { value: number; hadRecentInput: boolean };
          if (!shift.hadRecentInput) {
            (window as unknown as { __shifts: number[] }).__shifts.push(shift.value);
          }
        }
      }).observe({ type: 'layout-shift', buffered: false });
    });
    await page.locator(`[data-book-slug="${slug}"]`).click();
    await page.waitForTimeout(4000); // 등장 연출(1.3s)과 늦은 목록(0.8s)이 다 지나도록
    const shifts = await page.evaluate(
      () => (window as unknown as { __shifts: number[] }).__shifts,
    );
    return shifts.reduce((sum, v) => sum + v, 0);
  }

  for (const width of [1280, 390]) {
    test(`${width}px 에서 다른 책보다 더 튀지 않는다`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 1280 ? 800 : 844 });

      // 응답을 늦춰 "불러오는 중" 상태를 확실히 거치게 한다. 빨리 오면 튀는 순간이
      // 없어서 통과하는데, 그건 느린 연결에서 안전하다는 증거가 못 된다.
      await page.route('**/api/guestbook/entries*', async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 800));
        await route.continue();
      });

      // 견줄 상대 — 방명록이 아닌 아무 책. 슬러그를 적어 두지 않는다(책은 늘 늘어난다).
      const other = await page.evaluate(
        (skip) =>
          Array.from(document.querySelectorAll<HTMLElement>('[data-book-slug]'))
            .map((el) => el.dataset.bookSlug!)
            .find((s) => s !== skip) ?? null,
        SLUG,
      );
      expect(other, '견줄 다른 책이 있어야 한다').not.toBeNull();

      const baseline = await shiftOnOpening(page, other!);
      const guestbook = await shiftOnOpening(page, SLUG);

      // 여유 0.005 는 재는 순간의 흔들림 몫이다. 회귀는 그보다 훨씬 크게 나타난다
      // (위에 적은 실측: 0.015 대 0.175).
      expect(
        guestbook,
        `방명록 ${guestbook.toFixed(5)} / 다른 책(${other}) ${baseline.toFixed(5)}`,
      ).toBeLessThanOrEqual(baseline + 0.005);

      // 그와 별개로 예산(lighthouserc.json)은 지켜야 한다.
      expect(guestbook).toBeLessThan(0.1);
    });
  }
});

/**
 * 320px 폭 — 읽기만 한다.
 *
 * 위의 쓰기 검증은 desktop 한 곳에서만 돈다. 좁은 폭에서 확인할 것은 글이 저장되는지가
 * 아니라 **폼이 화면 안에 들어오는지** 이므로, 여기서는 아무것도 남기지 않는다.
 */
test.describe('좁은 폭에서의 방명록 (FR-017)', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', '좁은 폭 전용');
  });

  test('320px 에서 가로로 넘치지 않고 폼을 쓸 수 있다', async ({ page }) => {
    await waitForList(page);

    await expect(page.getByLabel('이름')).toBeVisible();
    await expect(page.getByLabel('한마디')).toBeVisible();
    await expect(page.getByRole('button', { name: '남기기' })).toBeVisible();

    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflows).toBe(false);
  });
});
