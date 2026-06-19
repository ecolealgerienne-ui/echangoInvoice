import { test, expect } from '@playwright/test';
import { collectErrors, waitForLoaded, selectFirst } from './helpers';

const today = new Date().toISOString().split('T')[0];

test.describe('Bons de livraison — flux complet', () => {
  test('créer un BL avec une ligne', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/deliveries');
    await waitForLoaded(page);

    await page.getByRole('button', { name: /nouveau bl|nouveau bon/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await selectFirst(page, '[role="dialog"] select[name="customerId"]');
    await page.locator('[role="dialog"] input[name="deliveryDate"]').fill(today);

    await selectFirst(page, '[role="dialog"] select[name="items.0.finishedProductId"]');
    await page.locator('[role="dialog"] input[name="items.0.quantity"]').fill('2');
    await page.locator('[role="dialog"] input[name="items.0.unitPrice"]').fill('100');

    const responsePromise = page.waitForResponse(r => r.url().includes('/delivery-notes') && r.request().method() === 'POST');
    await page.getByRole('button', { name: /enregistrer/i }).click();
    const response = await responsePromise;
    if (!response.ok()) {
      const body = await response.text().catch(() => '');
      throw new Error(`POST /delivery-notes échoué (${response.status()}): ${body}`);
    }

    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5_000 });
    errors.assert('BL créer');
  });

  test('annuler un BL draft', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/deliveries');
    await waitForLoaded(page);

    const rows = page.locator('tbody tr');
    if (await rows.count() > 0) {
      // Chercher un bouton annuler (premier bouton action dans la ligne)
      const cancelBtn = rows.first().locator('button').last();
      if (await cancelBtn.isVisible()) {
        await cancelBtn.click();
        await waitForLoaded(page);
      }
    }
    errors.assert('BL annuler');
  });

  test('recherche BL', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/deliveries');
    await waitForLoaded(page);

    await page.locator('input[placeholder]').fill('BL');
    await waitForLoaded(page);
    errors.assert('BL recherche');
  });
});
