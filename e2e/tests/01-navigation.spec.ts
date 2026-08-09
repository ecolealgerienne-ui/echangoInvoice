import { test, expect } from './base';
import { collectErrors, waitForLoaded } from './helpers';

/**
 * Vérifie que chaque page se charge sans erreur console ni API.
 */

const PAGES = [
  { path: '/dashboard', label: 'Dashboard' },
  { path: '/customers', label: 'Clients' },
  { path: '/quotes', label: 'Devis' },
  { path: '/invoices', label: 'Factures' },
  { path: '/deliveries', label: 'Bons de livraison' },
  { path: '/products', label: 'Catalogue' },
  { path: '/stock', label: 'Stock' },
  { path: '/suppliers', label: 'Fournisseurs' },
  { path: '/purchases', label: 'Achats' },
  { path: '/expenses', label: 'Dépenses' },
  { path: '/reports', label: 'Rapports' },
  { path: '/settings', label: 'Paramètres' },
];

for (const { path, label } of PAGES) {
  test(`${label} — charge sans erreur`, async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto(path);
    await waitForLoaded(page);

    // La page ne doit pas afficher d'écran d'erreur React
    await expect(page.locator('text=Something went wrong')).not.toBeVisible();
    await expect(page.locator('text=Unexpected Application Error')).not.toBeVisible();

    errors.assert(label);
  });
}
