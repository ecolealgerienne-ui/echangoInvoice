import { test, expect } from '@playwright/test';
import { collectErrors, waitForLoaded } from './helpers';

test.describe('Achats', () => {
  test('liste commandes sans erreur', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/purchases');
    await waitForLoaded(page);
    errors.assert('Achats liste');
  });

  test('modal nouvelle commande — fournisseurs et produits chargés', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/purchases');
    await waitForLoaded(page);

    await page.getByRole('button', { name: /nouvelle commande/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // Fournisseur select
    const supplierSelect = page.locator('[role="dialog"] select').first();
    const supplierOptions = await supplierSelect.locator('option').count();
    expect(supplierOptions, 'Select fournisseurs non vide').toBeGreaterThan(1);

    // Produit select dans les lignes articles
    const productSelect = page.locator('[role="dialog"] select').nth(1);
    const productOptions = await productSelect.locator('option').count();
    expect(productOptions, 'Select produits non vide').toBeGreaterThan(1);

    errors.assert('Achats modal commande');
  });
});
