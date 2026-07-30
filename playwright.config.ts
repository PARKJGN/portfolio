import { defineConfig, devices } from '@playwright/test';

// 개발 서버가 아니라 **정적 산출물(out/)** 을 띄워서 검사한다.
// 실제로 배포되는 것이 그것이고, 개발 서버의 HMR 스크립트가 끼어들면
// 프로덕션과 다른 동작을 검사하게 되기 때문이다.
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',

  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // 320px — 헌장이 요구하는 최소 폭 (FR-017, SC-005)
      //
      // devices['iPhone SE'] 를 쓰지 않는 이유: 그 서술자는 기본 브라우저가 WebKit 이라
      // 별도 설치가 필요하다. 여기서 검증하려는 것은 좁은 폭에서의 레이아웃과 스와이프이고
      // 그건 엔진과 무관하다. 실제 iOS Safari 확인은 수동 검증(T050)의 몫으로 남긴다.
      name: 'mobile',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 320, height: 568 },
        isMobile: false,
        hasTouch: true,
      },
    },
  ],

  webServer: {
    command: 'npm run build && npm run serve',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
