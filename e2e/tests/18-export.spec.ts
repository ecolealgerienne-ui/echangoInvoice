import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { collectErrors, waitForLoaded } from './helpers';

/**
 * L'export traverse toute la pile — filtres de l'écran, requête SQL,
 * sérialisation, en-têtes HTTP, téléchargement du navigateur — et aucune de
 * ces étapes n'est visible dans l'interface : un fichier vide ou mal encodé
 * se découvre en l'ouvrant, souvent chez le comptable. D'où un test qui lit
 * réellement le contenu du fichier reçu.
 */

async function telecharger(page: import('@playwright/test').Page, bouton: string, dialecte: string) {
  await page.getByRole('button', { name: bouton }).click();
  const attente = page.waitForEvent('download');
  await page.getByText(dialecte, { exact: true }).click();
  const telechargement = await attente;
  const chemin = await telechargement.path();
  return {
    nom: telechargement.suggestedFilename(),
    octets: readFileSync(chemin!),
  };
}

test.describe('Export CSV', () => {
  test('exporte les factures au format Excel français', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/invoices');
    await waitForLoaded(page);

    const { nom, octets } = await telecharger(page, 'Exporter les factures', 'Excel (français)');

    expect(nom).toMatch(/^factures_\d{4}-\d{2}-\d{2}\.csv$/);

    // Sans la marque d'ordre des octets, Excel affiche « RÃ©glÃ©e ».
    expect([octets[0], octets[1], octets[2]]).toEqual([0xef, 0xbb, 0xbf]);

    const texte = octets.toString('utf8').slice(1);
    const lignes = texte.split('\r\n').filter(Boolean);
    expect(lignes[0]).toBe(
      'Numéro;Date;Échéance;Client;NIF;RC;Ville;Statut;Total HT;TVA;Total TTC;'
      + 'Encaissé;Avoirs;Reste dû;BL d\'origine;Devis d\'origine;Notes',
    );
    // Le jeu de démonstration compte un millier de factures : l'export ne
    // doit pas se limiter à la page affichée.
    expect(lignes.length).toBeGreaterThan(100);
    expect(lignes[1]).toMatch(/^FAC-\d{2}-\d{4};\d{2}\/\d{2}\/\d{4};/);

    errors.assert('Export factures');
  });

  test('le filtre de statut de l\'écran s\'applique au fichier', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/invoices');
    await waitForLoaded(page);

    await page.locator('select').first().selectOption('paid');
    await waitForLoaded(page);

    const { octets } = await telecharger(page, 'Exporter les factures', 'Excel (français)');
    const lignes = octets.toString('utf8').slice(1).split('\r\n').filter(Boolean).slice(1);

    expect(lignes.length).toBeGreaterThan(0);
    // Colonne « Statut » : la huitième. Aucun champ antérieur n'est protégé
    // par des guillemets dans ce jeu, un découpage simple suffit.
    for (const ligne of lignes) expect(ligne.split(';')[7]).toBe('Réglée');

    errors.assert('Export filtré');
  });

  test('le dialecte international écrit des décimales à point', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/customers');
    await waitForLoaded(page);

    const { nom, octets } = await telecharger(page, 'Exporter', 'CSV standard');

    expect(nom).toMatch(/^clients_/);
    const lignes = octets.toString('utf8').slice(1).split('\r\n').filter(Boolean);
    expect(lignes[0]).toContain('Nom,Contact,Email');
    expect(lignes[0]).toContain('Encours');

    errors.assert('Export clients');
  });
});
