import { test, expect } from '@playwright/test';
import { collectErrors, waitForLoaded } from './helpers';

/**
 * Le défaut que ces pages corrigent : les modales de saisie sont réservées aux
 * brouillons, si bien qu'une facture envoyée ou payée n'était consultable
 * nulle part dans l'application — il fallait ouvrir le PDF pour savoir ce
 * qu'elle contenait. Les tests visent donc explicitement un document qui n'est
 * PAS en brouillon.
 */

async function ouvrirPremierNonBrouillon(
  page: import('@playwright/test').Page,
  liste: string,
  motifUrl: RegExp,
) {
  await page.goto(liste);
  await waitForLoaded(page);

  const lien = page.locator('tbody tr a').first();
  const numero = (await lien.textContent())?.trim();
  await lien.click();
  await expect(page).toHaveURL(motifUrl);
  await waitForLoaded(page);
  return numero;
}

test.describe('Pages détail', () => {
  test('une facture montre ses lignes, son client et ses totaux', async ({ page }) => {
    const errors = collectErrors(page);

    // Filtre « Réglée » : on veut précisément un document sorti du brouillon.
    await page.goto('/invoices');
    await waitForLoaded(page);
    await page.locator('select').first().selectOption('paid');
    await waitForLoaded(page);

    const lien = page.locator('tbody tr a').first();
    const numero = (await lien.textContent())?.trim();
    await lien.click();
    await expect(page).toHaveURL(/\/invoices\/[0-9a-f-]{36}$/);
    await waitForLoaded(page);

    await expect(page.getByRole('heading', { name: numero! })).toBeVisible();

    // Les lignes : au moins une, avec un nom d'article et un total.
    const lignes = page.locator('table tbody tr');
    await expect(lignes.first()).toBeVisible();
    const premiere = await lignes.first().textContent();
    expect(premiere).toMatch(/[A-Za-zÀ-ÿ]{3,}/);
    expect(premiere).toContain('DA');

    // Les totaux, dont le solde dû.
    await expect(page.getByText('Total HT', { exact: true })).toBeVisible();
    await expect(page.getByText('Solde dû', { exact: true })).toBeVisible();

    // Le client, avec au moins son nom.
    await expect(page.getByRole('heading', { name: 'Client', exact: true })).toBeVisible();

    errors.assert('Détail facture');
  });

  test('le retour du navigateur ramène à la liste', async ({ page }) => {
    const errors = collectErrors(page);
    await ouvrirPremierNonBrouillon(page, '/invoices', /\/invoices\/[0-9a-f-]{36}$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/invoices$/);
    errors.assert('Retour navigateur');
  });

  test('un devis montre ses lignes', async ({ page }) => {
    const errors = collectErrors(page);
    const numero = await ouvrirPremierNonBrouillon(page, '/quotes', /\/quotes\/[0-9a-f-]{36}$/);
    await expect(page.getByRole('heading', { name: numero! })).toBeVisible();
    await expect(page.locator('table tbody tr').first()).toBeVisible();
    await expect(page.getByText('Total HT', { exact: true })).toBeVisible();
    errors.assert('Détail devis');
  });

  test('un BL montre ses lignes', async ({ page }) => {
    const errors = collectErrors(page);
    const numero = await ouvrirPremierNonBrouillon(page, '/deliveries', /\/deliveries\/[0-9a-f-]{36}$/);
    await expect(page.getByRole('heading', { name: numero! })).toBeVisible();
    await expect(page.locator('table tbody tr').first()).toBeVisible();
    errors.assert('Détail BL');
  });

  test('une facture issue d\'un BL mène au BL, qui renvoie vers elle', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/invoices');
    await waitForLoaded(page);

    // La colonne « Origine » porte le numéro du BL quand il y en a un.
    const ligne = page.locator('tbody tr').filter({ hasText: /BL-\d{2}-\d{3}/ }).first();
    await ligne.locator('a').first().click();
    await waitForLoaded(page);
    const numeroFacture = await page.locator('h1').textContent();

    await page.getByText(/^BL-\d{2}-\d{3}$/).first().click();
    await expect(page).toHaveURL(/\/deliveries\/[0-9a-f-]{36}$/);
    await waitForLoaded(page);

    // Le BL renvoie vers la facture : l'aller-retour doit boucler.
    await expect(page.getByText(numeroFacture!.trim(), { exact: true })).toBeVisible();

    errors.assert('Chaîne facture ↔ BL');
  });

  test('un identifiant inexistant affiche un message, pas une page vide', async ({ page }) => {
    await page.goto('/invoices/00000000-0000-4000-8000-000000000000');
    await waitForLoaded(page);
    await expect(page.getByText('Facture introuvable')).toBeVisible();
  });
});
