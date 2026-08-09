/**
 * Le `test` de cette suite — celui de Playwright, plus la langue.
 *
 * Chaque fichier importe d'ici plutôt que de `@playwright/test`. La seule
 * chose ajoutée est un script d'initialisation qui pose la langue **avant** le
 * chargement de la page : `langueInitiale()` lit `localStorage` au démarrage de
 * l'application, donc l'écrire après coup n'aurait aucun effet sur le rendu
 * déjà fait.
 *
 * ⚠️ `addInitScript` s'exécute avant tout script de la page, à chaque
 * navigation. C'est ce qui rend le basculement fiable : une bascule faite par
 * l'interface, elle, dépendrait de la langue de l'interface — et un test qui
 * doit lire un menu français pour passer en arabe n'a rien réglé.
 */
import { test as base, expect } from '@playwright/test';
import { CLE_STOCKAGE, LANGUE, SENS, t, tRegex } from './langue';

export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(
      ([cle, langue]) => {
        try {
          window.localStorage.setItem(cle, langue);
        } catch {
          /* stockage indisponible — l'application retombe sur le français */
        }
      },
      [CLE_STOCKAGE, LANGUE] as const,
    );
    await use(page);
  },
});

export { expect, t, tRegex, LANGUE, SENS };
