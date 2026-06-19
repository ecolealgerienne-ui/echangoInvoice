import { test, expect } from '@playwright/test';
import { collectErrors, waitForLoaded } from './helpers';

test.describe('Catalogue produits', () => {
  test('liste sans erreur', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/products');
    await waitForLoaded(page);
    errors.assert('Catalogue');
  });

  test('filtres type fonctionnent', async ({ page }) => {
    await page.goto('/products');
    await waitForLoaded(page);

    for (const label of ['Produit', 'Matière', 'Les deux', 'Tous']) {
      const btn = page.getByRole('button', { name: label }).or(page.locator(`button:has-text("${label}")`));
      if (await btn.isVisible()) {
        const errors = collectErrors(page);
        await btn.click();
        await waitForLoaded(page);
        errors.assert(`Catalogue filtre ${label}`);
      }
    }
  });

  test('créer un produit', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/products');
    await waitForLoaded(page);

    await page.getByRole('button', { name: /nouvel article/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.locator('[role="dialog"] input[name="name"]').fill(`Produit Test ${Date.now()}`);
    await page.locator('[role="dialog"] input[name="unit"]').fill('pcs');
    await page.getByRole('button', { name: /enregistrer/i }).click();

    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5_000 });
    errors.assert('Catalogue créer produit');
  });
});
