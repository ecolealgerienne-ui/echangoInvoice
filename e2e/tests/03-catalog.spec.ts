import { test, expect } from '@playwright/test';
import { collectErrors, waitForLoaded, selectFirst } from './helpers';

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

    const nom = `Produit Test ${Date.now()}`;
    await page.locator('[role="dialog"] input[name="name"]').fill(nom);
    // L'unité est un <select> alimenté par les paramètres, plus un <input> :
    // le test visait input[name="unit"] et attendait 30 s un champ inexistant.
    await selectFirst(page, '[role="dialog"] select[name="unit"]');

    const responsePromise = page.waitForResponse(
      r => r.url().includes('/products') && r.request().method() === 'POST',
    );
    await page.getByRole('button', { name: /enregistrer/i }).click();
    const response = await responsePromise;
    if (!response.ok()) {
      const body = await response.text().catch(() => '');
      throw new Error(`POST /products échoué (${response.status()}): ${body}`);
    }

    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5_000 });
    errors.assert('Catalogue créer produit');
  });
});
