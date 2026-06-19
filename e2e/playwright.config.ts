import { defineConfig, devices } from '@playwright/test';

// Navigateur configurable via env var : BROWSER=firefox npm test
const browser = (process.env.BROWSER ?? 'chromium') as 'chromium' | 'firefox' | 'webkit';

const browserDevice: Record<string, typeof devices[string]> = {
  chromium: devices['Desktop Chrome'],
  firefox: devices['Desktop Firefox'],
  webkit: devices['Desktop Safari'],
};

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:5173',
    storageState: 'auth.json',
    screenshot: 'only-on-failure',
    video: 'off',
    ignoreHTTPSErrors: true,
  },

  projects: [
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
      use: { storageState: undefined },
    },
    {
      name: browser,
      use: { ...browserDevice[browser] },
      dependencies: ['setup'],
    },
  ],
});
