# REPRISE — où on en est, et par quoi continuer

> Arrêt de session : **2026-08-08**
> Branche : `feat/mobile-v1-cache` — poussée, à jour avec `origin`
> Dernier commit : `f19e513` *feat(pricing): grilles tarifaires par client*

Ce fichier sert à reprendre le travail sans relire l'historique.
`docs/STATUS.md` date du 2026-06-22 et **n'est plus fiable** : plusieurs de ses
lignes se sont révélées fausses. `docs/BENCHMARK.md`, lui, est à jour.

---

## Relancer l'environnement

Backend et web tournent sous WSL, la base dans Docker sur le port **5434**.

```bash
cd ~/projects/echangoinvoice/echangoInvoice
npm run dev            # API 3000 + client 5173
```

Puis <http://localhost:5173> — `admin@chambre-froide.dz` / `admin1234`.

Réinitialiser le jeu de démo :

```bash
npm run build          # les migrations tournent depuis dist/
npm run migration:run
npm run seed           # tenant + comptes + abonnement (plan pro)
npm run seed:demo      # ~39 contrôles d'intégrité, rollback si l'un échoue
```

`DEMO_PLAN=starter npm run seed` pour éprouver les quotas (30 factures, 3 postes).

Campagne e2e — les deux serveurs doivent tourner :

```bash
cd e2e && npx playwright test
```

**État vérifié à l'arrêt** : lint 0 erreur (130 avertissements), builds backend
et client 0 erreur, e2e **67/67**, seed **39/39** contrôles verts.

---

## Ce qui a été livré dans cette session

| Commit | Objet |
|---|---|
| `e2be3a3` | Stock ressuscité, rate limiting inert, 500 sur une table supprimée |
| `120f096` | Benchmark réécrit contre des outils comparables, pas des ERP |
| `d6ea3ed` | 11 endpoints livrés mais sans écran, rendus atteignables |
| `0c192a4` | Seed : cycle achat et stock par lots reconstitués |
| `63d41ce` | Seed : factures fournisseurs et règlements |
| `ace79ef` | Avoirs : effet comptable réel (`creditedAmount`) |
| `d3ebd4f` | Gestion des collaborateurs et invitations |
| `f19e513` | Grilles tarifaires par client |
| *(2026-08-08, suite)* | Export CSV — 15 jeux de données, deux dialectes |
| *(2026-08-08, suite)* | Recherche factures et devis : 400 sur chaque frappe |
| *(2026-08-08, suite)* | Pages détail facture / devis / BL, liens entre documents |
| *(2026-08-08, suite)* | Seed : la chaîne devis → BL → facture n'existait pas |
| *(2026-08-08, suite)* | Fiches client et fournisseur : encours, dette, historiques |
| *(2026-08-08, suite)* | Détail commande, réception et facture fournisseur |
| *(2026-08-08, suite)* | Numérotation configurable : 8 formats, compteurs dédiés |

Migrations ajoutées : `1750022000000` (creditedAmount), `1750023000000`
(price_lists), `1750024000000` (document_counters + 4 formats de
numérotation). Toutes appliquées en local.

---

## Par quoi continuer

Ordre recommandé, issu de `docs/BENCHMARK.md`.

**La consultation est terminée** : vente (facture, devis, BL), achat (commande,
réception, facture fournisseur) et tiers (client, fournisseur) ont chacun leur
page, reliées par des liens dans les deux sens. Restent sans page détail les
avoirs, les dépenses et les matières premières — moins urgents, ces documents
n'ont ni lignes ni rapprochement à consulter.

**La numérotation est configurable** : huit formats dans les Paramètres, une
séquence par locataire / type / année dans `document_counters`. Le service
`NumberingService` est le seul point d'entrée ; ne pas réintroduire de
numérotation locale.

### 1. Modèles PDF personnalisables — *le prochain à prendre*

Trois documents figés, sans logo positionnable ni mentions paramétrables.

### 2. La barre Erplain sur le stock

Pas de distinction réservé / disponible / entrant — donc **on peut survendre**.
`reservedQuantity` existe mais seule la production s'en sert : une commande
client ne réserve rien. Ni réception partielle, ni multi-dépôt.

### 3. Portail client

Chantier lourd, valeur incertaine pour une PME algérienne. À ne pas prendre
avant le reste.

---

## Dette et pièges connus

- **Dérive de schéma (R024)** — mesurée à 344 opérations avant les migrations de
  cette session. Jamais appliquée : la migration générée ferait
  `DROP COLUMN "invoiceDate"` et détruirait les dates de 1000 factures.
  À re-mesurer, puis à traiter à la main.
- **SMTP est un placeholder** — `EMAIL_SMTP_HOST=smtp.example.com` dans `.env`.
  Relances, envoi de factures et de BL, invitations : rien ne part. Le code gère
  l'échec proprement (503 `email_send_failed`, et le lien d'invitation est
  renvoyé par l'API), mais la fonction reste inutilisable sans vrais
  identifiants.
- `subscriptions.usersCount` n'est jamais mis à jour. Sans conséquence : le
  quota se calcule en direct sur `users` + `invitations`.
- 130 avertissements de lint (0 erreur), surtout `no-explicit-any`.
- Bundle client à ~900 kB, aucun découpage de code.

## Hors périmètre web

- **Mobile** — `mobile/src/App.tsx` fait 163 lignes : un écran de connexion, une
  liste de clients, un bandeau hors-ligne. Rien de ce qui a été construit cette
  semaine n'y existe. Un portage n'est pas mécanique : les écrans web reposent
  sur des tableaux et des modales larges. À arbitrer quels usages méritent la
  mobilité — plutôt consultation du stock, saisie de BL et signature client.
- **Le clone Windows est en retard** sur la branche.

## Deux décisions qui ne sont pas du code

- **Tarification** : 2 000 / 5 000 / 10 000 DA par mois, face à un ancrage local
  de 12 000 à 25 000 DA en **licence perpétuelle**. L'offre d'entrée coûte
  24 000 DA la première année contre 12 000 DA une fois pour toutes chez un
  concurrent. Détail dans `docs/BENCHMARK.md`.
- **Conformité fiscale** — écartée du benchmark sur arbitrage, mais c'est
  l'argument de vente n°1 de presque tous les concurrents algériens observés.

---

## Comptes de démonstration

| Compte | Rôle | Mot de passe |
|---|---|---|
| `admin@chambre-froide.dz` | owner | `admin1234` |
| `owner@chambre-froide.dz` | owner | `admin1234` |
| `manager@chambre-froide.dz` | manager | `manager1234` |
| `agent@chambre-froide.dz` | agent | `agent1234` |
| `superadmin@echango.dz` | superadmin | `SuperAdmin2026!` (login séparé `/admin/auth/login`) |

**Le mot de passe n'est pas commun** — la version précédente de ce fichier
annonçait `admin1234` pour tous, ce qui fait perdre du temps sur le premier
essai avec un compte non-propriétaire.
