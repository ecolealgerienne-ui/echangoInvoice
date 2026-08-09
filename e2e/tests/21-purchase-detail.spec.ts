import { test, expect, t } from './base';
import { collectErrors, waitForLoaded } from './helpers';

/**
 * Le côté achat était le dernier sans page détail : les lignes d'une commande
 * réceptionnée n'étaient consultables nulle part, et une réception ne disait
 * pas quels lots elle avait fait entrer en stock.
 */

test.describe('Détail des documents d\'achat', () => {
  test('une commande montre ses lignes, ses réceptions et ses factures', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/purchases');
    await waitForLoaded(page);

    // Une commande facturée : elle a forcément une réception et une facture.
    const ligne = page.locator('tbody tr').filter({ hasText: t('status.invoiced') }).first();
    const numero = (await ligne.locator('a').first().textContent())?.trim();
    await ligne.locator('a').first().click();
    await expect(page).toHaveURL(/\/purchases\/orders\/[0-9a-f-]{36}$/);
    await waitForLoaded(page);

    await expect(page.getByRole('heading', { name: numero! })).toBeVisible();
    await expect(page.getByRole('heading', { name: t('common.items') })).toBeVisible();
    await expect(page.getByRole('heading', { name: t('purchases.receptionsTitle') })).toBeVisible();
    await expect(page.getByRole('heading', { name: t('nav.vendorBills') })).toBeVisible();
    await expect(page.getByText(t('invoices.detail.subtotal'), { exact: true })).toBeVisible();

    errors.assert('Détail commande');
  });

  test('la réception d\'une commande montre les lots entrés en stock', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/purchases');
    await waitForLoaded(page);

    const ligne = page.locator('tbody tr').filter({ hasText: t('status.invoiced') }).first();
    await ligne.locator('a').first().click();
    await waitForLoaded(page);

    // Depuis la commande, on suit le lien vers sa réception.
    await page.locator('a[href^="/purchases/receptions/"]').first().click();
    await expect(page).toHaveURL(/\/purchases\/receptions\/[0-9a-f-]{36}$/);
    await waitForLoaded(page);

    await expect(page.getByRole('heading', { name: t('purchases.detail.lots') })).toBeVisible();
    const lots = page.locator('table tbody tr');
    await expect(lots.first()).toBeVisible();
    // Un lot porte un numéro et un coût unitaire : sans eux la page ne sert à rien.
    expect(await lots.first().textContent()).toMatch(/LOT-/);

    errors.assert('Détail réception');
  });

  test('une facture fournisseur montre son rapprochement et ses règlements', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/purchases/vendor-bills');
    await waitForLoaded(page);

    const numero = (await page.locator('tbody tr a').first().textContent())?.trim();
    await page.locator('tbody tr a').first().click();
    await expect(page).toHaveURL(/\/purchases\/vendor-bills\/[0-9a-f-]{36}$/);
    await waitForLoaded(page);

    await expect(page.getByRole('heading', { name: numero! })).toBeVisible();
    await expect(page.getByText(t('purchases.poNumber'))).toBeVisible();
    await expect(page.getByText(t('purchases.blNumber'))).toBeVisible();
    await expect(page.getByText(t('partners.detail.remaining'))).toBeVisible();

    errors.assert('Détail facture fournisseur');
  });

  test('la fiche fournisseur mène à ses documents d\'achat', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/suppliers');
    await waitForLoaded(page);
    await page.locator('tbody tr a').first().click();
    await waitForLoaded(page);

    await page.locator('a[href^="/purchases/orders/"]').first().click();
    await expect(page).toHaveURL(/\/purchases\/orders\/[0-9a-f-]{36}$/);

    errors.assert('Fiche fournisseur → commande');
  });
});
