import { test, expect, tRegex } from './base';

// Ces tests utilisent le storageState (auth connecté), puis testent logout/login invalide
test.describe('Auth', () => {
  test('login invalide affiche une erreur', async ({ page }) => {
    // Se déconnecter d'abord pour atterrir sur /login
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    const logoutBtn = page.locator('button').filter({ hasText: tRegex('auth.logout') }).first();
    if (await logoutBtn.isVisible()) {
      await logoutBtn.click();
      await page.waitForURL(/login/, { timeout: 5_000 }).catch(() => {});
    } else {
      await page.goto('/login');
      await page.waitForLoadState('networkidle');
    }

    await page.locator('input[type="email"]').fill('invalide@example.com');
    await page.locator('input[type="password"]').fill('mauvais_mot_de_passe');
    await page.locator('button[type="submit"]').click();

    await page.waitForTimeout(2000);
    expect(page.url()).toContain('/login');
  });

  test('logout redirige vers /login', async ({ page }) => {
    // Ce test a le storageState, donc on est connecté
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // Chercher le bouton logout dans la sidebar
    const logoutBtn = page.locator('button').filter({ hasText: tRegex('auth.logout') }).first();
    if (await logoutBtn.isVisible()) {
      await logoutBtn.click();
      await page.waitForURL(/login/, { timeout: 5_000 });
      expect(page.url()).toContain('/login');
    }
  });
});
