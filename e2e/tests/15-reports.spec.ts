import { test, expect } from '@playwright/test';
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

    await page.getByRole('button', { name: /stock/i }).click();
    await waitForLoaded(page);
    errors.assert('Rapports stock');
  });

  test('générer rapport ventes', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/reports');
    await waitForLoaded(page);

    await page.getByRole('button', { name: /ventes/i }).click();

    const dateInputs = page.locator('input[type="date"]');
    await dateInputs.first().fill(firstOfMonth);
    await dateInputs.last().fill(today);

    const responsePromise = page.waitForResponse(r => r.url().includes('/reports'));
    await page.getByRole('button', { name: /générer/i }).click();
    await responsePromise;
    await waitForLoaded(page);
    errors.assert('Rapports ventes générer');
  });

  test('générer rapport achats', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/reports');
    await waitForLoaded(page);

    await page.getByRole('button', { name: /achats/i }).click();
    await page.getByRole('button', { name: /générer/i }).click();
    await waitForLoaded(page);
    errors.assert('Rapports achats générer');
  });

  test('générer rapport taxes', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/reports');
    await waitForLoaded(page);

    await page.getByRole('button', { name: /tax|tva/i }).click();
    await page.getByRole('button', { name: /générer/i }).click();
    await waitForLoaded(page);
    errors.assert('Rapports taxes générer');
  });
});
