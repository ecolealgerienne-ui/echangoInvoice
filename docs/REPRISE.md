# REPRISE — où on en est, et par quoi continuer

> Arrêt de session : **2026-08-08** (seconde session)
> Branche : `feat/mobile-v1-cache`
> Dernier commit : *feat(i18n): arabe complet — 683 clés traduites, 143 chaînes externalisées*

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
| *(2026-08-08, suite)* | Documents PDF : identification de l'émetteur, gabarit commun |
| *(2026-08-08, suite)* | Stock : réservé / disponible / entrant, survente nommée |

Migrations ajoutées : `1750022000000` (creditedAmount), `1750023000000`
(price_lists), `1750024000000` (document_counters + 4 formats de
numérotation), `1750025000000` (identification de l'émetteur : NIF, RC, AI,
NIS, RIB, couleur des documents). Toutes appliquées en local.

---

## Session 2 — sécurité, conformité, listes

| Commit | Objet |
|---|---|
| `20fba9c` | Archives PDF isolées par société, `TenantGuard` monté, rendu PDF durci, montant en toutes lettres, droit de timbre |
| `91e937f` | Fiches article et dépense, écran « Matières premières » mort supprimé, `?month=` validé |
| `9b343d9` | Tri par colonne sur les sept listes principales |
| `23aef3b` | Périodes libres au tableau de bord, comparaison à la période précédente |

Migrations ajoutées : `1750026000000` (droit de timbre), `1750027000000`
(`product_barcodes`), `1750028000000` (`product_suppliers`, avec reprise du
fournisseur unique existant), `1750029000000` (rôle `accountant` dans l'enum).
Toutes appliquées en local. ⚠️ `1750029000000` utilise `ALTER TYPE … ADD VALUE`,
qui est **irréversible** : son `down` refuse tant qu'un compte porte le rôle.

**Trois défauts de sécurité corrigés**, tous consignés dans le nouveau
`docs/ERREURS.md` : l'archivage PDF écrasait les factures entre sociétés (E001),
le schéma du logo n'était pas contraint (E002), et `TenantGuard` n'était monté
sur aucun contrôleur (E003).

**Suite de la session** — douchette USB sur les quatre écrans de saisie et dans
la recherche, PDF d'avoir, mention « facture annulée » en diagonale, facture
proforma, fournisseurs multiples par article, balance âgée, rôle « comptable »
en lecture seule, désamorçage des deux dérives de schéma destructrices, TVA
déductible et aide au G50, QR de vérification signé avec sa page publique,
cachet de l'émetteur, interface arabe avec écriture de droite à gauche, et
facturation récurrente **avec son écran**, fiche avoir, champs manquants des
fiches article et dépense, et tri sur les colonnes jointes.

**Conformité au décret 05-468 : il ne reste que la facture récapitulative.**
Identifiants légaux, montant en toutes lettres, droit de timbre, mention
d'annulation, cachet et proforma sont livrés.

### Ce qui reste ouvert, par ordre de valeur

Arbitré avec le client le 2026-08-08 : RTL arabe et facturation récurrente
étaient prioritaires et sont livrés. Le reste est ici, en attente.

⚠️ **Liste complétée le 2026-08-08 après vérification.** Dix points en étaient
absents, dont la demande client n° 11 — la mention conditionnelle sur les PDF —
qui avait été approuvée puis oubliée. Les manques venaient de constats faits en
cours de session sans être reportés ici : c'est exactement ce que R031 décrit,
un état qui cesse d'être vrai fait prendre des décisions.

⚠️ **Le barème du droit de timbre reste à faire confirmer par un comptable**
(`docs/CONFORMITE-FISCALE.md` §2). Il est désactivé par défaut.

#### 1. Mention « Echango Invoice » conditionnelle — *demande client n° 11, approuvée*

**Analysée, jamais faite.** Le point avait pourtant été validé le 2026-08-08 et
il est oublié depuis. La mention **n'existe plus** sur les documents : elle a
disparu lors de l'unification du gabarit PDF. Il s'agit donc de l'*ajouter*,
puis d'en faire un avantage payant.

L'infrastructure est prête : `plans.features` est un JSONB déjà utilisé par
`PlanFeaturesGuard` pour `creditNotes`, `vendorBills` et `production`. Ajouter
`whitelabelPdf: false` sur Starter, `true` sur Pro et Enterprise, et lire le
drapeau dans `invoice-pdf.service.ts` au moment de composer le pied de page.
Une journée.

Deux réserves à tenir : ne **jamais** conditionner à l'abonnement les mentions
*légales* — NIF, RC, montant en lettres, timbre —, et rester sobre. Formulation
retenue : « Facture émise avec Echango Invoice — echango.dz ».

#### Décisions prises sur les PDF d'achat (pour mémoire)

**Pas de QR de vérification sur les documents d'achat.** La page de
vérification est publique et non authentifiée : elle existe pour qu'un tiers
détenant *notre* document confirme qu'il est authentique. L'ouvrir aux achats
publierait nos prix d'achat fournisseur sur une URL devinable. Le code-barres
du numéro, lui, y figure : il ne sert qu'au classement et ne divulgue rien.

**La facture fournisseur sort en copie interne.** L'original remis par le
fournisseur est la pièce comptable ; notre rendu ne reproduit que notre saisie.
Il porte donc un filigrane « COPIE INTERNE », la mention correspondante, et
sort sans notre logo ni notre cachet — sans quoi ce PDF circulerait comme un
original. Ces trois éléments ne doivent pas être retirés.

**Le bon de réception ne porte aucun prix.** Il constate ce qui est entré en
stock, lot par lot. Le gabarit a reçu pour cela un mode `quantitatif`
(désignation, lot, quantité) : lui laisser les colonnes monétaires imprimait
« 0,00 DA » sur chaque ligne, ce qu'un lecteur pressé lit comme une livraison
gratuite.

**`verify:pdf-achats` n'est pas dans `npm run verify`.** Il démarre le
conteneur Nest et interroge la base ; le reste de la série s'exécute sans
dépendance. Le lancer à la main après toute retouche des PDF d'achat.

#### 2. Journal d'activité visible

`createdBy` et `updatedBy` sont alimentés par l'intercepteur d'audit sur toutes
les entités, et **affichés nulle part**. « Qui a modifié cette facture, et
quand » est une question courante en contrôle.

#### 3. Chaîne devis → BL → facture en un geste

La conversion devis → facture existe ; le passage par le bon de livraison, non.
Le négociant qui livre puis facture repasse par la saisie.

#### 4. Rôle *agent* exclu du tableau de bord — *à trancher*

`@Roles('owner', 'manager', 'accountant')` sur les trois routes du tableau de
bord : un agent reçoit un 403 et voit un écran vide au lieu de sa page
d'accueil. Volontaire ou hérité, la question n'a jamais été posée au client.

#### 5. Caisse / point de vente

Rien n'existe. C'est le débouché naturel du scan et du droit de timbre, tous
deux livrés — mais c'est un terrain où d'autres éditeurs algériens sont déjà
installés. À ne prendre que si un client le demande.

#### 6. Relecture de la traduction arabe
**Couverture désormais complète : 1008 clés sur 1008**, et plus aucune chaîne
écrite en dur dans le client — `npm run verify:i18n` refuse les deux. **Une relecture par un arabophone est nécessaire
avant mise en production** : le vocabulaire comptable algérien a ses usages —
« إشعار الدائن » pour un avoir, « حق الطابع » pour le droit de timbre — retenus
sans avoir pu être confirmés. Les règles RTL couvrent les utilitaires Tailwind
les plus fréquents ; les cas non couverts se repèrent sur une capture d'écran.

#### 7. Pièces jointes
Reporté sur décision. Rien n'existe : ni `@fastify/multipart`, ni intercepteur,
ni table. Par ordre de valeur métier : justificatif de **dépense** — c'est la
raison d'être du module —, **facture fournisseur** reçue, **BL de réception**
signé, registre de commerce des **tiers**, fiche technique **produit**.

Quatre règles à poser dès la première ligne, toutes tirées de E001 :
chemin de stockage **préfixé par le tenantId** et nom remplacé par un
identifiant ; type réel vérifié par les **octets d'en-tête**, pas par
l'extension ; téléchargement **servi par l'API** après contrôle du locataire ;
`Content-Disposition: attachment` systématique. Plus un plafond par fichier et
un quota par offre, sans quoi le stockage devient un coût non borné.

#### 8. Scan par caméra
La douchette couvre le poste fixe, la caméra vise le mobile. `BarcodeDetector`
natif quand il est disponible — Chrome Android et Edge, pas Safari iOS —, repli
`@zxing/browser` en WASM, et plugin natif MLKit côté Capacitor plutôt qu'une
`<video>` dans la webview. **Éviter `html5-qrcode`** : populaire mais non
maintenu, et adossé à un portage ZXing lui-même abandonné.

#### 9. Facture récapitulative
Dernier écart au décret 05-468. Regrouper les BL d'une période en une seule
facture, ce que le décret n'autorise que pour des ventes répétitives et
régulières — le ministère évoque trois transactions par semaine au même client
— et sur autorisation préalable. Aligné sur le profil visé : le négociant en
froid qui livre plusieurs fois par semaine.

#### 10. Multi-dépôts
Chantier de structure. Une chambre froide, c'est plusieurs chambres à
températures distinctes. Non réclamé à ce jour, mais c'est ce qui distinguerait
durablement le produit sur l'agroalimentaire.

#### 11. Traçabilité par lot
Les lots et les péremptions sont saisis à la réception et suivis en stock ; ce
qui manque est le sens inverse — remonter d'un lot aux clients livrés, pour un
rappel sanitaire.

#### 12. Portail client
Reporté de longue date. Le QR de vérification en couvre déjà l'usage principal :
le client atteint son document sans compte.

#### 13. Dérive de schéma résiduelle
354 opérations, 13 `DROP COLUMN`. Les deux causes destructrices sont traitées ;
le reste est mécanique — `varchar(255)` déclaré contre `varchar` sans longueur,
`numeric(10,2)` contre `numeric`, et 61 clés étrangères. **Ne pas lancer
`migration:generate` sans lire sa sortie entière** tant que ce n'est pas soldé.

#### 14. Dette de moindre portée
- `Total TTC` en dur sur la page Devis (R018).
- 130 avertissements de lint, surtout `no-explicit-any`.
- Bundle client à ~900 ko, aucun découpage de code.
- `subscriptions.usersCount` jamais mis à jour — sans conséquence, le quota se
  calcule en direct.

---

⚠️ **Le barème du droit de timbre reste à faire confirmer par un comptable.**
Il est désactivé par défaut : rien ne bouge tant que la case des Paramètres
n'est pas cochée.

**Contrôles exécutables** : `npm run verify` — 131 assertions sur cinq suites
(sécurité, conformité, tri, périodes). Chacune a été vue **refuser** avant
d'être déclarée bonne (R030).

⚠️ **`docs/CONFORMITE-FISCALE.md` reste la référence du barème du timbre**, qui
est **à faire confirmer par un comptable** avant qu'un client réel l'active. Il
est désactivé par défaut.

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

**Les documents portent l'identification de l'émetteur** (NIF, RC, AI, NIS,
RIB), le pied de page et la couleur choisis dans les Paramètres. Le gabarit est
unique : `src/common/pdf/document-template.ts`, fonction pure, testable sans
navigateur. Ne pas y réintroduire de HTML par document.

Ce qui reste sur les PDF, par ordre de valeur décroissante : positionner le
logo, choisir les colonnes du tableau, et un gabarit par type de document.
Aucun de ces trois points n'a été demandé par un utilisateur — à ne prendre
que si le besoin se manifeste.

**Le stock distingue physique / réservé / disponible / entrant**
(`src/stock/stock-availability.ts`, calculé et non stocké — ne pas y
réintroduire de colonne compteur). Restent hors périmètre : la réception
partielle et le multi-dépôt, deux chantiers de structure que rien n'a réclamés.

### 1. Conformité fiscale algérienne — *les deux premiers écarts sont livrés*

Étude complète dans **`docs/CONFORMITE-FISCALE.md`** (2026-08-08).

Livrés : le **droit de timbre** et le **total TTC en toutes lettres**.

Restent, par ordre de valeur : la **TVA déductible** pour compléter le G50 —
nous en fournissons la moitié, ce qui oblige le comptable à reprendre l'autre à
la main —, le **cachet**, la **facture récapitulative**, la mention « facture
annulée », et la **facture proforma**.

⚠️ **La facturation électronique n'est PAS obligatoire en Algérie à ce jour.**
Plusieurs éditeurs l'affirment en citant des textes introuvables au JO, ou en
recopiant le calendrier marocain. Ne pas la vendre, ne pas bâtir dessus.

### 2. Pièces jointes — **reporté, décision du 2026-08-08 (session 2)**

Demandé par le client, écarté pour l'instant. **Rien n'existe** : ni
`@fastify/multipart`, ni intercepteur de fichier, ni table. `STORAGE_PATH` ne
sert qu'à l'archivage des PDF générés.

Par ordre de valeur métier : justificatif de **dépense** — c'est la raison
d'être du module —, **facture fournisseur** reçue, **BL de réception** signé,
registre de commerce des **tiers**, fiche technique **produit**.

Quatre règles à poser dès la première ligne, toutes tirées de E001 :

- chemin de stockage **préfixé par le tenantId**, nom de fichier remplacé par un
  identifiant — jamais le nom d'origine sur disque ;
- type réel vérifié par les **octets d'en-tête**, pas par l'extension ni par le
  `Content-Type` annoncé par le client ;
- téléchargement **servi par l'API** après contrôle du locataire, jamais un
  dossier statique exposé par le serveur web ;
- `Content-Disposition: attachment` systématique, pour qu'un HTML ou un SVG
  piégé ne s'exécute pas dans le domaine de l'application.

Prévoir aussi un plafond par fichier et un quota par offre — sans quoi le
stockage devient un coût non borné.

### 3. Portail client — **reporté, décision du 2026-08-08**

Chantier lourd, valeur incertaine pour une PME algérienne. **Arbitré : on le
garde pour la fin.** Ne pas le reprendre tant qu'il reste autre chose à faire.

---

## Dette et pièges connus

- **Dérive de schéma (R024)** — **ramenée à 354 opérations, dont 13 DROP
  COLUMN** (fin de session 2, après correction des deux causes les plus
  dangereuses : l'unicité globale sur `creditNoteNumber` et le type de
  `invoiceDate`). Mesurée auparavant à 356 puis 364 opérations**, dont 57 `DROP CONSTRAINT` / 57 `ADD CONSTRAINT`, 52
  `ALTER COLUMN` et **15 `DROP COLUMN`** — parmi lesquelles `"invoiceDate"`,
  `"status"`, `"createdBy"` et `"approvedBy"`. Jamais appliquée. La migration
  générée détruirait la date de chaque facture émise.
  **Ne jamais lancer `migration:generate` sans lire sa sortie entière** : les
  vingt premières lignes ne contiennent que des `DROP CONSTRAINT` et donnent une
  fausse impression d'innocuité (voir `docs/ERREURS.md` E006). Les migrations de
  la session 2 ont toutes été écrites à la main.
- **SMTP est un placeholder — en attente du passage au VPS** (décision du
  2026-08-08). `EMAIL_SMTP_HOST=smtp.example.com` dans `.env` : relances, envoi
  de factures et de BL, invitations, rien ne part. Le code gère l'échec
  proprement (503 `email_send_failed`, et le lien d'invitation est renvoyé par
  l'API) — **la fonction n'est donc pas cassée, elle est débranchée**. À
  rebrancher avec les identifiants réels au moment de la mise en VPS, et à
  éprouver alors sur les quatre usages, pas seulement sur l'envoi de facture.
- `subscriptions.usersCount` n'est jamais mis à jour. Sans conséquence : le
  quota se calcule en direct sur `users` + `invitations`.
- 130 avertissements de lint (0 erreur), surtout `no-explicit-any`.
- Bundle client à ~900 kB, aucun découpage de code.

## Hors périmètre web

- **Mobile — attente délibérée, décision du 2026-08-08.** `mobile/src/App.tsx`
  fait 163 lignes : un écran de connexion, une liste de clients, un bandeau
  hors-ligne. Rien de ce qui a été construit cette semaine n'y existe.

  **La décision est d'attendre que le logiciel soit stabilisé avant de
  développer le mobile, pour le bâtir sur des briques qui ne bougent plus.**
  Ce n'est pas un report par manque de temps : cette semaine seule a modifié
  la numérotation, les gabarits PDF, le calcul du stock et la forme des
  réponses de sept endpoints. Un client mobile écrit avant cette stabilisation
  aurait été à réécrire deux fois, et chaque contrat d'API changé se paie
  double dès qu'il existe un second consommateur.

  Quand le moment viendra, arbitrer d'abord quels usages méritent la mobilité —
  plutôt consultation du stock, saisie de BL et signature client — car le
  portage n'est pas mécanique : les écrans web reposent sur des tableaux et des
  modales larges.
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
