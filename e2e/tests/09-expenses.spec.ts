import { test, expect, tRegex } from './base';
import { collectErrors, waitForLoaded } from './helpers';

const today = new Date().toISOString().split('T')[0];

test.describe('Dépenses', () => {
  test('liste sans erreur', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/expenses');
    await waitForLoaded(page);
    errors.assert('Dépenses liste');
  });

  test('filtre par catégorie', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/expenses');
    await waitForLoaded(page);

    await page.locator('select').first().selectOption('transport');
    await waitForLoaded(page);
    errors.assert('Dépenses filtre catégorie');
  });

  test('créer une dépense', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/expenses');
    await waitForLoaded(page);

    await page.getByRole('button', { name: tRegex('expenses.new') }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.locator('[role="dialog"] input[name="expenseDate"]').fill(today);
    await page.locator('[role="dialog"] input[name="description"]').fill(`Dépense Test ${Date.now()}`);
    await page.locator('[role="dialog"] input[name="amount"]').fill('1500');
    await page.locator('[role="dialog"] select[name="category"]').selectOption('transport');

    const responsePromise = page.waitForResponse(r => r.url().includes('/expenses') && r.request().method() === 'POST');
    await page.getByRole('button', { name: tRegex('common.save') }).click();
    const response = await responsePromise;
    if (!response.ok()) {
      const body = await response.text().catch(() => '');
      throw new Error(`POST /expenses échoué (${response.status()}): ${body}`);
    }

    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5_000 });
    errors.assert('Dépenses créer');
  });

  test('approuver une dépense', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/expenses');
    await waitForLoaded(page);

    const approveBtn = page.locator('tbody tr').first().locator('button[title]').first();
    if (await approveBtn.isVisible()) {
      await approveBtn.click();
      await waitForLoaded(page);
    }
    errors.assert('Dépenses approuver');
  });
});
