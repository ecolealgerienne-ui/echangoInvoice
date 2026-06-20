import { test, expect } from '@playwright/test';
import { collectErrors, waitForLoaded, selectFirst } from './helpers';

const today = new Date().toISOString().split('T')[0];
const in30 = new Date(Date.now() + 30 * 864e5).toISOString().split('T')[0];

test.describe('Devis — flux complet', () => {
  test('créer un devis avec une ligne', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/quotes');
    await waitForLoaded(page);

    await page.getByRole('button', { name: /nouveau devis/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // Client
    await selectFirst(page, '[role="dialog"] select[name="customerId"]');

    // Dates
    await page.locator('[role="dialog"] input[name="quoteDate"]').fill(today);
    await page.locator('[role="dialog"] input[name="expiryDate"]').fill(in30);

    // Ligne article
    await selectFirst(page, '[role="dialog"] select[name="items.0.finishedProductId"]');
    await page.locator('[role="dialog"] input[name="items.0.quantity"]').fill('5');
    await page.locator('[role="dialog"] input[name="items.0.unitPrice"]').fill('1000');

    const responsePromise = page.waitForResponse(r => r.url().includes('/quotes') && r.request().method() === 'POST');
    await page.getByRole('button', { name: /enregistrer/i }).click();
    const response = await responsePromise;
    if (!response.ok()) {
      const body = await response.text().catch(() => '');
      throw new Error(`POST /quotes échoué (${response.status()}): ${body}`);
    }

    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5_000 });
    errors.assert('Devis créer');
  });

  test('ajouter plusieurs lignes', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/quotes');
    await waitForLoaded(page);

    await page.getByRole('button', { name: /nouveau devis/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await selectFirst(page, '[role="dialog"] select[name="customerId"]');

    // Ajouter une 2ème ligne
    await page.getByRole('button', { name: /ajouter/i }).click();
    const selects = page.locator('[role="dialog"] select[name^="items."][name$=".finishedProductId"]');
    const count = await selects.count();
    expect(count, '2 lignes article').toBe(2);

    errors.assert('Devis multi-lignes');
  });

  test('filtre statut devis', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/quotes');
    await waitForLoaded(page);

    for (const status of ['draft', 'sent', 'accepted', 'expired']) {
      await page.locator('select').last().selectOption(status);
      await waitForLoaded(page);
    }
    // Revenir à tous
    await page.locator('select').last().selectOption('');
    errors.assert('Devis filtres statut');
  });

  test('supprimer un devis draft', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/quotes');
    await waitForLoaded(page);

    // Filtre statut draft pour avoir un devis supprimable
    await page.locator('select').last().selectOption('draft');
    await waitForLoaded(page);

    const deleteBtn = page.locator('tbody tr').first().locator('button').last();
    if (await deleteBtn.isVisible()) {
      const responsePromise = page.waitForResponse(r => r.url().includes('/quotes') && r.request().method() === 'DELETE');
      await deleteBtn.click();
      await responsePromise;
      await waitForLoaded(page);
    }
    errors.assert('Devis supprimer');
  });
});
