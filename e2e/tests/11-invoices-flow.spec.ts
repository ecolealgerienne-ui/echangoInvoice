import { test, expect } from '@playwright/test';
import { collectErrors, waitForLoaded, selectFirst } from './helpers';

const today = new Date().toISOString().split('T')[0];
const in30 = new Date(Date.now() + 30 * 864e5).toISOString().split('T')[0];

test.describe('Factures — flux complet', () => {
  test('créer une facture avec une ligne', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/invoices');
    await waitForLoaded(page);

    await page.getByRole('button', { name: /nouvelle facture/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await selectFirst(page, '[role="dialog"] select[name="customerId"]');
    await page.locator('[role="dialog"] input[name="invoiceDate"]').fill(today);
    await page.locator('[role="dialog"] input[name="dueDate"]').fill(in30);

    await selectFirst(page, '[role="dialog"] select[name="items.0.finishedProductId"]');
    await page.locator('[role="dialog"] input[name="items.0.quantity"]').fill('10');
    await page.locator('[role="dialog"] input[name="items.0.unitPrice"]').fill('500');

    const responsePromise = page.waitForResponse(r => r.url().includes('/invoices') && r.request().method() === 'POST');
    await page.getByRole('button', { name: /enregistrer/i }).click();
    const response = await responsePromise;
    if (!response.ok()) {
      const body = await response.text().catch(() => '');
      throw new Error(`POST /invoices échoué (${response.status()}): ${body}`);
    }

    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5_000 });
    errors.assert('Factures créer');
  });

  test('envoyer une facture (draft → sent)', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/invoices');
    await waitForLoaded(page);

    // Filtrer sur draft
    await page.locator('select').last().selectOption('draft');
    await waitForLoaded(page);

    // Chercher le bouton Send (Send icon)
    const sendBtn = page.locator('tbody tr').first().locator('button[title]').filter({ hasText: '' }).nth(1);
    const rows = page.locator('tbody tr');
    const rowCount = await rows.count();

    if (rowCount > 0) {
      // Trouver le bouton "envoyer" dans la première ligne
      const buttons = rows.first().locator('button');
      const btnCount = await buttons.count();
      for (let i = 0; i < btnCount; i++) {
        const title = await buttons.nth(i).getAttribute('title');
        if (title && title.toLowerCase().includes('envoyer')) {
          await buttons.nth(i).click();
          await waitForLoaded(page);
          break;
        }
      }
    }
    errors.assert('Factures envoyer');
  });

  test('enregistrer un paiement', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/invoices');
    await waitForLoaded(page);

    // Filtrer sur "sent" pour avoir des factures payables
    await page.locator('select').last().selectOption('sent');
    await waitForLoaded(page);

    const rows = page.locator('tbody tr');
    if (await rows.count() > 0) {
      const buttons = rows.first().locator('button');
      const btnCount = await buttons.count();
      for (let i = 0; i < btnCount; i++) {
        const title = await buttons.nth(i).getAttribute('title');
        if (title && title.toLowerCase().includes('paiement')) {
          await buttons.nth(i).click();
          await expect(page.getByRole('dialog')).toBeVisible();

          await page.locator('[role="dialog"] input[name="paymentDate"]').fill(today);
          await page.locator('[role="dialog"] input[name="amount"]').fill('1000');
          await page.locator('[role="dialog"] select[name="paymentMethod"]').selectOption('cash');

          const responsePromise = page.waitForResponse(r => r.url().includes('/payments') && r.request().method() === 'POST');
          await page.getByRole('button', { name: /enregistrer/i }).click();
          const response = await responsePromise;
          if (!response.ok()) {
            const body = await response.text().catch(() => '');
            throw new Error(`POST /payments échoué (${response.status()}): ${body}`);
          }
          break;
        }
      }
    }
    errors.assert('Factures paiement');
  });

  test('annuler une facture draft', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/invoices');
    await waitForLoaded(page);

    await page.locator('select').last().selectOption('draft');
    await waitForLoaded(page);

    const rows = page.locator('tbody tr');
    if (await rows.count() > 0) {
      const buttons = rows.first().locator('button');
      const btnCount = await buttons.count();
      for (let i = 0; i < btnCount; i++) {
        const title = await buttons.nth(i).getAttribute('title');
        if (title && title.toLowerCase().includes('annul')) {
          await buttons.nth(i).click();
          await waitForLoaded(page);
          break;
        }
      }
    }
    errors.assert('Factures annuler');
  });
});
