# Journal du chantier — file de travail

> **Ce fichier porte l'état, pas la mémoire de l'agent.** Le chantier tourne en
> boucle auto-cadencée : à chaque reprise le contexte repart de zéro. Ce qui
> n'est pas écrit ici est perdu.
>
> Consigne reçue le 2026-08-09 : *« fais-moi tout et utilise la loop pour le
> faire sans revenir à moi »*. Les arbitrages qui revenaient au produit sont
> donc pris ici — **toujours dans le sens conservateur**, et chacun consigné en
> §0 pour relecture.

---

## 0. Arbitrages pris à la place du produit — À RELIRE

Ils étaient signalés comme « votre appel » au moment où la consigne d'autonomie
est arrivée. Règle que je me suis donnée, faute de pouvoir demander :

> **Documenter le comportement réel ; ne jamais élargir un droit d'accès ;
> ne jamais changer un calcul fiscal ou comptable.** Un document qu'on corrige
> se recorrige ; un droit qu'on ouvre ne se referme qu'après incident.

| # | Arbitrage | Sens retenu | Réversible ? |
|---|---|---|---|
| A1 | 68 écarts de la matrice des rôles (E020) | la **politique écrite** est mise à jour pour décrire les 5 rôles réels. Aucun `@Roles` n'est touché | oui — c'est de la documentation |
| A2 | 3 écarts où le code refuse ce que la politique promet à l'agent (`create-invoice`, les deux `send-email`) | **le code a raison** : convertir un BL en facture et expédier au client sont des actes commerciaux, pas de la saisie. La politique est corrigée, l'accès reste fermé | oui |
| A3 | `accountant` absent de toute politique | écrit tel qu'observé : **toute lecture, aucune écriture**. Rien n'est ouvert ni fermé | oui |
| A4 | 14 clés d'erreur métier sans traduction | traduites au plus près du message technique, sans inventer de règle métier | oui |

**Ce que je n'ai pas touché, et pourquoi :** aucun `@Roles`, aucun calcul de
TVA, de timbre ou de marge, aucune migration. Ces gestes ne sont pas
réversibles par une relecture.

### ⚠️ E021 — la décision que j'ai refusé de prendre seul

Le banc des cycles de vie a trouvé qu'une **facture émise peut être rouverte
en trois appels et réécrite sous le même numéro** :

```
FAC-26-013   2 380,00 DA   sent
  PUT  → 422 invoice_cannot_update       ← la garde fonctionne
  sent → cancelled → draft → PUT → 200   ← la même garde, contournée
FAC-26-013 117 810,00 DA   sent
```

`cancelled → draft` est dans le code, dans aucune spec. **Je n'ai rien
corrigé.** Trois correctifs sont plausibles — retirer la transition, régénérer
le numéro, ou verrouiller sur le document plutôt que sur le statut — et ils
n'ont pas les mêmes conséquences fiscales. Choisir demande un comptable ;
ma règle dit de ne pas toucher au fiscal.

**Le banc reste rouge sur cette ligne, exprès.** Détail complet : E021.

---

## 1. File de travail

Statuts : `▢` à faire · `▶` en cours · `✅` fait · `⛔` bloqué (raison écrite)

### A — Arbitrages délégués · **TERMINÉ** le 2026-08-09

- ✅ **A0** journal créé
- ✅ **A1** `docs/specs/02-auth.md` — matrice des 5 rôles, arbitrée, avec les
  listes nommées (10 suppressions réservées, 16 routes d'agrégat fermées à
  l'agent, 10 écritures de l'agent)
- ✅ **A2** `CLAUDE.md` §4 — forme courte, renvoi à la spec
- ✅ **A3** `banc-matrice-roles.py` transcrit la politique arbitrée →
  **795/795 sur les 5 personas**. Auto-test porté de 29 à 46 cas.
  ⚠️ Revu refuser après l'arbitrage — sans quoi il aurait pu devenir
  tautologique, la politique ayant été dérivée du comportement observé :
  `@Roles('owner')` élargi sur `DELETE /customers/:id` ⇒ manager 158/159,
  **un seul** écart, la route nommée.
- ✅ **A4** i18n : **16 clés** ajoutées fr + ar (14 nues + `document_not_found`
  + `email_already_used`). Clés nues sans traduction : **14 → 0**.
  Restent 3 `errors.*` (`image_invalid_format`, `logo_invalid_format`,
  `logo_too_large`) : messages `class-validator`, ils arrivent en **tableau** et
  `resolveApiError` retombe sur le générique quelle que soit la clé. Les
  traduire ne changerait rien — consigné dans E018, pas corrigé.

### B — Étape 5, bancs métier (un par défaut constaté)

- ✅ **B1** `banc-cycles-de-vie.py` — 4 cycles documentés (devis, BL, facture,
  commande d'achat), graphe **observé** comparé aux tableaux des specs.
  Auto-test 9 cas dont 3 qui doivent signaler un écart.
  **Résultat : 13 conformes · 7 permises non documentées · 1 documentée
  refusée · 4 états non atteints, nommés.** Trouvailles : **E021** (facture
  rouverte, gravité élevée, non corrigé — voir §0) et six transitions
  non écrites, dont `commande sent → received` à la main, sans réception.
  ⚠️ Le banc fabrique ~42 documents par passage, **dans le locataire B** :
  poser cela chez A polluerait le jeu de démonstration.
  **Reste :** avoir, réception, facture fournisseur, ordre de fabrication —
  leurs transitions ne sont documentées nulle part ; à traiter comme
  `accountant` l'a été (publier l'observation), en B1bis.
- ▢ **B1bis** cycles non documentés : avoir, facture fournisseur, ordre de
  fabrication — publier le graphe observé, sans verdict
- ✅ **B2** `banc-effets-de-bord.py` — les 6 effets de `CLAUDE.md` §2, mesurés
  **ailleurs dans la base** (avant/après), pas au code retour.
  Auto-test 8 cas dont 3 valeurs illisibles qui doivent valoir 0.
  **12 effets mesurés · 7 tenus · 5 rompus**, dont :
  - **E022 ①** `reserved` n'est **écrit nulle part** — lu par
    `dashboard.service.ts:389` et `reports.service.ts:300`, donc **deux
    agrégats à zéro perpétuel**. Les écrans, eux, calculent la réservation
    depuis les BL et vont bien. Non corrigé : le correctif déplace la
    reconnaissance du coût des ventes (comptable) ;
  - **E022 ②** la TVA de 19 % **n'est pas** auto-calculée — sans taux fourni,
    la facture sort à 0 % de TVA. Non corrigé : fiscal ;
  - 2 erreurs de rédaction **corrigées** dans `CLAUDE.md` §2 : la route
    `/quotes/:id/convert-to-invoice` n'existe pas (`/convert`), et le statut
    résultant est `converted`, pas `invoiced` ;
  - l'envoi de courriel **non mesurable** ici (pas de SMTP local) — non
    réfuté, à porter au registre comme non couvert.

  ⚠️ **Trois « ruptures » du premier passage venaient de mon banc, pas du
  produit** (E004) : la facture convertie est rendue sous `data.invoiceCreated`,
  et le client du décor n'avait pas d'adresse électronique. **Le décor a été
  corrigé** — il pose désormais l'adresse, et garantit donc un **état**, pas
  seulement une existence.
- ✅ **B3** `banc-compteurs.py` — E016. Auto-test 10 cas dont 3 chemins absents
  qui ne doivent **pas** valoir 0.
  **11 compteurs vérifiés contre la liste où l'écran les envoie : 11 justes.**
  Le correctif d'E016 tient. Source de l'attendu : `DashboardPage.tsx`, champ
  `vers:` — l'écran, pas le service qui produit le chiffre.
  Deux rouges : les compteurs `reserved` à zéro perpétuel (E022 ①).
  **Corrigé au passage (R022)** : `alerts.unpaidInvoicesCount` et
  `unpaidInvoicesTotal` étaient servis sans plus aucun appelant nulle part —
  retirés, avec la clé `dashboard.unpaidInvoices` dans les deux langues.

  ⚠️ **E015 n'a PAS été redoublée.** `scripts/verifier-comptabilite.js` la
  couvre déjà — identité comptable *et* bornes de plausibilité — en appelant le
  vrai service. En écrire une seconde version créerait deux contrôles qui
  doivent s'accorder entre eux (M5) ; le jour où ils divergent, aucun des deux
  n'a raison. **Lancé, vert** : marge 38,58 %, net 22,02 %.

### B4–B7 — déjà couverts, sauf un. Analyse du 2026-08-09

La file d'origine supposait quatre bancs à écrire. Trois existent déjà à
l'étage 1, et les écrire à nouveau serait du M5 :

| Item | Couvert par | Constat |
|---|---|---|
| ~~**B5** E010, le PDF contient le QR~~ | `verifier-gabarit-pdf.js` | c'est **exactement** le défaut qui l'a fait naître — « le champ existe » ≠ « le champ est rendu » |
| ~~**B6** E001, archivage par locataire~~ | `verifier-securite.js` | couvre gardes **et** chemins d'archive |
| ~~**B7** E017, le stock ne ressuscite pas~~ | `verifier-production.js` | **lancé, vert** : « un recalcul ultérieur ne ressuscite pas la quantité consommée » |

- ✅ **B4** `banc-dates.py` — E007, **la classe et non le symptôme**.
  Auto-test 11 cas dont 6 qui doivent refuser.
  31 dates envoyées puis relues, 9 familles de documents, 4 bords (le 31 d'un
  mois de 31, le 1er mars, le 1er janvier — qui change d'**année** —, le
  31 décembre).

  **Premier passage : 28/31. Trois dates reculaient d'un jour.**
  **E007 était toujours vivant, à deux endroits jamais portés :**
  - `PurchasesService.findOneVendorBill` — `SELECT vb.*` : `billDate` **et**
    `dueDate` d'une facture fournisseur au 31/01 rendues au 30/01, échéance
    comprise ;
  - `RecurringInvoicesService.creer` — `RETURNING *` : **dans le module même
    où le défaut avait déjà été corrigé deux fois**. La liste et la génération
    lisaient en texte ; la réponse de création, non. L'abonnement était créé au
    31, listé au 31, et annoncé au 30 — invisible à qui recharge la page.

  **Corrigé** (remède déjà établi dans le dépôt : colonnes `date` lues en
  texte) → **31/31**. Le banc a trouvé le défaut puis est passé au vert : pas
  besoin de mutation pour prouver qu'il sait dire non.

  ⚠️ Le banc **annonce le fuseau du poste** et prévient qu'à UTC+0 son vert ne
  prouve rien — un contrôle qui ne peut pas échouer n'a rien montré (R030).

  Note : `verifier-periodes.js` reste complémentaire — il éprouve
  l'**arithmétique** des périodes sur des chaînes ; celui-ci éprouve le
  **chemin** de lecture. Le premier passait au vert pendant que le second
  échouait.

### C — Étape 6, réparation de la suite Playwright

- ✅ **C1** inventaire fait. **34 sélecteurs** liés au libellé, ~15 libellés
  distincts — beaucoup moins que les 87 comptés au premier grep, qui incluait
  des `getByRole` structurels. Deux motifs sont des **numéros de document**
  (`/BL-\d{2}-\d{3}/`) : de la donnée, pas du texte traduit — ils **doivent
  rester**, c'est précisément ce que M6 recommande de viser.

- ✅ **C4 (mécanisme)** `e2e/tests/langue.ts` + `e2e/tests/base.ts`.
  - `t(cle)` lit **le catalogue de l'application** sur disque, avec son repli
    `ar → fr` identique à `createI18n`. Il **lève** sur une clé inconnue : un
    `t()` qui rendrait la clé ferait chercher « invoices.new » à l'écran —
    M6 déplacé d'un cran, pas corrigé. *(Il m'a d'ailleurs arrêté sur une clé
    que j'avais inventée, `reports.taxSummary`.)*
  - `base.ts` étend le `test` de Playwright avec un `addInitScript` qui pose
    `localStorage.langue` **avant** le chargement — `langueInitiale()` la lit au
    démarrage, l'écrire après n'aurait aucun effet. **Les 24 fichiers** passent
    par lui, y compris ceux sans sélecteur converti : sinon ils tourneraient en
    français pendant un passage arabe.
  - **Vu refuser** : `addInitScript` neutralisé ⇒ le passage arabe échoue sur
    3 tests. Le mécanisme est réel, pas décoratif.
  - Un test dédié vérifie `<html dir>` **et** un libellé traduit — deux
    vérifications qui échouent pour des raisons différentes.

  `LANGUE=ar npx playwright test` — la suite tourne dans les deux langues.

- ✅ **C2** conversion terminée, en **trois passes** — et les deux dernières
  n'existent que parce que la première se croyait complète :
  1. **34 sélecteurs `/regex/i`** → `tRegex('cle')` ;
  2. **34 sélecteurs par chaîne** (`getByText('Total HT')`) → `t('cle')`. Ma
     première regex ne visait que les littéraux `/…/` ; ils expliquaient
     l'essentiel des 22 échecs propres à l'arabe ;
  3. **3 libellés passés en ARGUMENTS** à une fonction d'aide
     (`telecharger(page, 'Exporter les factures', …)`) et un sélecteur CSS
     (`button[title="Télécharger PDF"]`) — invisibles à toute regex portant sur
     l'appel Playwright.

  > Chaque passe se croyait exhaustive. Ce qui a tranché n'est pas la
  > relecture, c'est **le compte d'échecs propres à l'arabe** : 22, puis 3,
  > puis 0. Un dénominateur mesuré vaut mieux qu'une conviction.

  Les clés ambiguës — six libellés portés par plusieurs clés — ont été
  tranchées **par l'écran qui les affiche**, jamais par le premier candidat du
  catalogue.

  ⚠️ **Deux motifs restent volontairement non convertis** : les numéros de
  document (`/BL-\d{2}-\d{3}/`). C'est de la **donnée**, pas du libellé — et
  c'est précisément ce que M6 recommande de viser.

- ✅ **C3** décor séparé. `19-detail:88` cherchait sa facture **sur la première
  page** de la liste — vingt lignes sur mille — et les tests qui tournaient
  avant lui l'en chassaient. M7 (la pagination) aggravé par M8.

  Remède exactement celui que la méthode prescrit : **filtrer par la recherche
  plutôt que défiler**. Elle interroge le serveur, la pagination disparaît du
  problème.

  Deux ajouts pour cela :
  - **le décor pose la paire BL → facture** dans les deux locataires, sur un
    **second** BL : convertir le premier le ferait passer en « facturé » et
    priverait le banc des cycles de vie de son point de départ ;
  - **`e2e/tests/decor.ts`** — les parcours écran lisent désormais le **même
    manifeste** que les bancs HTTP. Deux sources de vérité auraient fini par
    diverger. Absent, il **arrête** le test au lieu de le laisser chercher au
    hasard.

  **85 → 86 passés, dans les deux langues.**

### ⚠️ **E024** — l'orchestrateur a fait son travail dès son premier vrai passage

En posant la paire BL → facture, le décor a fait rougir un **quatrième**
contrôle : `verifier-comptabilite.js`, sur « toutes les lignes portent un coût
figé » — 3 lignes sur 3 558.

La cause : `DeliveriesService.createInvoice` écrit ses propres lignes de
facture, dans un autre service, **sans `unitCost`**. Ces lignes comptaient pour
un coût **nul** ⇒ marge brute de 100 % sur toute facture créée depuis un BL.
**C'est E015, par une autre porte, trois mois après sa correction.**

L'ironie est dans le commentaire de `SalesInvoicesService`, qui annonce le
risque et **compte trois chemins** — le quatrième n'étant pas dans le fichier
qu'il lit. C'est M13.

> C'est précisément ce que l'orchestrateur permet de dire : *« tout autre rouge
> est une régression »*. Sans lui, le contrôle de comptabilité serait resté
> hors de vue jusqu'au prochain passage manuel.

⚠️ **Et une maladresse de ma part, consignée dans E024** : j'ai lancé un
`DELETE` sur des lignes de facture pour « nettoyer » avant de mesurer — quatre
factures se sont retrouvées sans lignes. Reconstruites depuis leur BL ; aucune
donnée de démonstration touchée, vérifié avant et après. *Devant une donnée qui
gêne une mesure : la corriger ou restreindre la mesure, jamais la supprimer.*

### ⚠️ Trouvé au passage — `verify:i18n` ne voit pas où il dit regarder

Il annonce « aucune chaîne française en dur dans le client » et passe au vert.
Mesuré : **17 chaînes françaises en dur** hors de son champ.

```
placeholder="P.U. HT"        ×4   invoices, quotes, deliveries, credit-notes
placeholder="TVA%"                credit-notes
placeholder="Description"         credit-notes
placeholder="N° lot"              purchases
placeholder="Directeur, Comptable…"  ×2   customers, suppliers
placeholder="Produits laitiers"   products
placeholder="Description optionnelle…"  production
label: 'CA HT' 'CA TTC' 'Valeur stock' 'En attente' 'Factures' 'Date'
```

C'est la forme de **M1** : un contrôle qui dit oui sans regarder partout où il
prétend regarder. Il inspecte le texte des nœuds JSX ; un libellé passé en
**attribut** (`placeholder=`, `title=`) ou en **propriété d'objet**
(`label: '…'`) lui échappe.

**Conséquence concrète :** en arabe, ces dix-sept libellés restent en français.
La suite Playwright ne les voit pas non plus — aucun test ne les vise.

✅ **C6 fait.** Le trou n'était pas dans la **collecte** — `placeholder="…"`
était bien lu — mais dans le **filtre** : il ne retenait que les chaînes portant
un **accent** ou figurant dans une liste de trente mots. Tout le français sans
accent lui échappait : « P.U. HT », « Valeur stock », « Factures »,
« En attente », « Date ». Et `label: '…'` — propriété d'objet, apostrophes
simples — n'était pas collecté du tout.

**Deux corrections au vérificateur :**

1. la collecte accepte `[:=]` et les deux sortes de guillemets — les libellés
   posés en propriété d'objet entrent dans le champ ;
2. **une troisième raison de refuser, qui ne devine rien** : *la chaîne
   figure-t-elle, mot pour mot, dans `fr.json` ?* Si oui, c'est un libellé
   traduisible resté dans le code, quelle que soit son allure. **Un fait, pas
   une ressemblance** — et zéro faux positif.

> Les deux premières règles demandent « cette chaîne **a-t-elle l'air**
> française ? ». La troisième demande « cette chaîne **est-elle** un libellé du
> produit ? ». La seconde question a une réponse ; la première n'en a qu'une
> approximation.

**14 libellés** ainsi trouvés, tous « déjà dans fr.json », tous portés au
catalogue avec la clé que le catalogue avait déjà. **Vu refuser** sur une
mutation de la forme même qui lui échappait (`label: 'Factures'`).

⚠️ **Ce que la nouvelle règle ne voit toujours pas** : le français qui n'est
**nulle part** dans le catalogue — « P.U. HT », « Produits laitiers »,
« Directeur, Comptable… ». Sans accent et sans entrée à comparer, rien ne le
distingue d'une chaîne technique. C'est une limite de forme, pas un oubli :
elle est écrite ici pour être une décision.

- ✅ **C5 — le défaut fondateur du chantier, corrigé** (**E023**).
  Les 17 échecs ont été triés. **Huit d'entre eux étaient le même défaut** :
  `<form>` dans `<form>`, sur les quatre modales de création de document.
  `BandeauScan` portait son propre `<form>` et était rendu à l'intérieur du
  formulaire du document.

  ⚠️ **Il a fallu trois pas pour le nommer**, et aucun n'était évitable :
  ① la suite disait « erreurs console : 2 », sans plus ; ② `msg.text()` rend le
  **gabarit** React (« In HTML, %s cannot be a descendant of <%s> ») — il a
  fallu lire `msg.args()` ; ③ **et surtout vérifier que l'imbrication était
  RÉELLE.** Le `Modal` s'appuie sur `Dialog.Portal`, qui rend dans `body` : la
  conclusion « faux positif du portail » était plausible, confortable et
  fausse. `document.querySelectorAll('form')` a tranché —
  `body > div > form > div > form`. C'est E004.

  Corrigé : `BandeauScan` est un `<div>`, Entrée traitée par `onKeyDown` avec
  `stopPropagation()`, bouton en `type="button"`. **Ce que ça cassait :** Entrée
  dans le champ de scan pouvait **enregistrer le document** au lieu d'ajouter
  une ligne.

### Où en est la suite Playwright — mesuré, pas supposé

| | passés | échoués |
|---|---|---|
| **ligne de base** (avant toute conversion) | 78 | **17** |
| après conversion, français | 77 | 18 |
| après conversion, arabe | 55 | 40 |
| après correction d'E023, français | 85 | 10 |
| après correction d'E023, arabe | 63 | 32 (dont 22 propres à l'arabe) |
| **conversion terminée, français** | **85** | **10** |
| **conversion terminée, arabe** | **85** | **10** — dont **0 propre à l'arabe** |

> **La suite se comporte à l'identique dans les deux langues.** C'était l'objet
> de l'étape 6, et c'est tenu. Les dix échecs restants sont les mêmes des deux
> côtés : ils ne dépendent pas de la langue, ils sont antérieurs au chantier.

**Ma conversion n'a introduit aucune régression** : le 18ᵉ échec français est
`19-detail:88`, le test dépendant de l'état ci-dessus — il passe en isolation.
Vérifié en rejouant la suite d'origine, plutôt qu'en le supposant (E004).

⚠️ **La suite échouait déjà sur 17 tests sur 95 avant ce chantier.** Le
`CHANTIER_TESTS.md` annonçait « 8 passés, 1 échoué » d'après un sondage sur deux
fichiers ; sur les 24, c'était 78/17.

**Les 17 sont triés.** Huit étaient E023, corrigé. Les **dix restants**, tous
antérieurs au chantier, en trois familles :

| Famille | Tests | Forme |
|---|---|---|
| `locator('select')` introuvable | `05:35` `09:14` `18:52` `19:29` | l'écran n'a plus de `<select>` natif — **tests périmés par la refonte visuelle** |
| dépendance à l'état | `19:88` | passe seul, échoue après les autres (R030 / M8) — c'est **C3** |
| divers, un par un | `03:27` `08:42` `09:24` `10:40` `17:5` | 400 sur `POST /expenses` (`supplierId must be a UUID` sur une chaîne vide), `<dialog>` absent à l'édition d'un fournisseur, `/Ajouter/i` résout **2 éléments**, `input[type=email]` introuvable |

Aucun de ces dix n'est trié plus avant. Ils sont nommés ici pour que l'absence
soit une décision.

**22 tests passent en français et échouent en arabe.** Concentrés sur
`20-partners` (5), `16-settings` (3), `22-numbering` (3),
`21-purchase-detail` (3), `18-export` (2), `13-purchases-flow` (2),
`19-detail` (2), `23-documents` (1), `24-stock-availability` (1).

### D — Étape 7, orchestrateur

- ✅ **D1** `scripts/run-all-scenarios.sh` — **11 contrôles, 235 s**, tableau
  final, sans `set -e`, temporisation et détection du 429, ordre justifié
  entrée par entrée (`--liste` l'imprime).

  Quatre principes d'ordonnancement : le décor d'abord (il écrit le manifeste
  que tout le reste lit) · ce qui n'écrit rien ensuite · **ce qui LIT des
  agrégats avant ce qui écrit** — sinon les compteurs et les bornes de
  plausibilité bougent sous eux · ce qui écrit en dernier, et dans le locataire
  de test seulement.

  Deux écarts assumés par rapport au squelette :
  - **la commande unique existe** — `--tout` ajoute la chaîne statique. Le
    squelette annonçait « il n'existe pas de commande unique “tout est vert” —
    limite connue de la méthode ». Elle n'avait pas lieu d'être ici ;
  - **contrôle de vie de l'API avant de commencer.** Sans lui, dix contrôles
    échouent en dix minutes et le tableau dit « tout est cassé » là où la vraie
    phrase est « le serveur n'est pas lancé ».

  Le tableau nomme les **rouges attendus** (E021, E022) : les taire les ferait
  oublier, les compter comme des échecs ordinaires noierait les vrais.

  ⚠️ **N'inclut pas `e2e/`** : la suite Playwright désigne ses cibles par le
  libellé français et échouerait en arabe pour une raison sans rapport avec un
  défaut (M6). L'inclure avant l'étape 6 rendrait le tableau menteur.

  **Corrigé au passage** : `verifier-comptabilite.js` choisissait son locataire
  par `LIMIT 1` **sans `ORDER BY`**. Anodin avec un seul locataire ; devenu un
  tirage au sort depuis que le décor en pose un second — et tomber sur le
  locataire de test aurait fait juger les bornes de plausibilité sur trente
  factures fabriquées par les bancs. Il prend désormais celui qui porte le plus
  de factures, et accepte `TENANT_ID`. **Fragilité introduite par le décor,
  donc de mon fait.**

### E — Étape 8, registre de couverture

- ✅ **E1** `CHANTIER_TESTS.md` §8 réécrit à la clôture : couverture décomposée
  banc par banc, les **trois rouges assumés** avec ce qui bloque leur décision,
  **onze absences nommées**, et le relevé des **sept défauts produit** + **trois
  défauts d'outillage** trouvés par le chantier.
  §1 remis à jour (R031) : les deux fragilités qu'il annonçait sont levées.

---

## 4. Chantier clos — 2026-08-09

Les huit étapes sont faites. **Une commande rejoue tout** :
`./scripts/run-all-scenarios.sh --tout` — 11 contrôles, ~4 minutes.

**8 verts, 3 rouges — les trois assumés**, nommés par le tableau final
(E021, E022 ①, E022 ②). *Tout autre rouge est une régression.*

### Ce qui reste au produit, et à lui seul

| # | Décision | Où |
|---|---|---|
| 1 | **E021** — une facture émise rouverte et réécrite sous le même numéro. Trois correctifs plausibles, tous à conséquence fiscale | `docs/ERREURS.md` |
| 2 | **E022 ②** — la TVA de 19 % n'est pas auto-calculée | idem |
| 3 | **E022 ①** — l'état `reserved` que rien n'écrit, et deux agrégats à zéro perpétuel | idem |
| 4 | **E024** — deux créateurs de facture coexistent ; le vrai remède est qu'il n'y en ait qu'un | idem |
| 5 | Les **trois écarts de rôles** relus en §0 : l'agent ne convertit ni n'expédie ; il crée un devis sans pouvoir l'éditer ; le manager annule un règlement | `02-auth.md` |
| 6 | Les **9 échecs Playwright** restants — 4 tests périmés, 5 divers, triés et nommés | §2 ci-dessus |

### Ce qu'il faudrait faire ensuite, par valeur décroissante

1. **trancher les quatre défauts ouverts** — trois des bancs restent rouges tant
   que ce n'est pas fait, et un banc rouge en permanence finit par ne plus être
   lu ;
2. **écrire les cycles de vie manquants** (avoir, ordre de fabrication, facture
   fournisseur) — il n'y a aujourd'hui rien contre quoi les comparer ;
3. **réparer ou retirer les 9 tests Playwright** en échec ;
4. **brancher l'orchestrateur sur un déclencheur** — il ne sert qu'autant qu'on
   le lance.

---

## 2. Ce qui est déjà en place (ne pas refaire)

| Outil | État | Auto-test |
|---|---|---|
| `scripts/provision-decor.sh` | 2 locataires, 5 personas ×2, 23 familles ×2 | rejouable, 0 création |
| `scripts/banc-refus-http.py` | 169 routes, 481 sondes, **vert** | 26 cas dont 10 de refus |
| `scripts/banc-cloisonnement.py` | 98 routes à paramètre, 91 sondées, **vert** | 14 cas dont 4 de refus |
| `scripts/banc-matrice-roles.py` | 159 × 5 = 795 sondes, **vert** depuis l'arbitrage A1–A3 | 46 cas dont 4 de refus |

Défauts trouvés et corrigés : **E018** (clés de refus non traduites — 21 clés
ajoutées au total), **E019** (parent non vérifié sur deux lectures), **E020**
(politique de permissions à 3 rôles pour un produit qui en a 5).

**Les trois bancs sont verts.** Ce qui suit — les bancs métier — n'a plus de
frontière ni de cloisonnement à supposer : les deux sont éprouvés.

---

## 3. Pièges de cet environnement — déjà payés deux fois

- **Les heredocs passés à `wsl.exe` cassent sur les apostrophes françaises.**
  Écrire un fichier, le copier dans WSL, l'exécuter. Payé deux fois.
- **Une écriture depuis Windows retire le bit exécutable** — `chmod +x` après
  chaque `Write` sur un script.
- **`git status` peut afficher `M` sur un fichier identique à HEAD** après un
  aller-retour de mutation. Vérifier avec `cmp`, puis `git checkout --`.
- **`npx tsc --noEmit` à la racine compile `mobile/` et `shared/`** et rend des
  erreurs qui ne concernent pas le backend. Le vrai contrôle est `npm run build`.
- **Node 22 obligatoire** : `nvm use 22` avant tout `npm run`.
- **Ne jamais tuer les serveurs de l'utilisateur** (3000, 5173).
- Une **mutation** de test peut laisser des données : les nettoyer, puis
  rejouer le décor et vérifier `créations=0`.
