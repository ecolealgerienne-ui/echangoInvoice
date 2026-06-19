# Tests E2E — Echango Invoice

Dossier **isolé** — n'affecte pas le projet principal.

## Prérequis

- Frontend lancé sur `http://localhost:5173` (`npm run dev` dans `client/`)
- Backend lancé sur `http://localhost:3000` (`npm run start:dev`)
- Un compte de test existant

## Installation

```bash
cd e2e
npm install
npx playwright install chromium
```

## Configuration

Créer un fichier `.env` dans `e2e/` :

```env
BASE_URL=http://localhost:5173
TEST_EMAIL=ton@email.com
TEST_PASSWORD=tonmotdepasse
```

## Lancer les tests

```bash
# Mode headless (terminal)
npm test

# Mode visuel (voit le navigateur)
npm run test:headed

# Interface graphique Playwright
npm run test:ui

# Voir le rapport HTML après les tests
npm run report
```

## Désactiver

Pour désactiver complètement les tests, il suffit de **ne pas lancer** les commandes ci-dessus.
Le dossier `e2e/` n'est pas référencé dans le `package.json` principal.

## Structure

```
e2e/
├── tests/
│   ├── auth.setup.ts        # Login unique (tourne avant tout)
│   ├── helpers.ts           # Utilitaires partagés
│   ├── 01-navigation.spec.ts  # Charge toutes les pages
│   ├── 02-customers.spec.ts
│   ├── 03-catalog.spec.ts
│   ├── 04-quotes.spec.ts
│   ├── 05-invoices.spec.ts
│   ├── 06-deliveries.spec.ts
│   └── 07-purchases.spec.ts
├── playwright.config.ts
└── package.json
```
