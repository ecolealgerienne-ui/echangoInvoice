import { test as setup, expect } from '@playwright/test';
import * as path from 'path';

const AUTH_FILE = path.join(__dirname, '../auth.json');

setup('authenticate', async ({ page }) => {
  const email = process.env.TEST_EMAIL ?? 'test@example.com';
  const password = process.env.TEST_PASSWORD ?? 'password123';

  await page.goto('/login');
  await page.waitForLoadState('networkidle');

  // Les inputs sont sans htmlFor — on cible par type
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.locator('button[type="submit"]').click();

  await page.waitForURL(/dashboard/, { timeout: 15_000 });
  await expect(page).toHaveURL(/dashboard/);

  await page.context().storageState({ path: AUTH_FILE });
});
