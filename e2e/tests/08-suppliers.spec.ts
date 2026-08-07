import { test, expect } from '@playwright/test';
import { collectErrors, waitForLoaded } from './helpers';

test.describe('Fournisseurs', () => {
  test('liste sans erreur', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/suppliers');
    await waitForLoaded(page);
    errors.assert('Fournisseurs liste');
  });

  test('ouvrir modal nouveau fournisseur', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/suppliers');
    await waitForLoaded(page);

    await page.getByRole('button', { name: /nouveau fournisseur/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    errors.assert('Fournisseurs modal');
  });

  test('créer un fournisseur', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/suppliers');
    await waitForLoaded(page);

    await page.getByRole('button', { name: /nouveau fournisseur/i }).click();
    await page.locator('[role="dialog"] input[name="name"]').fill(`Fournisseur Test ${Date.now()}`);

    const responsePromise = page.waitForResponse(r => r.url().includes('/suppliers') && r.request().method() === 'POST');
    await page.getByRole('button', { name: /enregistrer/i }).click();
    const response = await responsePromise;
    if (!response.ok()) {
      const body = await response.text().catch(() => '');
      throw new Error(`POST /suppliers échoué (${response.status()}): ${body}`);
    }

    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5_000 });
    errors.assert('Fournisseurs créer');
  });

  test('éditer un fournisseur', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/suppliers');
    await waitForLoaded(page);

    // La ligne porte trois boutons — contacts, édition, suppression — et le
    // test cliquait le premier, donc les contacts : la modale ouverte n'avait
    // aucun champ « phone » et il attendait 30 s. On vise le crayon,
    // c'est-à-dire l'avant-dernier bouton de la ligne.
    const row = page.locator('tbody tr').first();
    await expect(row).toBeVisible();
    const boutons = row.locator('button');
    const pencilBtn = boutons.nth((await boutons.count()) - 2);

    await pencilBtn.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    // Vérifie qu'on a ouvert la BONNE modale : celle d'édition arrive avec le
    // nom pré-rempli, celle des contacts n'a pas ce champ.
    await expect(dialog.locator('input[name="name"]')).not.toHaveValue('');

    await dialog.locator('input[name="phone"]').fill('0555000000');

    const responsePromise = page.waitForResponse(
      r => r.url().includes('/suppliers') && r.request().method() === 'PUT',
    );
    await page.getByRole('button', { name: /enregistrer/i }).click();
    const response = await responsePromise;
    if (!response.ok()) {
      const body = await response.text().catch(() => '');
      throw new Error(`PUT /suppliers échoué (${response.status()}): ${body}`);
    }

    await expect(dialog).not.toBeVisible({ timeout: 5_000 });
    errors.assert('Fournisseurs éditer');
  });

  test('recherche fournisseur', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/suppliers');
    await waitForLoaded(page);

    await page.locator('input[placeholder]').first().fill('Test');
    await waitForLoaded(page);
    errors.assert('Fournisseurs recherche');
  });
});
