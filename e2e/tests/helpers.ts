import { Page, expect } from '@playwright/test';

/**
 * Collecte les erreurs console et les réponses API en erreur sur une page.
 * Usage : const errors = collectErrors(page); await page.goto('/...'); errors.assert();
 */
export function collectErrors(page: Page) {
  const consoleErrors: string[] = [];
  const apiErrors: string[] = [];

  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  page.on('response', res => {
    if (res.status() >= 400) {
      apiErrors.push(`${res.status()} ${res.url()}`);
    }
  });

  return {
    consoleErrors,
    apiErrors,
    assert(label = '') {
      if (consoleErrors.length > 0) {
        console.log(`\n[${label}] Erreurs console:`);
        consoleErrors.forEach(e => console.log('  ❌', e));
      }
      if (apiErrors.length > 0) {
        console.log(`\n[${label}] Erreurs API:`);
        apiErrors.forEach(e => console.log('  ❌', e));
      }
      expect(consoleErrors, `Erreurs console sur ${label}`).toHaveLength(0);
      expect(apiErrors, `Erreurs API sur ${label}`).toHaveLength(0);
    },
  };
}

/** Attend que le spinner de chargement disparaisse */
export async function waitForLoaded(page: Page) {
  await page.waitForSelector('[data-testid="loading-spinner"]', { state: 'hidden', timeout: 10_000 })
    .catch(() => {}); // OK si le spinner n'est pas présent
  await page.waitForLoadState('networkidle');
}

/** Sélectionne la première option non-vide d'un <select> */
export async function selectFirst(page: Page, selector: string) {
  const options = await page.locator(`${selector} option`).all();
  for (const opt of options) {
    const val = await opt.getAttribute('value');
    if (val && val !== '') {
      await page.selectOption(selector, val);
      return val;
    }
  }
  throw new Error(`Aucune option disponible dans ${selector}`);
}
