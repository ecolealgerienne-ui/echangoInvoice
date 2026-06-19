import { test, expect } from '@playwright/test';
import { collectErrors, waitForLoaded } from './helpers';

test.describe('Fournisseurs', () => {
  test('liste sans erreur', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/suppliers');
    await waitForLoaded(page);
    errors.assert('Fournisseurs liste');
  });

  test('ouvrir modal nouveau fournisseur', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/suppliers');
    await waitForLoaded(page);

    await page.getByRole('button', { name: /nouveau fournisseur/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    errors.assert('Fournisseurs modal');
  });

  test('créer un fournisseur', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/suppliers');
    await waitForLoaded(page);

    await page.getByRole('button', { name: /nouveau fournisseur/i }).click();
    await page.locator('[role="dialog"] input[name="name"]').fill(`Fournisseur Test ${Date.now()}`);

    const responsePromise = page.waitForResponse(r => r.url().includes('/suppliers') && r.request().method() === 'POST');
    await page.getByRole('button', { name: /enregistrer/i }).click();
    const response = await responsePromise;
    if (!response.ok()) {
      const body = await response.text().catch(() => '');
      throw new Error(`POST /suppliers échoué (${response.status()}): ${body}`);
    }

    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5_000 });
    errors.assert('Fournisseurs créer');
  });

  test('éditer un fournisseur', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/suppliers');
    await waitForLoaded(page);

    const editBtn = page.locator('button[aria-label], button').filter({ has: page.locator('svg') }).nth(0);
    const pencilBtn = page.locator('tbody tr').first().locator('button').first();
    if (await pencilBtn.isVisible()) {
      await pencilBtn.click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.locator('[role="dialog"] input[name="phone"]').fill('0555000000');
      await page.getByRole('button', { name: /enregistrer/i }).click();
      await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5_000 });
    }
    errors.assert('Fournisseurs éditer');
  });

  test('recherche fournisseur', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/suppliers');
    await waitForLoaded(page);

    await page.locator('input[placeholder]').first().fill('Test');
    await waitForLoaded(page);
    errors.assert('Fournisseurs recherche');
  });
});
