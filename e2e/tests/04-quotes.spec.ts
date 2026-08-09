import { test, expect, tRegex } from './base';
import { collectErrors, waitForLoaded, selectFirst } from './helpers';

test.describe('Devis', () => {
  test('liste sans erreur', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/quotes');
    await waitForLoaded(page);
    errors.assert('Devis liste');
  });

  test('modal nouveau devis — clients et produits chargés', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/quotes');
    await waitForLoaded(page);

    await page.getByRole('button', { name: tRegex('quotes.new') }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // Vérifier que le select client a des options
    const customerSelect = page.locator('select').first();
    const customerOptions = await customerSelect.locator('option').count();
    expect(customerOptions, 'Select clients doit avoir des options').toBeGreaterThan(1);

    // Vérifier que le select produit a des options
    const productSelects = page.locator('dialog select, [role="dialog"] select');
    const count = await productSelects.count();
    expect(count, 'Au moins 2 selects dans le modal (client + produit)').toBeGreaterThanOrEqual(2);

    errors.assert('Devis modal');
  });
});
