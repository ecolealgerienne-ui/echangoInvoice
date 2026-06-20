import { test as setup, expect } from '@playwright/test';
import * as path from 'path';

const AUTH_FILE = path.join(__dirname, '../auth.json');

setup('authenticate', async ({ page }) => {
  const email = process.env.TEST_EMAIL ?? 'test@example.com';
  const password = process.env.TEST_PASSWORD ?? 'password123';

  // Capturer les erreurs réseau pour diagnostiquer
  const apiErrors: string[] = [];
  page.on('response', async res => {
    if (res.status() >= 400) {
      let body = '';
      try { body = await res.text(); } catch {}
      apiErrors.push(`${res.status()} ${res.url()} — ${body}`);
    }
  });

  await page.goto('/login');
  await page.waitForLoadState('networkidle');

  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.locator('button[type="submit"]').click();

  // Attendre la réponse API login
  try {
    await page.waitForURL(/dashboard/, { timeout: 10_000 });
  } catch {
    // Afficher les erreurs pour diagnostic
    if (apiErrors.length > 0) {
      console.error('\n🔴 Erreurs API détectées :');
      apiErrors.forEach(e => console.error(' ', e));
    }
    // Afficher le contenu de la page pour comprendre
    const url = page.url();
    const errorText = await page.locator('[class*="destructive"], [class*="error"], .toast').allTextContents();
    console.error(`\n🔴 Login échoué — URL: ${url}`);
    if (errorText.length > 0) console.error('   Message affiché:', errorText);
    throw new Error(`Login échoué. Vérifier que le backend tourne et que TEST_EMAIL/TEST_PASSWORD sont corrects.\nAPIErrors: ${apiErrors.join('\n')}`);
  }

  await page.context().storageState({ path: AUTH_FILE });
  console.log(`✅ Authentifié en tant que ${email}`);
});
