import { test, expect } from '@playwright/test';
import { collectErrors, waitForLoaded } from './helpers';

test.describe('Clients', () => {
  test('liste affichée sans erreur', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/customers');
    await waitForLoaded(page);
    errors.assert('Clients liste');
  });

  test('ouvrir modal nouveau client', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/customers');
    await waitForLoaded(page);

    await page.getByRole('button', { name: /nouveau client/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    errors.assert('Clients modal');
  });

  test('créer un client', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/customers');
    await waitForLoaded(page);

    await page.getByRole('button', { name: /nouveau client/i }).click();
    await page.locator('[role="dialog"] input[name="name"]').fill(`Client Test ${Date.now()}`);
    await page.getByRole('button', { name: /enregistrer/i }).click();

    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5_000 });
    errors.assert('Clients créer');
  });

  test('ouvrir panel contacts', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/customers');
    await waitForLoaded(page);

    const firstContactBtn = page.getByTitle(/contacts/i).first();
    if (await firstContactBtn.isVisible()) {
      await firstContactBtn.click();
      await expect(page.getByRole('dialog')).toBeVisible();
    }
    errors.assert('Clients contacts');
  });
});
