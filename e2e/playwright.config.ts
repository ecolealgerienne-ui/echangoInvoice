import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:5173',
    // Credentials stockés entre les tests du même worker
    storageState: 'auth.json',
    screenshot: 'only-on-failure',
    video: 'off',
    // Capture toutes les erreurs console
    ignoreHTTPSErrors: true,
  },

  projects: [
    // Setup : login et sauvegarde session
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
      use: { storageState: undefined },
    },
    // Tests principaux (dépendent du setup)
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
    },
  ],
});
