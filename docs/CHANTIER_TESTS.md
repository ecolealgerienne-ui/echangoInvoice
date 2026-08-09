# Chantier — tests fonctionnels exhaustifs

> **Objectif.** Éprouver le logiciel de bout en bout, et disposer d'une suite
> rejouable à chaque évolution. Ce document est le point de départ : il donne
> l'état réel au 2026-08-09, la surface à couvrir avec son dénominateur, et
> l'ordre de travail.
>
> La doctrine — comment écrire un test qui prouve quelque chose — est dans
> **`docs/METHODE_TEST.md`**. Le lire avant d'écrire la première ligne.

---

## 1. Ce qui existe déjà

Ne pas repartir de zéro : trois choses sont en place, et deux sont solides.

### Étage 1 — 14 vérificateurs statiques

`npm run verify` en enchaîne **dix** qui ne dépendent de rien :

```
securite · conformite · tri · periodes · codes-barres · signature
echeances · gabarit-pdf · i18n · design
```

**Quatre autres exigent la base ou un navigateur**, et sont donc hors de la
chaîne — à lancer à la main :

```bash
node scripts/verifier-comptabilite.js       # base
node scripts/verifier-production.js         # base
node scripts/verifier-pdf-achats.js         # base
node scripts/verifier-contraste.js http://localhost:5173 dark    # + serveur web
node scripts/verifier-contraste.js http://localhost:5173 light
```

### Étage 4 — 24 fichiers Playwright dans `e2e/`

Ils tournent, et ils trouvent des choses. **Sondés le 2026-08-09** sur deux
fichiers : **8 tests passés, 1 échoué** — et l'échec était réel, pas un test
périmé : une erreur console React `<form> cannot contain a nested <form>` sur la
modale de création de facture. Introduite par la refonte visuelle, invisible à
l'œil, invisible à la compilation.

**C'est l'argument de ce chantier en une phrase.** Une suite qu'on rejoue trouve
ce qu'aucune relecture ne voit.

⚠️ **Deux fragilités connues de cette suite** — voir M6 et M8 dans la méthode :

- elle désigne presque tout **par le libellé français** (`getByRole('button',
  { name: /nouvelle facture/i })`). L'application est bilingue depuis ; ces
  tests échoueront en arabe pour une raison sans rapport avec un défaut ;
- au moins un fichier (`07-purchases`) dépend de l'état laissé par les
  précédents — le `CLAUDE.md` le consigne sous R030.

### Étage 3 — rien

**C'est le cœur du chantier.** Aucun banc HTTP n'existe.

### Étage 2 — rien

Pas de tests unitaires ni de harnais. Les fonctions pures (`montant-en-lettres`,
`droit-de-timbre`, `echeance`, `codes-barres`) sont éprouvées par des
vérificateurs maison qui en font office. À réexaminer, sans urgence.

---

## 2. Ce que « exhaustif » veut dire, avec son dénominateur

« Exhaustif » n'est pas vérifiable sans un total. Voici la surface mesurée au
2026-08-09 — **chaque axe doit finir avec sa décomposition complète**, jamais un
pourcentage seul.

| Axe | Dénominateur | Couvert aujourd'hui |
|---|---|---|
| **Routes HTTP** | **169** sur 32 contrôleurs | 0 en banc |
| dont routes à identifiant | **91** | 0 |
| dont routes sans garde | **3** — toutes épinglées R023 | — |
| **Rôles** | 5 : `owner` `manager` `agent` `accountant` `superadmin` | 0 |
| **Écrans** | **37** routes React | ~15 touchés par Playwright |
| **Clés d'affichage** | **1077**, fr et ar | parité tenue par `verify:i18n` |
| **Cycles de vie** | facture, devis, BL, avoir, commande, réception, facture fournisseur, ordre de fabrication | partiels |

### Les six axes d'exhaustivité, par ordre de coût croissant

**Axe 1 — Frontière.** Les 169 routes × 3 sondes de refus : sans jeton, avec le
jeton d'un autre rôle, avec un jeton expiré. **Automatique** : l'énumération se
fait depuis la source. Critère : 169/169, publiques épinglées, total décomposé.

**Axe 2 — Cloisonnement.** Les 91 routes à identifiant, appelées avec un jeton
valide sur une ressource **d'un autre locataire**. Réponse attendue :
introuvable, jamais la ressource d'autrui. **C'est le banc le plus important de
ce produit** — R020, et la matrice de permissions vit dans chaque service.

**Axe 3 — Matrice des rôles.** Chaque route × chaque persona : autorisé ou
refusé, conformément à `@Roles`. Attention à **M11** : énumérer les routes
depuis *toutes* les routes, jamais depuis les décorateurs qu'on contrôle.

**Axe 4 — Cycles de vie.** Chaque document, du brouillon à l'état terminal, avec
les transitions **interdites** éprouvées aussi : payer une facture annulée,
livrer un BL déjà facturé, clôturer un ordre non démarré. Un cycle de vie n'est
couvert que si ses refus le sont.

**Axe 5 — Règles de calcul et effets de bord.** Les six effets obligatoires du
`CLAUDE.md` §2 — réception → lot + inventaire, BL → FIFO, paiement → soldes et
statut, devis → facture, etc. Et les identités comptables (voir M12).

**Axe 6 — Écrans.** Les 37 routes ouvertes, dans **les deux langues** et **les
deux thèmes**, avec zéro erreur console. C'est ce qui a attrapé le `<form>`
imbriqué.

---

## 3. Ordre de travail

Chaque étape a un critère de sortie vérifiable.

| # | Étape | Squelette | Critère de sortie |
|---|---|---|---|
| 1 | **Décor** — comptes, second locataire, données de référence | `docs/methode-test/provision-decor.sh` | idempotent, identifiants stables, imprime la commande de test, rejouable deux fois de suite |
| 2 | **Banc de frontière** | `docs/methode-test/banc-refus-http.py` | 169/169 énumérées, publiques épinglées, `--self-test` avec cas de refus |
| 3 | **Banc de cloisonnement** | *aucun — à écrire* | 91/91, décomposition publiée |
| 4 | **Matrice des rôles** | dérivé du banc de frontière | 169 × 5, exclusions nommées |
| 5 | **Bancs métier** | un par entrée de `docs/ERREURS.md` | chaque banc cite en tête le défaut qui l'a fait naître |
| 6 | **Réparation de la suite Playwright** | — | `data-testid` partout, décor séparé, passe en fr **et** en ar |
| 7 | **Orchestrateur** | `docs/methode-test/run-all-scenarios.sh` | tableau final lisible, ordre des bancs justifié en commentaire |
| 8 | **Registre de couverture** | — | un total avec sa décomposition par axe |

**Ne pas commencer par le 5.** Les bancs métier sont les plus coûteux et les
plus spécifiques ; on sait lesquels écrire seulement une fois le reste en place.

---

## 4. Les bancs métier à écrire — la liste est déjà rédigée

`docs/ERREURS.md` contient **17 entrées**. Chacune décrit un défaut qui a
traversé tous les contrôles en place à ce moment-là. C'est la meilleure
population de tests qui soit, parce qu'elle est constatée et non imaginée.

Les plus instructives, et ce qu'un banc doit en éprouver :

| Entrée | Le défaut | Ce que le banc doit prouver |
|---|---|---|
| **E017** | production consommant hors lots ; le stock consommé **ressuscitait** trois gestes plus tard | réception → production → livraison : l'agrégat ne remonte pas |
| **E015** | marge brute à 96,83 % — formule juste sur la mauvaise grandeur | `marge = CA − coût des ventes`, plus des **bornes de plausibilité** |
| **E016** | compteur d'alerte ne correspondant à aucune liste filtrée | chaque compteur du tableau de bord = le total de sa liste |
| **E007** | `date` lue en local-midnight : un jour perdu au dernier jour d'une période | totaux de période au 31 du mois, en UTC+1 |
| **E010** | champ généré, transmis, déclaré — jamais rendu | le PDF **contient** le QR et le code-barres |
| **E001** | archivage PDF sans isolation de locataire | deux locataires, deux arborescences |
| **E008** | `UPDATE … RETURNING` rendant `[rows, affected]` | la bascule rend un objet, pas une liste |

Les dix autres sont dans le document.

---

## 5. L'environnement, tel qu'il est

Détail complet dans `CLAUDE.md` §10. L'essentiel pour ce chantier :

| | |
|---|---|
| Code | **WSL** — `~/projects/echangoinvoice/echangoInvoice` |
| Node | **22** obligatoire : `nvm use 22` avant tout `npm run` |
| API | `http://localhost:3000/api/v1` — `npm run start:dev` |
| Client | `http://localhost:5173` — `npm run dev` dans `client/` |
| Base | PostgreSQL en conteneur, port **5434** |
| Comptes | `admin@` `manager@` `agent@` `chambre-froide.dz` — voir §10 |
| Superadmin | login **séparé** sur `/admin/auth/login` |

**Jeu de démonstration en place** : 301 clients, 1007 factures, 803 BL, 31
fournisseurs. De quoi écrire des scénarios réalistes sans rien fabriquer — mais
**pas** de quoi se dispenser d'un décor : un banc ne doit jamais dépendre de
données qu'il n'a pas posées.

⚠️ **Un seul locataire existe aujourd'hui.** Le banc de cloisonnement en exige
un second : c'est la première chose que le décor doit poser.

---

## 6. Les pièges déjà payés — ne pas les repayer

- **`npx tsc --noEmit` depuis `client/` ne vérifie rien** (`"files": []`). La
  commande est `npx tsc --noEmit -p tsconfig.app.json`.
- **Un serveur Vite démarré avant un changement de `tailwind.config.ts` sert un
  CSS périmé.** Redémarrer, sinon on diagnostique un défaut qui n'existe pas
  (E013).
- **`commande | tail && echo $?`** relève le code de `tail`. Utiliser
  `${PIPESTATUS[0]}` (M10, R025).
- **`/auth/login` est rate-limité.** Identifiants stables, temporisation par
  défaut, et détecter le `429` pour ne pas le compter comme un échec métier (M9).
- **Les heredocs passés à `wsl.exe` cassent sur les apostrophes françaises.**
  Écrire un fichier, puis l'exécuter.
- **Ne jamais tuer les serveurs de l'utilisateur** (3000, 5173) : lancer les
  siens sur d'autres ports.

---

## 7. Ce que ce chantier ne couvrira pas

À écrire dans le registre de couverture, pour que l'absence soit une décision et
non un oubli :

- **la charge** — rien ne dira ce qui se passe à cinquante utilisateurs ;
- **le rendu visuel** — le contraste se mesure, pas la mise en page ; une carte
  qui déborde reste invisible ;
- **les PDF chez le destinataire** — on vérifie le HTML composé et les objets
  image, pas ce que voit un comptable dans Acrobat ;
- **la conformité fiscale réelle** — le barème du droit de timbre attend
  confirmation par un comptable, aucun test ne la remplace ;
- **le mobile Capacitor** — il vit dans le clone Windows, hors de cette suite.
