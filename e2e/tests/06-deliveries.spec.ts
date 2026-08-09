import { test, expect, tRegex } from './base';
import { collectErrors, waitForLoaded } from './helpers';

test.describe('Bons de livraison', () => {
  test('liste sans erreur', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/deliveries');
    await waitForLoaded(page);
    errors.assert('BL liste');
  });

  test('modal nouveau BL — clients et produits chargés', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/deliveries');
    await waitForLoaded(page);

    await page.getByRole('button', { name: tRegex('deliveries.new') }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    const selects = page.locator('[role="dialog"] select');
    const count = await selects.count();
    expect(count, 'Au moins 2 selects (client + produit)').toBeGreaterThanOrEqual(2);

    const clientOptions = await selects.first().locator('option').count();
    expect(clientOptions, 'Select clients non vide').toBeGreaterThan(1);

    errors.assert('BL modal');
  });
});
