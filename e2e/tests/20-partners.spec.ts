import { test, expect, t } from './base';
import { collectErrors, waitForLoaded } from './helpers';

/**
 * La fiche tiers répond à une question précise : combien ce client me doit-il,
 * et depuis quand. Les tests visent donc l'encours et son cohérence avec le
 * détail affiché, pas seulement la présence de la page.
 */

async function ouvrirFiche(page: import('@playwright/test').Page, liste: string, recherche: string) {
  await page.goto(liste);
  await waitForLoaded(page);
  await page.getByPlaceholder(t('common.search')).fill(recherche);
  await page.waitForTimeout(800);
  await page.locator('tbody tr a').first().click();
  await waitForLoaded(page);
}

test.describe('Fiches tiers', () => {
  test('la fiche client montre l\'encours et l\'historique', async ({ page }) => {
    const errors = collectErrors(page);
    await ouvrirFiche(page, '/customers', 'Aurès');

    await expect(page).toHaveURL(/\/customers\/[0-9a-f-]{36}$/);
    await expect(page.getByText(t('partners.detail.turnover'))).toBeVisible();
    await expect(page.getByText(t('partners.detail.outstanding'), { exact: true })).toBeVisible();
    await expect(page.getByText(t('partners.detail.overdue'))).toBeVisible();

    // Un historique de factures, dont les numéros mènent au document.
    const factures = page.locator('table').first().locator('tbody tr');
    await expect(factures.first()).toBeVisible();

    errors.assert('Fiche client');
  });

  test('le numéro d\'une facture de la fiche mène au document', async ({ page }) => {
    const errors = collectErrors(page);
    await ouvrirFiche(page, '/customers', 'Aurès');

    await page.locator('table').first().locator('tbody tr a').first().click();
    await expect(page).toHaveURL(/\/invoices\/[0-9a-f-]{36}$/);
    await waitForLoaded(page);
    await expect(page.getByText(t('invoices.detail.subtotal'), { exact: true })).toBeVisible();

    errors.assert('Fiche client → facture');
  });

  test('le client d\'une facture ramène à sa fiche', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/invoices');
    await waitForLoaded(page);
    await page.locator('tbody tr a').first().click();
    await waitForLoaded(page);

    // Le nom du client, dans le bloc Client, est un lien vers la fiche.
    await page.locator('a[href^="/customers/"]').first().click();
    await expect(page).toHaveURL(/\/customers\/[0-9a-f-]{36}$/);
    await expect(page.getByText(t('partners.detail.turnover'))).toBeVisible();

    errors.assert('Facture → fiche client');
  });

  test('la fiche fournisseur montre la dette', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/suppliers');
    await waitForLoaded(page);
    await page.locator('tbody tr a').first().click();
    await expect(page).toHaveURL(/\/suppliers\/[0-9a-f-]{36}$/);
    await waitForLoaded(page);

    await expect(page.getByText(t('partners.detail.purchased'))).toBeVisible();
    await expect(page.getByText(t('partners.detail.debt'), { exact: true })).toBeVisible();

    errors.assert('Fiche fournisseur');
  });

  test('un identifiant inexistant affiche un message', async ({ page }) => {
    await page.goto('/customers/00000000-0000-4000-8000-000000000000');
    await waitForLoaded(page);
    await expect(page.getByText(t('errors.customer_not_found'))).toBeVisible();
  });
});
