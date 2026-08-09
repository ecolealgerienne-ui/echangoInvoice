import { test, expect, tRegex } from './base';
import { collectErrors, waitForLoaded } from './helpers';

test.describe('Stock', () => {
  test('inventaire charge sans erreur', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/stock');
    await waitForLoaded(page);
    errors.assert('Stock inventaire');
  });

  test('onglet alertes charge sans erreur', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/stock');
    await waitForLoaded(page);

    await page.getByRole('button', { name: tRegex('stock.alerts') }).click();
    await waitForLoaded(page);
    errors.assert('Stock alertes');
  });

  test('onglet inventaire affiche un tableau', async ({ page }) => {
    await page.goto('/stock');
    await waitForLoaded(page);

    const table = page.locator('table');
    await expect(table).toBeVisible();
  });
});
