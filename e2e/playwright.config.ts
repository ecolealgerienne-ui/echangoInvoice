import { defineConfig, devices } from '@playwright/test';
import * as path from 'path';

const browser = (process.env.BROWSER ?? 'chromium') as 'chromium' | 'firefox' | 'webkit';

const browserDevice: Record<string, typeof devices[string]> = {
  chromium: devices['Desktop Chrome'],
  firefox: devices['Desktop Firefox'],
  webkit: devices['Desktop Safari'],
};

export const AUTH_FILE = path.join(__dirname, 'auth.json');

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:5173',
    screenshot: 'only-on-failure',
    video: 'off',
    ignoreHTTPSErrors: true,
    // PAS de storageState ici — défini par projet
  },

  projects: [
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
      // Pas de storageState : le setup crée le fichier
    },
    {
      name: browser,
      use: {
        ...browserDevice[browser],
        storageState: AUTH_FILE,  // lu après que setup l'a créé
      },
      dependencies: ['setup'],
    },
  ],
});
