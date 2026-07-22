import { defineConfig, devices } from '@playwright/test';

// 개발 서버가 아니라 **정적 산출물(out/)** 을 띄워서 검사한다.
// 실제로 배포되는 것이 그것이고, JS 없이도 읽히는지(T025)를 확인하려면
// 개발 서버의 HMR 스크립트가 끼어들면 안 되기 때문이다.
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
      name: 'mobile',
      use: { ...devices['iPhone SE'], viewport: { width: 320, height: 568 } },
    },
    {
      // JS 를 끈 채로도 모든 책에 도달해야 한다 (헌장 원칙 I, FR-012)
      name: 'no-js',
      use: { ...devices['Desktop Chrome'], javaScriptEnabled: false },
      testMatch: /no-js\.spec\.ts/,
    },
  ],

  webServer: {
    command: 'npm run build && npm run serve',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
