import { test, expect } from '@playwright/test';
import { collectErrors, waitForLoaded } from './helpers';

test.describe('Factures', () => {
  test('liste sans erreur', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/invoices');
    await waitForLoaded(page);
    errors.assert('Factures liste');
  });

  test('modal nouvelle facture — clients et produits chargés', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/invoices');
    await waitForLoaded(page);

    await page.getByRole('button', { name: /nouvelle facture/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    const selects = page.locator('[role="dialog"] select');
    const count = await selects.count();
    expect(count, 'Au moins 2 selects (client + produit)').toBeGreaterThanOrEqual(2);

    // Client select a des options
    const clientOptions = await selects.first().locator('option').count();
    expect(clientOptions, 'Select clients non vide').toBeGreaterThan(1);

    // Produit select a des options
    const productOptions = await selects.nth(1).locator('option').count();
    expect(productOptions, 'Select produits non vide').toBeGreaterThan(1);

    errors.assert('Factures modal');
  });

  test('filtres statut fonctionnent', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/invoices');
    await waitForLoaded(page);

    const statusSelect = page.locator('select').first();
    for (const status of ['draft', 'sent', 'paid', 'overdue']) {
      await statusSelect.selectOption(status);
      await waitForLoaded(page);
    }
    errors.assert('Factures filtres');
  });
});
