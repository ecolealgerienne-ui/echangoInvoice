import { test, expect, t } from './base';
import { collectErrors, waitForLoaded } from './helpers';

/**
 * L'écran n'affichait qu'un nombre, « Quantité ». Ce nombre était en réalité
 * le disponible : un BL consomme ses lots dès sa création, et la marchandise
 * d'un BL en brouillon est donc physiquement présente mais déjà décomptée.
 * Rien ne distinguait « il n'en reste plus » de « tout est promis ».
 */

test.describe('Disponibilité du stock', () => {
  test('l\'inventaire distingue réservé, disponible et entrant', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/stock');
    await waitForLoaded(page);

    await expect(page.getByRole('columnheader', { name: t('stock.reserved') })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: t('stock.available') })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: t('stock.incoming') })).toBeVisible();

    errors.assert('Inventaire');
  });

  test('un BL réserve sans faire disparaître la marchandise', async ({ page }) => {
    // Il faut être sur l'origine de l'application : le jeton est dans son
    // localStorage, inaccessible depuis about:blank.
    await page.goto('/stock');
    await waitForLoaded(page);

    const donnees = await page.evaluate(async () => {
      const jeton = localStorage.getItem('accessToken');
      const H = { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' };
      const get = async (u: string) => (await fetch(`/api/v1${u}`, { headers: H })).json();

      const inv = await get('/stock/inventory?page=1&limit=200');
      const article = inv.data.find((a: any) => a.availableQuantity > 50);
      const clients = await get('/customers?page=1&limit=1');

      const avant = article;
      const creation = await fetch('/api/v1/deliveries/delivery-notes', {
        method: 'POST', headers: H,
        body: JSON.stringify({
          customerId: clients.data[0].id, deliveryDate: '2026-08-08',
          items: [{
            finishedProductId: article.rawMaterialId, quantity: 7,
            unit: article.unit, unitPrice: 100, taxRate1: 19,
          }],
        }),
      });
      const bl = await creation.json();

      const apresInv = await get('/stock/inventory?page=1&limit=200');
      const apres = apresInv.data.find((a: any) => a.rawMaterialId === article.rawMaterialId);

      // On annule pour ne pas laisser de trace aux autres tests.
      await fetch(`/api/v1/deliveries/delivery-notes/${bl.data.id}/status`, {
        method: 'PATCH', headers: H, body: JSON.stringify({ status: 'cancelled' }),
      });

      return { avant, apres };
    });

    // Le physique ne bouge pas : la marchandise est toujours au dépôt.
    expect(donnees.apres.physicalQuantity).toBeCloseTo(donnees.avant.physicalQuantity, 2);
    // Le réservé monte de 7, le disponible baisse d'autant.
    expect(donnees.apres.reservedQuantity - donnees.avant.reservedQuantity).toBeCloseTo(7, 2);
    expect(donnees.avant.availableQuantity - donnees.apres.availableQuantity).toBeCloseTo(7, 2);
  });

  test('une sortie sans stock nomme l\'article dans l\'avertissement', async ({ page }) => {
    await page.goto('/stock');
    await waitForLoaded(page);

    const avertissements = await page.evaluate(async () => {
      const jeton = localStorage.getItem('accessToken');
      const H = { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' };
      const get = async (u: string) => (await fetch(`/api/v1${u}`, { headers: H })).json();

      const inv = await get('/stock/inventory?page=1&limit=200');
      const article = inv.data.find((a: any) => a.availableQuantity > 0);
      const clients = await get('/customers?page=1&limit=1');

      const r = await fetch('/api/v1/deliveries/delivery-notes', {
        method: 'POST', headers: H,
        body: JSON.stringify({
          customerId: clients.data[0].id, deliveryDate: '2026-08-08',
          items: [{
            finishedProductId: article.rawMaterialId,
            quantity: article.availableQuantity + 1000,
            unit: article.unit, unitPrice: 10, taxRate1: 19,
          }],
        }),
      });
      const bl = await r.json();
      await fetch(`/api/v1/deliveries/delivery-notes/${bl.data.id}/status`, {
        method: 'PATCH', headers: H, body: JSON.stringify({ status: 'cancelled' }),
      });
      return { warnings: bl.warnings ?? [], nom: article.rawMaterialName };
    });

    expect(avertissements.warnings.length).toBeGreaterThan(0);
    // L'avertissement portait l'identifiant technique de l'article, que
    // personne ne peut relier à un produit.
    expect(avertissements.warnings[0]).toContain(avertissements.nom);
    expect(avertissements.warnings[0]).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
  });
});
