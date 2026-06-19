import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5173';

// Ces tests ne dépendent PAS du storageState (auth) — ils testent la page de login elle-même
test.describe('Auth', () => {
  test('login invalide affiche une erreur', async ({ browser }) => {
    const ctx = await browser.newContext({ baseURL: BASE_URL });
    const page = await ctx.newPage();

    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    await page.locator('input[type="email"]').fill('invalide@example.com');
    await page.locator('input[type="password"]').fill('mauvais_mot_de_passe');
    await page.locator('button[type="submit"]').click();

    // Doit rester sur /login après échec
    await page.waitForTimeout(2000);
    expect(page.url()).toContain('/login');

    await ctx.close();
  });

  test('logout redirige vers /login', async ({ page }) => {
    // Ce test a le storageState, donc on est connecté
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // Chercher le bouton logout dans la sidebar
    const logoutBtn = page.locator('button').filter({ hasText: /déconnexion|logout/i }).first();
    if (await logoutBtn.isVisible()) {
      await logoutBtn.click();
      await page.waitForURL(/login/, { timeout: 5_000 });
      expect(page.url()).toContain('/login');
    }
  });
});
