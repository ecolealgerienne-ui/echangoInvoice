import { test, expect } from '@playwright/test';
import { collectErrors, waitForLoaded } from './helpers';

test.describe('Paramètres', () => {
  test('page charge et formulaire visible', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/settings');
    await waitForLoaded(page);

    await expect(page.locator('input[name="companyName"]')).toBeVisible();
    await expect(page.locator('input[name="taxRate"]')).toBeVisible();
    errors.assert('Paramètres chargement');
  });

  test('modifier et sauvegarder les paramètres', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/settings');
    await waitForLoaded(page);

    // Modifier le nom de société (on remet la même valeur pour ne pas casser les données)
    const nameInput = page.locator('input[name="companyName"]');
    const currentName = await nameInput.inputValue();
    await nameInput.fill(currentName || 'Chambre Froide Test');

    const responsePromise = page.waitForResponse(r => r.url().includes('/settings') && r.request().method() !== 'GET');
    await page.getByRole('button', { name: /enregistrer|sauvegarder/i }).click();
    const response = await responsePromise;
    if (!response.ok()) {
      const body = await response.text().catch(() => '');
      throw new Error(`PATCH /settings échoué (${response.status()}): ${body}`);
    }
    errors.assert('Paramètres sauvegarder');
  });

  test('taux TVA est un nombre', async ({ page }) => {
    await page.goto('/settings');
    await waitForLoaded(page);

    const taxInput = page.locator('input[name="taxRate"]');
    const val = await taxInput.inputValue();
    expect(Number(val), 'taxRate doit être un nombre').not.toBeNaN();
  });
});
