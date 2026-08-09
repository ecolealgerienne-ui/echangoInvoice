import { test, expect, tRegex } from './base';
import { collectErrors, waitForLoaded } from './helpers';

const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
const today = new Date().toISOString().split('T')[0];

test.describe('Rapports', () => {
  test('page rapports charge sans erreur', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/reports');
    await waitForLoaded(page);
    errors.assert('Rapports page');
  });

  test('rapport stock (auto-chargé)', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/reports');
    await waitForLoaded(page);

    await page.getByRole('button', { name: tRegex('reports.stock') }).click();
    await waitForLoaded(page);
    errors.assert('Rapports stock');
  });

  test('générer rapport ventes', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/reports');
    await waitForLoaded(page);

    await page.getByRole('button', { name: tRegex('reports.sales') }).click();

    const dateInputs = page.locator('input[type="date"]');
    await dateInputs.first().fill(firstOfMonth);
    await dateInputs.last().fill(today);

    const responsePromise = page.waitForResponse(r => r.url().includes('/reports'));
    await page.getByRole('button', { name: tRegex('reports.generate') }).click();
    await responsePromise;
    await waitForLoaded(page);
    errors.assert('Rapports ventes générer');
  });

  test('générer rapport achats', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/reports');
    await waitForLoaded(page);

    await page.getByRole('button', { name: tRegex('reports.purchases') }).click();
    await page.getByRole('button', { name: tRegex('reports.generate') }).click();
    await waitForLoaded(page);
    errors.assert('Rapports achats générer');
  });

  test('générer rapport taxes', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/reports');
    await waitForLoaded(page);

    await page.getByRole('button', { name: tRegex('reports.tax') }).click();
    await page.getByRole('button', { name: tRegex('reports.generate') }).click();
    await waitForLoaded(page);
    errors.assert('Rapports taxes générer');
  });
});
