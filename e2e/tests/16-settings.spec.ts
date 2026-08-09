import { test, expect, tRegex, t } from './base';
import { collectErrors, waitForLoaded } from './helpers';

/**
 * Deux dérives cumulées, invisibles l'une derrière l'autre :
 *
 * 1. la page a été découpée en quatre onglets — Général, TVA, Unités,
 *    Numérotation — et s'ouvre sur Général, donc la section TVA n'est pas
 *    montée tant qu'on n'a pas cliqué son onglet ;
 * 2. le champ unique `taxRate` a été remplacé par un tableau de taux nommés.
 *
 * Les tests visaient `input[name="taxRate"]` sur l'onglet Général : ils
 * échouaient sur un produit correct.
 */
const ongletTva = (page: import('@playwright/test').Page) =>
  page.getByRole('button', { name: t('settings.tabTax'), exact: true });

test.describe('Paramètres', () => {
  test('page charge et formulaire visible', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/settings');
    await waitForLoaded(page);

    // Onglet Général
    await expect(page.locator('input[name="companyName"]')).toBeVisible();

    // Onglet TVA
    await ongletTva(page).click();
    await expect(page.locator('input[name="taxRate-0"]')).toBeVisible();
    await expect(page.locator('input[name="taxRateName-0"]')).toBeVisible();
    errors.assert('Paramètres chargement');
  });

  test('modifier et sauvegarder les paramètres', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/settings');
    await waitForLoaded(page);

    // Modifier le nom de société (on remet la même valeur pour ne pas casser les données)
    const nameInput = page.locator('input[name="companyName"]');
    const currentName = await nameInput.inputValue();
    await nameInput.fill(currentName || 'Chambre Froide Test');

    const responsePromise = page.waitForResponse(r => r.url().includes('/settings') && r.request().method() !== 'GET');
    await page.getByRole('button', { name: tRegex('common.save') }).click();
    const response = await responsePromise;
    if (!response.ok()) {
      const body = await response.text().catch(() => '');
      throw new Error(`PATCH /settings échoué (${response.status()}): ${body}`);
    }
    errors.assert('Paramètres sauvegarder');
  });

  test('le taux TVA par défaut est un nombre entre 0 et 100', async ({ page }) => {
    await page.goto('/settings');
    await waitForLoaded(page);
    await ongletTva(page).click();

    const taxInput = page.locator('input[name="taxRate-0"]');
    await expect(taxInput).toBeVisible();

    const val = Number(await taxInput.inputValue());
    expect(val, 'le taux doit être un nombre').not.toBeNaN();
    // Une borne, sinon l'assertion passerait sur n'importe quoi de numérique.
    expect(val).toBeGreaterThanOrEqual(0);
    expect(val).toBeLessThanOrEqual(100);
  });

  test('un taux est bien désigné comme défaut', async ({ page }) => {
    await page.goto('/settings');
    await waitForLoaded(page);
    await ongletTva(page).click();

    const radios = page.locator('input[type="radio"][name="defaultTax"]');
    await expect(radios.first()).toBeVisible();
    expect(await radios.evaluateAll(
      (els) => els.filter((e) => (e as HTMLInputElement).checked).length,
    )).toBe(1);
  });
});
