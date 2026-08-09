import { test, expect, t } from './base';
import { collectErrors, waitForLoaded } from './helpers';

/**
 * Les PDF sélectionnaient littéralement `NULL AS company_nif` : chaque facture
 * sortait avec « NIF : » et « RC : » vides, faute d'un endroit où saisir ceux
 * de sa propre entreprise. Ce test garde la saisie ET le téléchargement.
 */

test.describe('Documents et identification', () => {
  test('l\'identification de l\'entreprise est saisissable', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/settings');
    await waitForLoaded(page);

    for (const champ of ['nif', 'rc', 'ai', 'nis', 'rib']) {
      await expect(page.locator(`input[name="${champ}"]`)).toBeVisible();
    }
    await expect(page.locator('input[name="pdfAccentColor"]')).toBeVisible();

    errors.assert('Identification entreprise');
  });

  test('une couleur invalide est refusée par le serveur', async ({ page }) => {
    await page.goto('/settings');
    await waitForLoaded(page);

    // Le champ natif de type `color` n'accepte que de l'hexadécimal ; on
    // interroge donc l'API directement, seule barrière si la requête ne vient
    // pas du formulaire. Depuis la page, pour disposer du jeton.
    const statut = await page.evaluate(async () => {
      const r = await fetch('/api/v1/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
        },
        body: JSON.stringify({ pdfAccentColor: 'red; } body { display:none' }),
      });
      return r.status;
    });
    expect(statut).toBe(400);
  });

  test('les trois documents se téléchargent', async ({ page }) => {
    const errors = collectErrors(page);

    for (const [liste, motif] of [
      ['/invoices', /^FAC-/],
      ['/quotes', /^DEV-/],
      ['/deliveries', /^BL-/],
    ] as [string, RegExp][]) {
      await page.goto(liste);
      await waitForLoaded(page);

      const attente = page.waitForEvent('download');
      // Le bouton n'a qu'une icône : son intitulé est dans `title`.
      await page.locator('tbody').getByTitle(t('common.pdf'), { exact: true }).first().click();
      const fichier = await attente;
      expect(fichier.suggestedFilename()).toMatch(motif);
      expect(fichier.suggestedFilename()).toMatch(/\.pdf$/);
    }

    errors.assert('Téléchargement des PDF');
  });
});
