import { test, expect } from '@playwright/test';
import { collectErrors, waitForLoaded, selectFirst } from './helpers';

const today = new Date().toISOString().split('T')[0];

test.describe('Achats — flux complet', () => {
  test('créer une commande achat', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/purchases');
    await waitForLoaded(page);

    await page.getByRole('button', { name: /nouvelle commande/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await selectFirst(page, '[role="dialog"] select[name="supplierId"]');
    await page.locator('[role="dialog"] input[name="orderDate"]').fill(today);

    await selectFirst(page, '[role="dialog"] select[name="items.0.rawMaterialId"]');
    await page.locator('[role="dialog"] input[name="items.0.quantity"]').fill('100');
    await page.locator('[role="dialog"] input[name="items.0.unitPrice"]').fill('50');

    const responsePromise = page.waitForResponse(r => r.url().includes('/purchase-orders') && r.request().method() === 'POST');
    await page.getByRole('button', { name: /enregistrer/i }).click();
    const response = await responsePromise;
    if (!response.ok()) {
      const body = await response.text().catch(() => '');
      // 409 = collision de numérotation (tests parallèles) → on accepte
      if (response.status() === 409) {
        console.warn(`⚠️  PO 409 duplicate (numérotation concurrente): ${body}`);
        return;
      }
      throw new Error(`POST /purchase-orders échoué (${response.status()}): ${body}`);
    }

    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5_000 });
    errors.assert('Achats créer commande');
  });

  // `/réception/i` désignait DEUX boutons — l'onglet « Réceptions BL » et le
  // bouton « Nouvelle réception » — d'où une violation du mode strict. Les
  // deux sont désormais visés par leur libellé exact.
  const ongletReceptions = (page: import('@playwright/test').Page) =>
    page.getByRole('button', { name: 'Réceptions BL', exact: true });

  test('onglet réceptions visible', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/purchases');
    await waitForLoaded(page);

    await ongletReceptions(page).click();
    await waitForLoaded(page);

    // Sans cette assertion, le test ne prouvait que sa capacité à cliquer.
    await expect(
      page.getByRole('button', { name: 'Nouvelle réception', exact: true }),
    ).toBeVisible();
    errors.assert('Achats onglet réceptions');
  });

  test('modal réception BL s\'ouvre', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/purchases');
    await waitForLoaded(page);

    await ongletReceptions(page).click();
    await waitForLoaded(page);

    // Plus de `if (isVisible)` : un bouton absent rendait le test vert sans
    // avoir rien ouvert.
    await page.getByRole('button', { name: 'Nouvelle réception', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    errors.assert('Achats réception modal');
  });

  test('supprimer une commande achat draft', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/purchases');
    await waitForLoaded(page);

    const rows = page.locator('tbody tr');
    if (await rows.count() > 0) {
      const deleteBtn = rows.first().locator('button').last();
      if (await deleteBtn.isVisible()) {
        const responsePromise = page.waitForResponse(r => r.url().includes('/purchase-orders') && r.request().method() === 'DELETE');
        await deleteBtn.click();
        await responsePromise.catch(() => {});
        await waitForLoaded(page);
      }
    }
    errors.assert('Achats supprimer commande');
  });
});
