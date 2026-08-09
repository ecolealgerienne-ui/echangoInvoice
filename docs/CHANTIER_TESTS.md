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

Ils tournent, et ils trouvent des choses. Sondés le 2026-08-09 sur deux
fichiers : 8 tests passés, 1 échoué — et l'échec était réel : une erreur console
React `<form> cannot contain a nested <form>` sur la modale de création de
facture. Introduite par la refonte visuelle, invisible à l'œil, invisible à la
compilation.

**C'est l'argument de ce chantier en une phrase.** Une suite qu'on rejoue trouve
ce qu'aucune relecture ne voit.

> **Et il aura fallu ce chantier pour le corriger.** Ce défaut était encore là
> trois mois plus tard, et il faisait échouer **huit tests** — pas un. Le
> sondage sur deux fichiers ne pouvait pas le savoir : sur les 24, la suite
> était à 78/95. Voir **E023**.

⚠️ **Les deux fragilités annoncées ici étaient réelles, et sont levées** — voir
M6 et M8 dans la méthode, et l'étape 6 :

- ~~elle désigne presque tout par le libellé français~~ → les 71 sélecteurs de
  texte passent par le **traducteur de l'application** ; la suite donne
  **86/95 en français comme en arabe**, sans un seul échec propre à l'arabe ;
- ~~au moins un fichier dépend de l'état laissé par les précédents~~ → le seul
  test concerné filtre désormais par la recherche au lieu de défiler, et lit le
  **même manifeste de décor** que les bancs HTTP.

### Le décor — `scripts/provision-decor.sh` (étape 1, faite le 2026-08-09)

Il pose le **second locataire**, les **cinq personas des deux côtés**, et
**25 familles de ressources dans chacun**. Il écrit `.decor/manifeste.json` :
c'est le contrat entre le décor et les bancs — un banc le lit, il ne devine
rien. Rejoué, il ne crée rien : trois passages de suite, zéro doublon en base.

**Les parcours écran le lisent aussi**, depuis `e2e/tests/decor.ts` : c'est le
même décor, et deux sources de vérité auraient fini par diverger.

Deux défauts trouvés en l'écrivant, tous deux **au second passage** :

- le script lisait le code HTTP dans une variable posée à l'intérieur d'un
  `$( )`, donc jamais visible au retour. Il relisait le `200` du contrôle de
  santé et **n'avait jamais reconnu un seul refus** — un `409` passait pour un
  succès. C'est M1, dans l'outil de test lui-même ;
- le serveur **normalise** les codes-barres (`DECOR-A-CB-001` → `DECORACB001`).
  Le manifeste annonçait la valeur envoyée, que `GET /products/by-barcode/:code`
  ne connaît pas : un banc l'aurait lue, aurait reçu 404, et aurait accusé la
  route.

**Aucun des deux n'était visible au premier passage.** C'est ce que « rejouable
deux fois de suite » achète.

### Étage 3 — un banc sur trois (étape 2, faite le 2026-08-09)

`scripts/banc-refus-http.py` — **169 routes énumérées depuis la source**, 481
sondes. Décomposition, à relire à chaque passage :

```
169 routes = 161 protégées + 8 ouvertes, toutes épinglées dans R023

  sans jeton     161 / 161 refusées (401)
  autre rôle     159 / 159 refusées (403)   2 exclues, épinglées nommément
  jeton expiré   161 / 161 refusées (401)

  403 portant une clé que l'interface sait traduire   159 / 159
```

**La frontière tient — aucun défaut d'accès.** Ce n'est pas le résultat qu'on
attendait d'un premier banc, et c'est un vrai résultat : il a été vu refuser,
sur une mutation du code réel (`@UseGuards` retiré de `settings.controller.ts`
⇒ « 2 routes OUVERTES non épinglées : GET /settings, PUT /settings »).

**Trois défauts trouvés quand même**, aucun dans le contrôle d'accès :

- **E018** — les cinq clés de refus des gardes n'existaient dans **aucune** des
  deux langues. Les 159 refus s'affichaient « une erreur est survenue ».
  `verify:i18n` ne pouvait pas le voir : il compare fr ↔ ar, et elles
  manquaient des deux côtés — parfaitement paritaires. Corrigé ;
- **`POST /auth/accept-invite` était publique sans être épinglée** dans R023,
  dont la règle propre est qu'une route publique non listée est un défaut. La
  boucle `grep -L UseGuards` qui y tenait lieu de contrôle ne regardait que le
  fichier : un contrôleur gardé sur neuf routes et oublié sur la dixième la
  satisfaisait. Remplacée par le banc ;
- **R023 annonçait un plafond de 100/min**, la configuration en pose 600 —
  relevé en calibrant le rythme des sondes (R031).

Et un dans le banc lui-même, trouvé au premier passage réel : les vingt sondes
`DELETE` partaient avec `Content-Type: application/json` sans corps, que
Fastify refuse en **400 avant tout garde**. Elles ne mesuraient que l'analyseur
de corps. Un 400 compté comme un refus aurait annoncé vingt routes éprouvées
sans en avoir touché une.

### Le cloisonnement — `scripts/banc-cloisonnement.py` (étape 3, faite le 2026-08-09)

Le jeton est **valide**, le rôle est **owner**, seule la ressource nommée
appartient à quelqu'un d'autre.

```
98 routes à paramètre = 91 sondées + 7 écartées, chacune nommée

  refusé (404 / 403)          91 / 91
  FUITE                        0
  accepté sans rien rendre     0
  non concluant (400 / 422)    0

  fuite par les exports        0 / 15 jeux de données
```

**Le cloisonnement tient.** Deux défauts trouvés et corrigés (**E019**) : deux
lectures filtraient bien la collection d'enfants par locataire mais ne
vérifiaient jamais que le **parent** était au demandeur — `200 { data: [] }` là
où le contrat dit « introuvable ». Aucune donnée ne sortait ; c'est la forme qui
en laisse sortir le jour où le filtre bouge.

**Ce banc a été vu détecter une fuite**, sur mutation du vrai code (`tenantId`
retiré du `where` de `CustomersService.findOne`) :

```
❌ 2 FUITE(S) — des données du locataire B sont sorties :
   GET  /customers/:id          → 200 : 24d3cbd8…, 364e6f07…, DECOR-B
   POST /customers/:id/contacts → 201 : 364e6f07…
```

La seconde ligne est la leçon : muter une **lecture** a ouvert une **écriture**
chez le voisin, `createContact()` s'adossant à `findOne()` pour vérifier
l'appartenance. Une vérification partagée propage sa défaillance à tout ce qui
s'y appuie.

⚠️ Ce banc appelle des routes de suppression et de modification avec des
identifiants d'autrui. Si le cloisonnement tient, elles répondent 404 et rien ne
bouge. Sinon, il l'aura prouvé **en abîmant le décor** — qui se repose en un
passage. C'est le prix d'une sonde qui peut réellement dire non.

### La matrice des rôles — `scripts/banc-matrice-roles.py` (étape 4, faite le 2026-08-09)

159 routes × 5 personas = **795 sondes**, comparées non pas à `@Roles` — ce
serait comparer le code à lui-même (M2) — mais à la **politique écrite** de
`docs/specs/02-auth.md`, qui n'a jamais été dérivée du code.

```
owner        159 / 159 conformes
superadmin   159 / 159 conformes
manager      147 / 159       12 écarts
agent        103 / 159       56 écarts
accountant     —             aucune politique écrite ne le mentionne
```

**68 écarts, et le code n'est pas fautif dans la plupart des cas** : c'est le
document qui ne dit plus ce que le produit fait. Une politique écrite comme un
tableau binaire *rôles × capacités* ne peut pas décrire une implémentation qui
décide route par route. Détail dans **E020**.

Ce qui doit être arbitré, par ordre d'urgence :

1. **Trois écarts bloquent un utilisateur** — la politique promet à l'agent de
   créer factures et BL ; le code lui refuse `create-invoice` et les deux
   `send-email`. Ce sont les seuls des 68 qui empêchent quelqu'un de faire son
   travail ;
2. **`accountant` n'existe dans aucun document** — 67 routes, toutes en
   lecture, aucune écriture. Politique cohérente, protégée par rien ;
3. **65 écarts où le code accorde plus que le tableau** — l'agent lit les
   45 routes de consultation de tous les modules, le manager supprime neuf
   objets secondaires. Probablement voulu ; nulle part écrit.

La grille complète est publiée : `docs/methode-test/matrice-roles-observee.md`,
159 routes × 5 personas, groupée par module. **Une fois arbitrée, elle devient
la politique** — et le banc cesse d'être un révélateur pour devenir un détecteur
de régression.

**Vu dire non** : `@Roles('owner')` élargi à `@Roles('owner', 'manager')` sur
`DELETE /customers/:id` ⇒ manager passe de 147 à 146, les écarts de 68 à 69, et
la route est nommée.

⚠️ Ce banc sonde avec un identifiant inexistant et un corps vide : « autorisé »
signifie **« le garde de rôle a laissé passer »**, et rien de plus. Aucune sonde
ne peut modifier de donnée — et aucune ne prouve qu'un rôle autorisé aboutit.

### Étage 3 — ce qui manque encore

Les **bancs métier** (étape 5) : les cycles de vie, leurs transitions
interdites, et les six effets de bord obligatoires. `docs/ERREURS.md` en donne
la liste, déjà rédigée.

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
| **Routes HTTP** | **169** sur 32 contrôleurs | **161 protégées × 3 sondes de refus** (étape 2) |
| dont routes à identifiant | **98** — et non 91 : voir ci-dessous | **91 sondées en cloisonnement**, 7 écartées nommément |
| dont routes sans garde | **8**, toutes épinglées R023 — et non 3 : voir ci-dessous | 8/8 épinglées, contrôlé à chaque passage |

> ⚠️ **Le « 3 » de la première version de ce tableau n'était pas un compte de
> routes** : c'était le compte des *fichiers* sans aucun `@UseGuards`, rendu
> par la boucle `grep -L` que R023 donnait pour contrôle. Les quatre routes
> ouvertes d'`auth.controller.ts` — `login`, `register`, `refresh`,
> `accept-invite` — lui étaient **structurellement invisibles**, puisque ce
> fichier contient `UseGuards` ailleurs. Un contrôle qui compte des fichiers ne
> peut pas répondre à une question qui porte sur des routes.
>
> ⚠️ **Et le « 91 » comptait les routes dont le paramètre s'appelle `:id`.** Il
> y en a 98 qui désignent une ressource par un paramètre. Les sept écartées du
> compte étaient nommées autrement — et ce sont, à deux exceptions près, les
> plus exposées, celles dont l'identifiant est **plat**, sans parent pour le
> porter :
>
> ```
> DELETE /products/barcodes/:barcodeId      GET /price-lists/for-customer/:customerId
> DELETE /products/suppliers/:linkId        GET /products/by-barcode/:code
> GET    /stock/entries/:rawMaterialId      GET /export/:dataset
> PATCH  /stock/inventory/:rawMaterialId/threshold
> ```
>
> `GET /stock/entries/:rawMaterialId` est l'une des deux que le banc a prises
> en défaut (E019). Un dénominateur qui exclut ce qu'on craint le plus ne
> mesure pas grand-chose.
| **Rôles** | 5 : `owner` `manager` `agent` `accountant` `superadmin` | **5/5 sondés sur 159 routes** — mais un seul des cinq, `accountant`, n'a aucune politique écrite (E020) |
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
| 1 ✅ | **Décor** — comptes, second locataire, données de référence → `scripts/provision-decor.sh` | `docs/methode-test/provision-decor.sh` | ~~idempotent, identifiants stables, imprime la commande de test, rejouable deux fois de suite~~ **tenu** — 3 passages, 0 doublon, manifeste identique aux passages 2 et 3 |
| 2 ✅ | **Banc de frontière** → `scripts/banc-refus-http.py` | `docs/methode-test/banc-refus-http.py` | ~~169/169 énumérées, publiques épinglées, `--self-test` avec cas de refus~~ **tenu** — 169/169, 8 publiques épinglées, auto-test 26 cas dont 10 de refus, vu refuser sur mutation |
| 3 ✅ | **Banc de cloisonnement** → `scripts/banc-cloisonnement.py` | *aucun — écrit de zéro* | ~~91/91, décomposition publiée~~ **tenu** — 91/91 refusés, 7 écartées nommées, 15 exports sondés, vu détecter une fuite sur mutation |
| 4 ✅ | **Matrice des rôles** → `scripts/banc-matrice-roles.py` | dérivé du banc de frontière | ~~169 × 5, exclusions nommées~~ **tenu** — 159 × 5 = 795 sondes, 10 exclusions nommées, comparé à la politique **écrite** et non à `@Roles` |
| 5 ✅ | **Bancs métier** → `banc-cycles-de-vie` · `banc-effets-de-bord` · `banc-compteurs` · `banc-dates` | un par entrée de `docs/ERREURS.md` | **tenu** — chacun cite en tête le défaut qui l'a fait naître. Trois entrées se sont révélées **déjà couvertes** par les vérificateurs d'étage 1 : les redoubler aurait été du M5 |
| 6 ▶ | **Réparation de la suite Playwright** | — | ~~`data-testid` partout~~ → **traducteur** (M6 le nomme comme l'exception ; il suit la langue **et** contrôle la clé) · **passe en fr et en ar : 85/95 des deux côtés, 0 échec propre à l'arabe** ✅ · décor séparé : **reste à faire** (1 test dépendant de l'état) |
| 7 ✅ | **Orchestrateur** → `scripts/run-all-scenarios.sh` | `docs/methode-test/run-all-scenarios.sh` | ~~tableau final lisible, ordre des bancs justifié en commentaire~~ **tenu** — 11 contrôles en 235 s, `--liste` imprime l'ordre et ses raisons, `--tout` ajoute la chaîne statique |
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

**Deux locataires depuis le 2026-08-09**, posés par `scripts/provision-decor.sh` :

| | Locataire A | Locataire B |
|---|---|---|
| Nom | Chambre Froide Djelfa (seed) | Decor Cloisonnement SARL |
| Comptes | `admin@` `manager@` `agent@` `comptable-decor@chambre-froide.dz` | `owner-decor@` `manager-decor@` `agent-decor@` `comptable-decor@cloisonnement.dz` |
| Plan | pro (seed) | pro, 12 postes — **12 est le marqueur** « provisionné par le décor », aucun plan du catalogue ne donne cette valeur |

Les identifiants ne se recopient pas d'ici : ils sont dans
`.decor/manifeste.json`, que le décor réécrit à chaque passage.

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

---

## 7 bis. Une commande, pour tout rejouer

```bash
./scripts/run-all-scenarios.sh --liste    # l'ordre, et pourquoi il est celui-là
./scripts/run-all-scenarios.sh            # décor + 7 bancs + 2 vérificateurs de base
./scripts/run-all-scenarios.sh --tout     # + la chaîne statique — 11 contrôles, ~4 min
```

État au 2026-08-09 : **8 verts, 3 rouges — tous les trois attendus**, et nommés
par le tableau final : **E021** (une facture émise rouverte et réécrite sous le
même numéro), **E022 ①** (l'état `reserved` que rien n'écrit, et les deux
agrégats à zéro perpétuel), **E022 ②** (la TVA de 19 % qui n'est pas calculée).

> **Tout autre rouge est une régression.** C'est ce que cette phrase, imprimée à
> chaque passage, permet de dire — et qu'aucune suite de contrôles isolés ne
> permettait de dire avant.

---

## 8. Registre de couverture — clôture du chantier, 2026-08-09

> Deux règles. **Un total sans sa décomposition ne se vérifie pas.** Ce qui est
> exclu est épinglé **nommément**, avec sa raison — une exclusion anonyme est
> indiscernable d'un oubli.
>
> Ce tableau se relit en une commande : `./scripts/run-all-scenarios.sh --tout`.
> Chaque banc republie ses totaux à chaque passage.

### Ce qui est couvert, avec sa décomposition

```
FRONTIÈRE — scripts/banc-refus-http.py
  169 routes énumérées depuis la source
    161 protégées × 3 sondes ............... 481 refus obtenus / 481
        sans jeton 161/161 · autre rôle 159/159 · jeton expiré 161/161
    2 exclues de la sonde « autre rôle », nommées
    8 ouvertes, épinglées dans R023
  403 portant une clé traduisible .......... 159 / 159

MATRICE DES RÔLES — scripts/banc-matrice-roles.py
  159 routes × 5 personas = 795 sondes ..... 795 / 795 conformes
    owner · manager · agent · accountant · superadmin : 159/159 chacun
  attendu = docs/specs/02-auth.md, transcrit — jamais @Roles
  10 routes écartées, nommées

CLOISONNEMENT — scripts/banc-cloisonnement.py
  98 routes à paramètre
    91 sondées avec un identifiant d'autrui .. 91 / 91 refusées
    0 fuite · 0 accepté sans rendre · 0 non concluant
    7 écartées, nommées
  15 / 15 jeux d'export sondés, 0 trace du voisin

DATES — scripts/banc-dates.py
  31 dates × 9 familles de documents ....... 31 / 31 rendues à l'identique
  4 bords : le 31 d'un mois de 31 · 1er mars · 1er janvier · 31 décembre

COMPTEURS — scripts/banc-compteurs.py
  11 compteurs comparés à la liste où l'écran les envoie .. 11 / 11 justes

CYCLES DE VIE — scripts/banc-cycles-de-vie.py
  4 cycles documentés, graphe observé vs specs
    13 transitions conformes · 7 permises non documentées · 1 refusée
    4 états non atteints, nommés

EFFETS DE BORD — scripts/banc-effets-de-bord.py
  12 effets de CLAUDE.md §2, mesurés AILLEURS dans la base .. 7 tenus / 12

ÉCRANS — e2e/, 24 fichiers, 95 tests
  86 passés en français · 86 en arabe · 0 échec propre à l'arabe

ÉTAGE 1 — 12 vérificateurs statiques + 2 sur base ......... tous verts
```

### Les trois rouges, et pourquoi ils le restent

Ils ne sont pas des défaillances de la suite : **ce sont des défauts constatés
que seul le métier peut trancher.** Les taire les ferait oublier ; les compter
comme des échecs ordinaires noierait les vrais.

| Banc | Défaut | Ce qui bloque la décision |
|---|---|---|
| cycles de vie | **E021** — une facture émise peut être rouverte en trois appels et **réécrite sous le même numéro** | trois correctifs plausibles, tous à conséquence fiscale |
| effets de bord | **E022 ②** — la TVA de 19 % **n'est pas** auto-calculée : sans taux fourni, la facture sort à 0 % | poser un défaut change le montant de factures créées hors écran |
| effets de bord · compteurs | **E022 ①** — l'état `reserved` n'est **écrit nulle part**, et deux agrégats le lisent : zéro perpétuel | corriger déplacerait la reconnaissance du coût des ventes |

> **Tout autre rouge est une régression.** C'est ce que cette phrase, imprimée à
> chaque passage, permet de dire — et qu'aucune suite de contrôles isolés ne
> permettait de dire avant.

### Ce qui n'est couvert par aucun banc, et c'est une décision

| Absent | Pourquoi |
|---|---|
| **Qu'un rôle autorisé aboutit réellement** | le banc de la matrice s'arrête au garde : il montre qui passe, jamais qui réussit. C'est ce qui le rend incapable de modifier une donnée |
| **L'envoi de courriel** | pas de SMTP local — l'effet est **non mesuré, pas réfuté**. Le banc le dit plutôt que de le compter |
| **Les cycles de l'avoir, de l'ordre de fabrication et de la facture fournisseur** | leurs transitions ne sont documentées nulle part ; il n'y a rien contre quoi comparer. À traiter comme `accountant` l'a été : écrire la politique d'abord |
| **Le français hors catalogue** | `verify:i18n` reconnaît un libellé **présent** dans `fr.json` ; il ne peut pas reconnaître du français qui n'y est pas et n'a pas d'accent (« P.U. HT ») |
| **Les en-têtes des CSV exportés** | ils restent français quelle que soit la langue. Défendable pour un export comptable en Algérie |
| **Les 9 échecs Playwright restants** | 4 tests périmés par la refonte (`<select>` disparu), 5 divers — triés et nommés dans `docs/methode-test/JOURNAL.md`, non corrigés |
| **La charge** | rien ne dit ce qui se passe à cinquante utilisateurs |
| **La mise en page** | le contraste se mesure ; une carte qui déborde reste invisible |
| **Les PDF chez le destinataire** | on vérifie le HTML composé et les objets image, pas ce que voit un comptable dans Acrobat |
| **Le barème du droit de timbre** | attend confirmation par un comptable ; aucun test ne la remplace |
| **Le mobile Capacitor** | vit dans le clone Windows, hors de cette suite |

### Ce que ce chantier a trouvé

Sept défauts, dont aucun n'avait été vu par une relecture :

| | Défaut | Trouvé par |
|---|---|---|
| **E018** | les 5 clés de refus des gardes n'existaient dans **aucune** des deux langues — tout 403 affichait « une erreur est survenue » | banc de frontière |
| **E019** | deux lectures ne vérifiaient pas que le **parent** était au demandeur | banc de cloisonnement |
| **E020** | politique de permissions à **3 rôles** pour un produit qui en a **5**, 68 cases divergentes | banc de la matrice |
| **E021** | une facture émise **rouverte et réécrite sous le même numéro** | banc des cycles de vie |
| **E022** | deux effets « non négociables » qui ne se produisent pas | banc des effets de bord |
| **E023** | `<form>` dans `<form>` — le défaut **fondateur** de ce chantier, encore vivant, masquant **8 tests** | suite Playwright |
| **E024** | un **quatrième** chemin vers une facture, sans coût figé ⇒ marge de 100 % | vérificateur de comptabilité, réveillé par le décor |

**Et trois défauts dans l'outillage lui-même**, tous trouvés au second passage :
le décor lisait un code HTTP dans une variable invisible au retour et n'avait
**jamais reconnu un refus** ; ses sondes `DELETE` mouraient sur l'analyseur de
corps avant tout garde ; `verifier-comptabilite.js` tirait son locataire au sort
depuis qu'il y en avait deux.

> Aucun de ces dix n'était visible au premier passage. C'est ce que « rejouable »
> achète — et c'est la seule chose qu'un contrôle au vert n'avait jamais montrée.
