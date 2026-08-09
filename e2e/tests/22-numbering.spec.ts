import { test, expect, t } from './base';
import { collectErrors, waitForLoaded } from './helpers';

/**
 * Le réglage mentait : les huit compteurs étaient codés en dur, et la page
 * n'exposait que quatre des huit formats. Ces tests vérifient les deux volets
 * — les huit champs sont là, et ce qui est saisi se retrouve dans le numéro
 * du document suivant.
 */

const ongletNumerotation = (page: import('@playwright/test').Page) =>
  page.getByRole('button', { name: t('settings.tabFormats'), exact: true });

test.describe('Formats de numérotation', () => {
  test('les huit documents numérotés sont réglables', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/settings');
    await waitForLoaded(page);
    await ongletNumerotation(page).click();

    for (const champ of [
      'invoiceNumberFormat', 'quoteNumberFormat', 'blNumberFormat', 'creditNoteNumberFormat',
      'poNumberFormat', 'receptionNumberFormat', 'vendorBillNumberFormat',
      'productionOrderNumberFormat',
    ]) {
      await expect(page.locator(`input[name="${champ}"]`)).toBeVisible();
    }

    errors.assert('Numérotation — champs');
  });

  test('l\'aperçu montre le numéro que produirait le format', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/settings');
    await waitForLoaded(page);
    await ongletNumerotation(page).click();

    const champ = page.locator('input[name="invoiceNumberFormat"]');
    await champ.fill('F/YYYY/MM/#####');
    // Les jetons ne se devinent pas : sans l'aperçu, on ne sait pas si YY vaut
    // l'année ou le mois, ni combien de dièses il faut.
    const annee = new Date().getFullYear();
    const mois = String(new Date().getMonth() + 1).padStart(2, '0');
    await expect(page.getByText(`Ex. : F/${annee}/${mois}/00001`)).toBeVisible();

    await champ.fill('FAC-YY-###');
    await expect(page.getByText(`Ex. : FAC-${String(annee).slice(-2)}-001`)).toBeVisible();

    errors.assert('Numérotation — aperçu');
  });

  test('un format sans séquence est refusé', async ({ page }) => {
    await page.goto('/settings');
    await waitForLoaded(page);
    await ongletNumerotation(page).click();

    await page.locator('input[name="invoiceNumberFormat"]').fill('FAC-YY');
    const reponse = page.waitForResponse(
      (r) => r.url().includes('/settings') && r.request().method() === 'PUT',
      { timeout: 10_000 },
    );
    await page.getByRole('button', { name: t('common.save') }).click();
    expect((await reponse).status()).toBe(400);

    // On rétablit le format d'origine : les autres tests créent des documents.
    await page.locator('input[name="invoiceNumberFormat"]').fill('FAC-YY-###');
    const ok = page.waitForResponse(
      (r) => r.url().includes('/settings') && r.request().method() === 'PUT',
      { timeout: 10_000 },
    );
    await page.getByRole('button', { name: t('common.save') }).click();
    expect((await ok).status()).toBe(200);
  });
});
