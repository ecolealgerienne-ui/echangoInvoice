import { test as setup, expect } from '@playwright/test';
import * as path from 'path';

const AUTH_FILE = path.join(__dirname, '../auth.json');

// Ce fichier tourne une seule fois avant tous les tests.
// Il se connecte et sauvegarde la session (cookies + localStorage).
setup('authenticate', async ({ page }) => {
  const email = process.env.TEST_EMAIL ?? 'test@example.com';
  const password = process.env.TEST_PASSWORD ?? 'password123';

  await page.goto('/login');

  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/mot de passe|password/i).fill(password);
  await page.getByRole('button', { name: /connexion|login/i }).click();

  // Attendre la redirection vers le dashboard
  await page.waitForURL(/dashboard/, { timeout: 10_000 });
  await expect(page).toHaveURL(/dashboard/);

  // Sauvegarder la session
  await page.context().storageState({ path: AUTH_FILE });
});
