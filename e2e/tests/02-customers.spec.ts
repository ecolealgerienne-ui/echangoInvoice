import { test, expect, tRegex, LANGUE, SENS } from './base';
import { collectErrors, waitForLoaded } from './helpers';

test.describe('Clients', () => {
  test('liste affichée sans erreur', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/customers');
    await waitForLoaded(page);
    errors.assert('Clients liste');
  });

  test('ouvrir modal nouveau client', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/customers');
    await waitForLoaded(page);

    await page.getByRole('button', { name: tRegex('customers.new') }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    errors.assert('Clients modal');
  });

  test('créer un client', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/customers');
    await waitForLoaded(page);

    await page.getByRole('button', { name: tRegex('customers.new') }).click();
    await page.locator('[role="dialog"] input[name="name"]').fill(`Client Test ${Date.now()}`);

    const responsePromise = page.waitForResponse(r => r.url().includes('/customers') && r.request().method() === 'POST');
    await page.getByRole('button', { name: tRegex('common.save') }).click();
    const response = await responsePromise;

    if (!response.ok()) {
      const body = await response.text().catch(() => '');
      throw new Error(`POST /customers échoué (${response.status()}): ${body}`);
    }

    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5_000 });
    errors.assert('Clients créer');
  });

  test('ouvrir panel contacts', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/customers');
    await waitForLoaded(page);

    // Le bouton porte son libellé en `title`, donc traduit lui aussi.
    const firstContactBtn = page.getByTitle(tRegex('customers.contacts')).first();
    if (await firstContactBtn.isVisible()) {
      await firstContactBtn.click();
      await expect(page.getByRole('dialog')).toBeVisible();
    }
    errors.assert('Clients contacts');
  });

  // ⚠️ **Le test qui rend le reste crédible** (R030).
  //
  // Sans lui, toute la suite pourrait tourner en français en croyant tourner en
  // arabe, et son vert ne prouverait rien. Deux vérifications, parce qu'elles
  // échouent pour des raisons différentes :
  //
  //   · le sens d'écriture — `main.tsx` pose `dir` au démarrage depuis la
  //     langue lue dans `localStorage`. S'il vaut `ltr` alors qu'on demandait
  //     l'arabe, c'est le script d'initialisation qui n'a pas pris ;
  //   · un libellé traduit — si `dir` est juste mais que le texte reste
  //     français, c'est le catalogue ou i18next qui n'a pas suivi.
  test('la page est bien rendue dans la langue du passage', async ({ page }) => {
    await page.goto('/customers');
    await waitForLoaded(page);

    await expect(page.locator('html')).toHaveAttribute('dir', SENS[LANGUE]);
    await expect(page.getByRole('heading', { name: tRegex('customers.title') }).first())
      .toBeVisible();
  });
});
