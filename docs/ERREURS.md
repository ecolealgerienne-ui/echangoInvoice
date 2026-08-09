# ERREURS.md — Défauts rencontrés et ce qu'ils ont appris

> Consulté avant chaque tâche (CLAUDE.md §0). Une entrée n'est pas le récit d'un
> bug : c'est **la forme du défaut**, pour la reconnaître ailleurs.
>
> Créé le 2026-08-08. Le fichier était référencé par le protocole de démarrage
> depuis l'origine sans avoir jamais existé — le premier réflexe prescrit
> portait donc sur un vide.

---

## E001 — Un chemin de fichier dérivé d'un identifiant scopé par locataire

**Date :** 2026-08-08 · **Gravité :** critique · **Statut :** corrigé

`PdfService.generateAndArchive()` écrivait
`ARCHIVES/{AAAA}/{MM}/{TYPE}/{numéro}.pdf`, conformément à la lettre de R014.
Or `{numéro}` (`FAC-26-001`) est séquentiel **par locataire**. Deux sociétés
facturant le même mois produisaient le même chemin, et `fs.writeFileSync`
écrasait l'archive de la première **sans erreur ni journal** — alors que le
décret 05-468 impose dix ans de conservation.

### La forme du défaut

> Un identifiant **unique par locataire** utilisé comme clé dans un espace de
> noms **global** (chemin de fichier, clé de cache, objet S3, identifiant de
> job, nom de pièce jointe) fusionne silencieusement des données de locataires
> différents.

L'isolation par `tenantId` était correcte dans **toutes** les requêtes SQL.
Elle s'arrêtait au bord de la base, et c'est là que rien ne la vérifiait.

### À reconnaître ailleurs

La question à poser partout où une valeur métier sort du périmètre SQL :
*« cette clé est-elle unique globalement, ou seulement à l'intérieur d'un
locataire ? »*

### Correctif

`ARCHIVES/{tenantId}/{AAAA}/{MM}/{TYPE}/{numéro}__{documentId}.pdf`. Le
`tenantId` rétablit l'isolation ; le `documentId` empêche en plus une
régénération d'écraser la version déjà envoyée au client.

**Contrôle :** `npm run verify:securite`.
**Reste à faire :** les PDF déjà archivés à l'ancien format sont, pour ceux dont
le numéro existe chez plusieurs locataires, définitivement ambigus. Une reprise
ne peut pas deviner : elle doit signaler ces cas plutôt que choisir.

---

## E002 — Une adresse dans un attribut `src` n'est pas neutralisée par l'échappement

**Date :** 2026-08-08 · **Gravité :** moyenne · **Statut :** corrigé

`echapper()` couvrait déjà tout le gabarit PDF — le vecteur d'injection de
balisage était fermé. Restait le logo : `<img src="${echapper(e.logo)}">`.
L'échappement empêche de **sortir** de l'attribut, pas d'y mettre
`file:///etc/passwd` ou l'adresse d'un service interne, que Chrome ira chercher
comme n'importe quelle image.

### La forme du défaut

> Échapper une valeur la rend inoffensive **comme texte**. Dans un attribut qui
> désigne une ressource (`src`, `href`, `action`, `url()` en CSS), la valeur
> reste une **instruction** : il faut alors contraindre le schéma, pas les
> caractères.

Et le moteur de rendu d'un PDF est un navigateur, sur un serveur qui, lui,
atteint le réseau interne — sans utilisateur pour voir l'anomalie.

### Correctif

`sourceImageSure()` n'accepte que les data-URL d'image ; le service Puppeteer
désactive JavaScript et abandonne toute requête hors `data:`.

---

## E003 — Une garde écrite, jamais montée

**Date :** 2026-08-08 · **Gravité :** moyenne · **Statut :** corrigé

`TenantGuard` existait depuis l'origine, référencé **nulle part**. Les
contrôleurs montaient `@UseGuards(JwtGuard, RolesGuard)` puis lisaient
`user.tenantId!`.

Ce qui tenait à la place : les 127 handlers portaient **tous** un `@Roles`, ce
qui écarte le superadmin (`tenantId = null`). L'isolation de toute l'application
reposait donc sur un décorateur recopié à la main 127 fois.

### La forme du défaut

> Un `!` TypeScript n'est pas une garantie, c'est un **renoncement à la
> vérification**. Quand la valeur manque quand même, TypeORM retire
> `tenantId: undefined` de la clause `where` — la requête rend alors les lignes
> de tous les locataires. Le défaut ne lève pas : il **élargit**.

Cas d'école de R022 et de R023.

**Contrôle :** `npm run verify:securite` échoue si un contrôleur locataire perd
la garde, si l'ordre `TenantGuard → RolesGuard` s'inverse, ou si un handler
n'a pas de `@Roles`.

---

## E004 — Une assertion fondée sur une prémisse fausse accuse le produit

**Date :** 2026-08-08 · **Gravité :** faible (attrapé avant commit) · **Statut :** corrigé

Le contrôle de traversée de répertoire affirmait `!chemin.includes('..')`. Il a
échoué — non parce que la traversée était possible, mais parce que les
**séparateurs** sont neutralisés : `../../../etc/x` devient `.._.._.._etc_x`, où
`..` subsiste comme simple texte.

> R030, dernier corollaire. C'est le pire des faux négatifs parce qu'il est
> crédible : on part corriger du code sain.

Quand un contrôle échoue, établir d'abord **quelle propriété** il prétend
mesurer. Ici : « le nom de fichier ne crée aucun niveau de répertoire », donc
`path.dirname(p)` doit valoir exactement le dossier attendu.

---

## E005 — Deux clones, et un audit produit sur le mauvais

**Date :** 2026-08-08 · **Gravité :** élevée (perte de travail, conclusions fausses) · **Statut :** consigné

Un audit complet du produit a été rendu à partir du clone Windows, **26 commits
en retard**. Une part notable des « manques » rapportés était livrée depuis
longtemps : les neuf pages détail, l'export CSV, les grilles tarifaires,
l'identité légale de l'émetteur, les bornes R021, la suppression du module
matières premières. Deux migrations ont même été écrites avec des horodatages
**déjà pris et déjà appliqués** en base — les lancer aurait inscrit des doublons
d'horodatage, avec un ordre d'exécution ambigu de façon permanente.

### La forme du défaut

> Le premier geste d'une analyse n'est pas de lire le code, c'est d'établir
> **quel** code on lit. Ici, deux clones ne communiquent que par git (CLAUDE.md
> §10) : rien, dans les fichiers eux-mêmes, ne dit qu'ils sont périmés. Un dépôt
> en retard ne se signale pas — il se lit exactement comme un dépôt à jour.

**Réflexe à garder :** `git log --oneline -1` et une comparaison à l'origine
avant toute conclusion sur l'état d'une fonctionnalité. Le backend, la base et
le web vivent dans le clone **WSL** ; le clone Windows ne sert qu'au mobile.

---

## E006 — Le schéma et les entités ne disent pas la même chose

**Date :** 2026-08-08 · **Gravité :** à surveiller · **Statut :** ⏳ ouvert

R024 pose que la mesure de l'écart entité ↔ base est un `migration:generate`
qui ne rend **rien**. Mesuré le 2026-08-08 : la sonde produit **356 opérations**
— 57 `DROP CONSTRAINT` suivies de 57 `ADD CONSTRAINT`, 52 `ALTER COLUMN`, et
**15 `DROP COLUMN`**.

Les colonnes du timbre n'y figurent pas : **l'écart est préexistant**, pas
introduit par les lots de cette session.

⚠️ **Première mesure sous-estimée.** J'avais d'abord annoncé « une vingtaine
d'instructions, toutes des DROP CONSTRAINT » en lisant les vingt premières
lignes de la sonde. C'est faux : les `DROP COLUMN` arrivent plus bas, et parmi
elles `DROP COLUMN "invoiceDate"`, `"status"`, `"createdBy"`, `"approvedBy"`.
Lire le début d'une sortie et en tirer sa nature est le même défaut que E004 —
une conclusion tirée d'une mesure partielle.

### Pourquoi c'est dangereux tel quel

Un futur `migration:generate` fait pour une petite évolution embarquera ces
356 opérations dans une migration qu'on relira comme additive. `DROP COLUMN
"invoiceDate"` détruirait la date de chaque facture émise. C'est exactement le
scénario que décrit R024, et il est déjà signalé dans `docs/REPRISE.md`.

**En attendant : ne jamais lancer `migration:generate` sans lire sa sortie
entière.** Les migrations de cette session ont toutes été écrites à la main.

### Réduction partielle (2026-08-08, fin de session)

Deux causes traitées, les plus dangereuses :

- **`credit_notes.creditNoteNumber` portait `unique: true`** alors que la
  contrainte réelle est composite avec le locataire. La sonde émettait bien
  `ADD CONSTRAINT UQ_… UNIQUE ("creditNoteNumber")` : appliquée, la deuxième
  société à émettre `AV-26-001` aurait pris un 409. Entité corrigée.
- **`sales_invoices.invoiceDate`** : l'entité disait `date`, la base portait
  `timestamptz`, et la sonde résolvait l'écart par un `DROP COLUMN` suivi d'un
  `ADD` — la date de chaque facture émise. La colonne a été convertie en `date`
  avec `USING` (migration `1750030000000`), ce qui corrige au passage un défaut
  fonctionnel : le tableau de bord filtre par `BETWEEN`, et **1000 factures sur
  1007 portaient une heure non nulle**, donc échappaient au chiffre d'affaires
  dès qu'elles tombaient le dernier jour d'une période.

Mesure après correction : **354 opérations, 13 `DROP COLUMN`** — contre 364 et
15. Le gros du reste est mécanique (61 `DROP`/`ADD CONSTRAINT` de clés
étrangères, 51 index, 52 `ALTER COLUMN`) et tient à des types déclarés
approximativement : `varchar(255)` côté entité contre `varchar` sans longueur en
base, `numeric(10,2)` contre `numeric`. Aucun n'est urgent, tous sont à traiter
avant de refaire confiance à `migration:generate`.

À traiter comme un chantier propre : déclarer les relations manquantes dans les
entités, ou nommer les contraintes existantes, jusqu'à ce que la sonde rende le
vide.


---

## E007 — Une colonne `date` lue comme un `Date` recule d'un jour

**Date :** 2026-08-08 · **Gravité :** moyenne · **Statut :** corrigé

La facturation récurrente ancrée au 31 mai produisait des factures au 30, et son
échéance suivante tombait au 29 août au lieu du 31.

`node-postgres` rend une colonne `date` sous forme de `Date` JavaScript à
**minuit local**. En UTC+1, `toISOString().slice(0, 10)` en retire donc la
veille : `2026-05-31` devient `2026-05-30`. Le jour d'ancrage passait de 31 à
30, puis dérivait à chaque échéance.

### La forme du défaut

> Une colonne `date` n'a pas d'heure ni de fuseau. La convertir en `Date` lui en
> invente un, et toute reconversion en texte le fait payer d'un jour. Le
> décalage est invisible à Greenwich et systématique ailleurs.

### Ce que ça apprend sur les contrôles

`npm run verify:echeances` couvrait pourtant les mois courts, les années
bissextiles et la non-dérive sur douze mois — et il passait au vert. Il
manipule des **chaînes** : le défaut n'était pas dans le calcul mais dans la
lecture, en amont de ce que le contrôle voit.

> Un contrôle unitaire vert ne dit rien du chemin par lequel ses entrées
> arrivent. C'est le premier essai contre la vraie base qui a montré le
> décalage.

### Correctif

Les colonnes de date sont sélectionnées en texte (`"nextRunDate"::text`), ce qui
supprime le fuseau du chemin. À reprendre partout où une colonne `date` est lue
puis reformatée.

⚠️ **Le même défaut est revenu deux heures plus tard**, dans la requête de
liste du même module : corrigé dans la génération, il subsistait dans
l'affichage, et l'écran annonçait le 31 août pour une échéance au 1er
septembre. Corriger une occurrence ne corrige pas la classe. Le repérage se
fait sur la forme — toute colonne `date` lue puis rendue au client — pas sur le
symptôme.

### ⚠️ Et deux fois encore, trois mois plus tard — 2026-08-09

`scripts/banc-dates.py`, écrit pour balayer **la classe** plutôt que le
symptôme, envoie 31 dates à travers neuf familles de documents et les relit.
Vingt-huit revenaient intactes. **Trois étaient décalées d'un jour**, à deux
endroits qui n'avaient jamais été portés :

| Où | Forme |
|---|---|
| `PurchasesService.findOneVendorBill` | `SELECT vb.*` — `billDate` **et** `dueDate` d'une facture fournisseur au 31/01 s'affichaient au 30/01, échéance comprise |
| `RecurringInvoicesService.creer` | `RETURNING *` — un abonnement ancré au 31 était **créé** au 31, **listé** au 31, et **annoncé au 30** par la réponse qui suit sa création |

La seconde est la plus instructive : **c'est le module même où le défaut avait
déjà été corrigé deux fois.** La liste lisait `"startDate"::text`, la génération
aussi — le `RETURNING` de la création, non. L'écran affichait donc le mauvais
jour jusqu'au premier rechargement, ce qui le rendait invisible à qui recharge.

> Une classe de défauts ne se referme pas en corrigeant ses occurrences une à
> une : elle se referme quand un contrôle **énumère la classe**. Trois
> corrections successives n'y avaient pas suffi ; un banc qui essaie les
> 31 dates a trouvé les deux restantes du premier coup.

**Correctif :** les deux requêtes sélectionnent désormais leurs colonnes `date`
en texte, comme le reste du module. Le banc passe de 28/31 à **31/31**.

**Contrôle :** `python3 scripts/banc-dates.py`. Il éprouve quatre bords — le 31
d'un mois de 31, le 1er mars, le 1er janvier (qui change d'**année**, donc
d'exercice comptable) et le 31 décembre. ⚠️ Il annonce le fuseau du poste et
**prévient qu'à UTC+0 son vert ne prouve rien** : le décalage y est nul par
construction, et un contrôle qui ne peut pas échouer n'a rien montré (R030).

---

## E008 — `UPDATE … RETURNING` ne rend pas ce qu'on croit

**Date :** 2026-08-08 · **Gravité :** faible · **Statut :** corrigé

`const [a] = await this.ds.query('UPDATE … RETURNING *')` donnait un tableau, pas
une ligne. Sur un `UPDATE`, TypeORM rend `[lignes, nombreAffecté]` — la
déstructuration prend donc `lignes`, et l'API renvoyait une liste là où l'écran
attendait un objet.

### La forme du défaut

> Le même `query()` ne rend pas la même forme selon le verbe SQL. Un `INSERT …
> RETURNING` rend les lignes, un `UPDATE … RETURNING` rend un couple. Aucun type
> ne le dit : `query()` est typé `any`.

Le contrôle `!a` passait puisque le tableau était non vide — l'erreur ne levait
pas, elle changeait la forme de la réponse. Repéré en exerçant le bouton depuis
l'écran, pas en lisant le code.


---

## E009 — Un contrôle neutralisé par un caractère invisible

**Date :** 2026-08-08 · **Gravité :** élevée · **Statut :** corrigé

Deux services — factures et bons de livraison — avaient **perdu leur appel de
tri**. Un script de réécriture avait supprimé leur `.orderBy(...)` sans poser le
remplacement : son ancre attendait `const [data, total]` là où ces fichiers
écrivent `const [rows, total]`. Leurs listes n'avaient donc plus **aucun**
`ORDER BY` — un ordre non déterministe, et une pagination qui peut rendre deux
fois la même ligne.

`npm run verify:tri` passait au vert. Son assertion cherchait
`resoudreTri|appliquerTri` n'importe où dans le fichier : **la ligne d'import
suffisait à la satisfaire.**

### Deux formes de défaut, l'une dans l'autre

> Une assertion qui cherche un identifiant dans un fichier ne vérifie pas qu'il
> est *appelé*. « Le nom apparaît » et « la fonction est utilisée » sont deux
> propriétés différentes, et c'est toujours la seconde qu'on veut.

Renforcée pour exiger un appel — `(resoudreTri|appliquerTri)\s*\(` — puis la
présence de la liste blanche dans cet appel, la version renforcée a d'abord
échoué sur **tous** les services alors qu'ils étaient corrects. Cause : la
regex écrite contenait un caractère **backspace** (0x08) au lieu des deux
caractères `\b`, glissé par un échappement Python mal protégé. Invisible à la
relecture, invisible dans un `grep`, visible seulement en `od -c`.

> Un contrôle peut être neutralisé par un caractère qu'aucune relecture ne
> montre. Quand une assertion refuse un code qu'on croit correct, vérifier
> l'assertion elle-même **avant** le code — E004 disait déjà cela, ici c'est
> l'outil d'écriture qui a menti, pas le raisonnement.

### Correctif

Appels rétablis dans les deux services, contrôle renforcé sur deux propriétés,
et vérifié en retirant réellement un appel.


---

## E010 — Un champ déclaré, transmis, et jamais dessiné

**Date :** 2026-08-08 · **Gravité :** élevée · **Statut :** corrigé

Le QR de vérification était **généré** à chaque document, **passé** au gabarit
PDF, **déclaré** dans son interface — et n'apparaissait sur aucune facture. Le
client l'a signalé : « Je ne vois pas des codes barres ni des QR code sur les
documents ». Le bloc de rendu n'avait jamais été inséré : un `.replace()` sur la
ligne du pied de page avait échoué en silence, laissant le champ orphelin.

Trois filets étaient tendus, aucun n'a retenu :

- la **compilation** passait — le champ est optionnel, un champ non lu ne gêne
  personne ;
- la **génération** passait — le PDF sortait, valide, simplement amputé ;
- la **relecture du service** confirmait `qrVerification: await this.qr…` sur
  les quatre documents, ce qui était vrai et sans rapport.

> « Le champ existe » et « le champ est rendu » sont deux propriétés
> différentes. Seule la seconde intéresse le client, et c'est la seule que ces
> trois contrôles ne regardaient pas.

La même relecture a révélé que le **code-barres du numéro n'avait jamais été
écrit** : la demande du client portait sur *« QR Code et codes barres »*, et
seul le QR figurait dans l'étude. Une demande à deux volets tenue pour honorée
sur un seul.

### Correctif

Bloc de rendu posé dans le gabarit (QR + code-barres Code 128 du numéro, les
deux via la liste blanche de schémas), génération du code-barres câblée sur les
quatre documents, et **`npm run verify:gabarit-pdf`** ajouté : il rend le
gabarit et lit le HTML produit, au lieu d'inspecter la forme du code. C'est le
seul contrôle de la série qui exerce le code compilé — un `npm run build` doit
le précéder.

Vérifié en retirant le rendu du QR du fichier compilé : le contrôle refuse.
Vérifié aussi sur un PDF réel — 4 objets image, contre 0 auparavant.


### Suite — le contrôle a repris le même défaut deux heures plus tard

En posant les PDF d'achat, le bon de réception a reçu son mode de colonnes
`quantitatif` dans le gabarit, ses lignes portant le lot, son total en
quantité — et **pas l'option qui active le mode**. Exactement E010 : tout était
écrit, transmis, déclaré, sauf la ligne qui s'en sert. La compilation passait,
le PDF sortait, et il imprimait « 0,00 DA » sur chaque ligne d'une livraison.

Cette fois `verify:pdf-achats` l'a refusé sur-le-champ — trois assertions
rouges avant même le premier coup d'œil au document.

> Un contrôle qui lit la sortie rattrape la classe entière de défauts, pas
> l'occurrence qu'on avait en tête en l'écrivant.

Ce contrôle a aussi révélé, en échouant à capturer quoi que ce soit, que
`PdfService` est déclaré dans plusieurs modules : le conteneur en tient
plusieurs exemplaires. Sans état — un navigateur est lancé et fermé à chaque
appel — cela ne gêne pas la production, mais un test qui substitue le mauvais
exemplaire ne voit rien passer.


---

## E011 — Une langue qu'on croyait posée

**Date :** 2026-08-08 · **Gravité :** élevée · **Statut :** corrigé

L'arabe était annoncé livré. À l'usage, la moitié de l'interface restait en
français. La mesure a donné deux défauts distincts, dont aucun ne casse à la
compilation :

| Défaut | Ampleur | Pourquoi invisible |
|---|---|---|
| Clés absentes de `ar.json` | **683 sur 925** | i18next se rabat sur le français sans rien dire |
| Chaînes écrites en dur dans le JSX | **143** | elles ne passent jamais par i18next |

Le repli silencieux est le bon comportement en production — une clé manquante
ne doit pas afficher une page vide. Mais pendant le développement il supprime
le seul signal qui aurait alerté : rien ne casse, personne ne le sait.

### Une troisième forme, née de la correction

Une table figée au chargement du module ne peut pas suivre la langue :

```ts
const MODE: Record<string, string> = { cash: 'Espèces', … };   // jamais traduit
```

Quatre pages en portaient une, plus la page de vérification et sa table de
titres de document. Elles sont devenues des fonctions appelées au rendu.

Même contrainte sur les schémas zod, qui vivent hors de tout composant : `t`
n'y existe pas. Le schéma porte donc la **clé**, et l'affichage de l'erreur la
traduit.

### Le défaut que j'ai introduit en corrigeant

Une expression régulière destinée aux seuls schémas a défait **63 appels
`t('production.…')` légitimes** dans le reste du fichier, laissant
`{'production.title'}`. TypeScript l'a accepté sans broncher : une chaîne est
un `ReactNode` valide. L'écran aurait affiché ses propres identifiants
techniques.

> Une correction de masse par expression régulière doit délimiter sa zone
> **avant** de substituer, pas espérer que le motif suffise à la délimiter.

Et le contrôle qui aurait dû le voir ne voyait rien non plus, pour une raison
qui mérite d'être notée : `npx tsc --noEmit` à la racine du client **ne vérifie
aucun fichier**. Le `tsconfig.json` y porte `"files": []` et ne fait que
référencer `tsconfig.app.json`. Chaque « tsc : 0 » obtenu ainsi était vide de
sens. Le contrôle réel est `npx tsc --noEmit -p tsconfig.app.json`.

### Correctif

683 clés traduites, 143 chaînes externalisées, 12 clés arabes mortes retirées,
et **`npm run verify:i18n`** qui refuse six choses : clé manquante, clé arabe
orpheline, traduction vide, variable d'interpolation perdue, chaîne française
en dur, clé affichée sans `t()`.

Les trois défauts principaux ont été réintroduits un par un pour voir le
contrôle les refuser.

**Deux exceptions assumées, inscrites dans le contrôle :** `useUnits.ts` et
`SettingsPage.tsx` portent la liste des unités par défaut (`kg`, `boîte`…).
Ce sont des **valeurs enregistrées en base**, relues ensuite par le PDF et
l'export — les traduire écrirait de l'arabe dans une colonne de données.


---

## E012 — Un thème déclaré, un thème absent, et une police jamais chargée

**Date :** 2026-08-08 · **Gravité :** moyenne · **Statut :** corrigé

`tailwind.config.ts` portait `darkMode: ['class']` depuis le premier jour.
Aucun jeton `.dark` n'existait dans `globals.css` : le mécanisme était branché
sur rien. Un `dark:` écrit par mégarde n'aurait rien fait, et personne ne
l'aurait su.

Trois découvertes du même ordre — déclaré mais jamais réalisé :

| Déclaré | Réalité |
|---|---|
| `darkMode: ['class']` | aucun jeton sombre, le mode n'existait pas |
| `font-family: 'Inter'` | Inter n'était jamais chargée, repli système silencieux |
| 85 couleurs de palette | ne connaissent qu'un thème par construction |

### Ce que le thème sombre a révélé

Le sombre ne crée pas ces défauts, il les rend visibles. Trois se cachaient
derrière le fait qu'en clair, fond de page et surface posée sont tous deux
blancs :

1. **`bg-background` sur une carte.** En sombre, la carte devient plus foncée
   que la page — l'élévation s'inverse et creuse un trou. Soixante-sept
   occurrences, reclassées par rôle : champ, panneau flottant, fond de page.

2. **Le panneau de marque sur `bg-primary`.** En sombre, la primaire
   s'éclaircit pour rester lisible : l'aplat de marque devenait une dalle bleu
   clair. Il a son propre jeton, sombre dans les deux thèmes.

3. **`text-white` en dur** sur le titre de la barre latérale — invisible dès
   que la barre est passée au thème.

### Dix-huit tables de statut qui se contredisaient

Recopiées dans quatorze pages, elles ne disaient pas la même chose : le même
bon de livraison signé était **vert sur sa fiche et orange dans la liste** ; un
avoir émis passait de bleu à vert selon l'écran. Chaque page était cohérente
avec elle-même, l'utilisateur apprenait un code couleur qui changeait sous ses
yeux. Une seule table désormais, dans `lib/statuts.ts`.

### Un faux positif à noter

Une capture de la liste des factures est sortie **entièrement blanche**. Le
diagnostic a montré que le serveur de développement tournait depuis avant le
changement de jetons : il servait l'ancien `globals.css` avec la nouvelle
configuration, et `oklch(222 47% 11%)` — des composantes HSL lues comme de
l'OKLCH — donne du blanc.

> Un serveur de développement qui tourne depuis avant un changement de
> configuration Tailwind ne prouve rien. Vérifier sur un serveur neuf, ou sur
> le build.

### Correctif

Jetons OKLCH complets dans les deux thèmes, sélecteur à trois positions
(clair / sombre / système) avec pose du thème **avant le premier rendu** pour
éviter l'éclair blanc, Inter et Noto Sans Arabic auto-hébergées, 85 couleurs
remplacées par des rôles sémantiques, 88 cellules de montant figées sur une
ligne, et **`npm run verify:design`** qui refuse les six formes en cause.

Les défauts ont été réintroduits un par un pour voir le contrôle les refuser,
et le rendu vérifié au navigateur dans les deux thèmes — pas seulement compilé.


---

## E013 — Une page blanche parce que le nom n'avait pas changé

**Date :** 2026-08-08 · **Gravité :** élevée · **Statut :** corrigé

Le client : « j'ai les menus invisibles sur un fond blanc ». Le thème sombre
venait d'être livré et vérifié — mais sur un serveur neuf.

### Le mécanisme

Les jetons ont changé de **format** sans changer de **nom** : triplet HSL
(`222 47% 11%`) avant, composantes OKLCH (`0.21 0.024 253`) après. Le nom
`--foreground`, lui, est resté.

Un navigateur qui détenait l'ancienne feuille compilée — `hsl(var(--foreground))` —
et les nouvelles variables calculait donc :

```
hsl(0.21 0.024 253)   →   clarté 253 %   →   blanc
```

Non pas pour un jeton, mais pour **tous**. Texte blanc, fond blanc, bordures
blanches : l'écran disparaît entièrement. C'est exactement l'état d'un serveur
de développement qui a rechargé `globals.css` à chaud sans relire
`tailwind.config.ts` — Vite ne recharge pas la configuration Tailwind à chaud.

### Le vrai défaut n'est pas le serveur périmé

Un serveur périmé arrive. Ce qui n'est pas acceptable, c'est qu'il produise un
écran **entièrement blanc** plutôt qu'un écran laid.

> Quand une valeur change de format, changer son nom en même temps n'est pas
> une coquetterie : c'est ce qui transforme une panne muette en panne visible.

Les jetons de couleur portent désormais un préfixe — `--ci-foreground`. Une
feuille périmée ne trouve plus la variable, la déclaration devient invalide, et
le navigateur retombe sur ses valeurs par défaut : **noir sur blanc**. Moche,
et parfaitement lisible. Vérifié en rejouant l'état fautif.

`--radius` et les `--shadow-*` gardent leur nom : ils ne traversent aucune
fonction de couleur, donc aucun risque de réinterprétation.

### Ce qui manquait aux contrôles

`verify:design` inspecte la forme du code. Aucun contrôle ne regardait le
**rendu**. `scripts/verifier-contraste.js` parcourt désormais quinze pages,
ouvre chaque menu, et mesure le contraste de tout texte affiché contre le fond
réellement composité derrière lui — en remontant les parents jusqu'à une
couleur opaque, puisqu'un fond translucide ne dit rien seul. Seuil : 3:1.

Résultat sur les deux thèmes, menus ouverts : **aucun texte sous le seuil**.

Hors de `npm run verify` : il demande un serveur et la base.


---

## E014 — Ce que le tableau de bord appelait un graphique

**Date :** 2026-08-08 · **Gravité :** moyenne · **Statut :** corrigé

Le client : « les courbes ne sont pas visibles ». Elles n'étaient pas invisibles
— **elles n'existaient pas**. Ce que l'écran nommait « CA par jour » était une
rangée de `div` colorés à hauteur variable :

```tsx
<div className="flex-1 bg-primary/80" style={{ height: `${pct}%` }} />
```

Ni axe, ni graduation, ni échelle, ni date. On y voyait qu'un jour dépassait un
autre, jamais de combien ni lequel. Le commentaire du code assumait le choix —
« en ajouter une pour quatre barres coûterait plus cher que ces quelques div » —
et ce raisonnement, valable pour quatre barres de répartition, avait été étendu
à une série temporelle, où il ne tient plus.

> Un graphique qui ne porte ni échelle ni étiquette n'est pas un graphique
> simplifié : c'est une décoration qui occupe la place d'un graphique.

### Correctif

`components/ui/Graphique.tsx` : courbe d'aire, sparkline, barres de classement.
En SVG plutôt qu'avec une bibliothèque — les couleurs viennent des jetons et
suivent donc les deux thèmes sans traduction, le paquet client ne grossit pas,
et rien ne dépend du réseau.

Partis pris de rendu, tirés de ce que font les tableaux de bord financiers :

- **grille horizontale seulement**, très ténue : les verticales n'aident jamais
  à comparer des hauteurs ;
- **graduations abrégées** (« 5,0 M ») : un axe donne l'ordre de grandeur, le
  montant exact se lit au survol. Écrites en entier, elles occupaient quatre
  centimètres de gouttière et se coupaient en deux lignes ;
- **valeur lue au-dessus** du graphique et non dessous, où elle entrait en
  collision avec la dernière graduation ;
- **bandes de survol** larges d'un point : on attrape la lecture sans viser le
  pixel exact de la courbe.

Densité revue dans la foulée — 325 cellules et 220 en-têtes de colonne : lignes
ramenées de 48 à 40 px, en-têtes en petites capitales grises. La hiérarchie
vient du poids et de l'espace, la couleur reste réservée à l'état.


---

## E015 — Une marge brute qui n'en était pas une

**Date :** 2026-08-08 · **Gravité :** critique · **Statut :** corrigé

Le tableau de bord annonçait **96,83 % de marge brute** pour un grossiste en
surgelés. La formule, à `dashboard.service.ts:197` :

```ts
const grossMargin = totalRevenue - totalPurchaseCost;   // achats REÇUS sur la période
```

Ce n'est pas une marge brute. C'est le chiffre d'affaires moins les **dépenses
d'approvisionnement de la période** — une trésorerie, pas un résultat.

| Mois | Ce que la formule affichait |
|---|---|
| Ventes sur stock, peu de réassort | marge proche de 100 % |
| Gros réapprovisionnement | marge **négative** |

Les deux étaient faux, et le résultat net, qui en dérivait, était **surestimé
d'un facteur cinq** : 16,4 M au lieu de 4,5 M.

### Ce qui rend ce défaut particulier

Rien ne plantait. La requête était juste, le code propre, les tests verts. C'est
la **définition** qui était fausse. Aucun contrôle de forme ne pouvait le voir —
il n'y a pas de faute de syntaxe dans une soustraction qui soustrait la mauvaise
chose.

> Trois passes de revue de design sont passées sur cet écran sans voir que le
> chiffre le plus visible était faux. On regardait comment il était présenté.

Le signalement est venu d'une relecture extérieure, à l'œil : « 96,83 % de marge
brute pour de l'alimentaire, c'est extrêmement inhabituel ». C'est l'ordre de
grandeur qui a alerté, pas le code.

### La cause profonde

Les lignes de facture ne portaient **aucun coût**. La marge ne pouvait donc se
calculer qu'à partir du coût moyen courant de l'article — qui bouge à chaque
réception. La marge d'une facture de janvier changeait en mars.

Le correctif traite les deux niveaux :

1. **`unitCost` figé sur la ligne** à l'émission (migration
   `1750034000000`, remplissage rétroactif au coût moyen actuel). Une facture
   émise ne bouge plus, ni son montant ni sa marge. Les trois chemins de
   création — saisie, bon de livraison, devis — passent par un même
   `avecCouts()` : à trois endroits distincts, l'un aurait fini par être oublié.
2. **La marge se calcule sur le coût des marchandises vendues.** Les achats
   reçus restent exposés, mais comme information de période, plus comme un coût.

### Résultat sur les données réelles

| | Avant | Après |
|---|---|---|
| Marge brute | 96,83 % | **38,57 %** |
| Résultat net | 16,4 M DA | **4,5 M DA** (21,99 %) |

38 % sur du négoce alimentaire est plausible. 96 % ne l'était pas.

### Le contrôle

`scripts/verifier-comptabilite.js` vérifie la **propriété comptable**, pas la
forme du code : identité marge = CA − coût des ventes, résultat = marge −
charges, coût des ventes distinct des achats reçus, bornes de plausibilité, et
couverture du coût figé sur toutes les lignes. Vu refuser en rétablissant
l'ancienne formule : deux contrôles passent au rouge.


---

## E016 — Un compteur qui ne menait nulle part

**Date :** 2026-08-09 · **Gravité :** moyenne · **Statut :** corrigé

En rendant les alertes du tableau de bord cliquables, un défaut est apparu que
personne ne pouvait voir tant qu'elles restaient muettes : **`unpaidInvoicesCount`
additionnait deux statuts** — `sent` + `partial` — alors que le filtre serveur
n'en accepte **qu'un à la fois**.

Le compteur annonçait 276. Aucun lien ne pouvait mener à une liste de 276
factures : ni `?status=sent` (101), ni `?status=partial` (69), ni
`?status=overdue` (381, qui n'était même pas compté).

> Un chiffre qui n'est cliquable nulle part peut rester faux indéfiniment.
> Le rendre cliquable est ce qui l'oblige à correspondre à quelque chose.

Le bloc est découpé comme le filtre découpe : en retard, à encaisser, règlements
partiels — chacun avec son montant, son lien, et son compte vérifié contre la
liste filtrée. Les lignes à zéro disparaissent : une liste de travaux ne liste
pas ce qu'on n'a pas à faire.

Le filtre de statut des factures ne vivait par ailleurs que dans un `useState`
local et ignorait l'URL : un lien vers une liste filtrée était impossible.
Passé dans `useSearchParams`, l'URL devient partageable.

### Trois autres défauts, trouvés en chemin

- **`common.reopen` n'existait dans aucun catalogue** : le bouton « Rouvrir »
  d'une facture annulée affichait sa clé technique en infobulle.
- **La liste des avoirs ne joignait pas le client** : la colonne « Client »
  rendait un tiret sur chaque ligne. L'avoir porte `customerId`, jamais le nom.
- **`verifier-contraste.js` visitait `/recurring`**, qui n'est pas une route —
  la vraie est `/invoices/recurring`. Il mesurait une page vide et l'annonçait
  conforme. Même famille que E013 : un contrôle qui ne mesure rien passe au
  vert.

### Une leçon sur le contrôle i18n

Élargir son vocabulaire pour y ajouter « Urgent » a immédiatement révélé un
`<option value="urgent">Urgent</option>` oublié dans la production. Mais la même
passe a produit un **faux positif** : `t(cond ? 'a' : 'b')` était signalé comme
clé nue alors qu'il est correct — la clé y est choisie *à l'intérieur* de
l'appel. La présence de `t(` dans le groupe d'accolades sépare désormais les
deux formes.

> Un contrôle qu'on resserre doit être revérifié dans les deux sens : qu'il
> refuse toujours le vrai défaut, et qu'il n'attrape pas la forme correcte.
> Les deux ont été rejoués.


---

## E017 — La production ne parlait pas la même langue que le stock

**Date :** 2026-08-09 · **Gravité :** élevée · **Statut :** corrigé

Le stock est tenu **par lots** — date d'entrée, péremption, coût, FIFO (R015).
Les ventes le respectent. La production, écrite avant la refonte des lots,
écrivait directement sur l'agrégat :

```sql
UPDATE finished_products SET "stockQuantity" = "stockQuantity" - 30
```

Or `recomputeProductStock()` recalcule cet agrégat **depuis les seuls lots** et
l'écrase donc au premier mouvement suivant :

| | Lots | `stockQuantity` |
|---|---|---|
| Réception de 100 kg | 100 | 100 |
| Production consomme 30 kg | **100** (intacts) | 70 |
| Livraison de 10 kg → `recompute` | 90 | **90** |

**Les 30 kg consommés ressuscitent.**

### Ce qui rend ce défaut instructif

C'est **exactement** le défaut déjà rencontré et corrigé côté ventes le
2026-08-08. Le commentaire de `deliveries.service.ts` le décrit mot pour mot,
avec les mêmes chiffres. La correction n'avait simplement pas été portée à la
production.

> Corriger un défaut à l'endroit où on l'a vu ne suffit pas quand la cause est
> un motif partagé. La question à poser après chaque correction n'est pas
> « est-ce réparé ? » mais « **où ailleurs ce même geste est-il écrit ?** »

Versant sortie, c'était pire : le produit fabriqué ne créait **aucun lot**. Il
n'avait donc ni numéro de lot ni date de péremption — rédhibitoire en chambre
froide — et le premier `recompute` effaçait la quantité produite, qui
n'existait dans aucun lot.

### Le second défaut : une recette qui bougeait sous les ordres

L'ordre de fabrication ne stockait que `nomenclatureId`. Modifier une recette
réécrivait rétroactivement ce sur quoi les ordres passés s'étaient appuyés :
le coût estimé d'un ordre de janvier changeait en mars, et l'écart estimé/réel
finissait par mesurer l'ancienneté de la fiche plutôt que l'atelier. Le champ
`version` de la nomenclature existait — et ne servait à rien.

### Correctif

- consommation par `consumeStockFifo()` avec le statut `consumed`, distinct de
  `adjusted` qui désigne une régularisation d'inventaire ;
- lot créé pour le produit fabriqué, numéroté par la référence de l'ordre ;
- **traçabilité amont/aval** : `consumedByProductionOrderId` et
  `producedByProductionOrderId` sur le lot. Depuis un lot de matière on retrouve
  les produits qui en sont issus, ce qu'un rappel sanitaire exige ;
- **coût réel lu sur les lots réellement sortis**, au lieu d'un coût moyen
  relevé avant la sortie. C'est le lien de traçabilité qui le rend possible ;
- **péremption héritée de la plus courte des matières** : un plat cuisiné ne se
  conserve pas plus longtemps que son ingrédient le plus fragile ;
- recette **copiée sur l'ordre** au démarrage (`production_order_lines`), comme
  `unitCost` l'est sur les lignes de facture. `cancel()` libère sur cette copie,
  pas sur la nomenclature courante.

### Le contrôle, et ce qu'il a fallu pour qu'il refuse

`verify:production` rejoue la séquence complète sur la base réelle, dans une
transaction annulée : consommation, puis **recalcul**, et vérifie que la
quantité ne remonte pas.

Sa première version cherchait le motif `stockQuantity − n` dans le service. En
rejouant l'ancien geste avec un `+` au lieu d'un `−`, **le contrôle est resté
vert sur du code fautif**. La règle est désormais absolue : hors commentaires,
le service de production ne nomme jamais `stockQuantity`. Vu refuser les deux
formes.

> Un motif qui décrit *une* écriture fautive laisse passer toutes les autres.
> Quand la règle est absolue, l'assertion doit l'être aussi.

---

## E018 — Un refus poli dans une langue que personne n'a écrite

**Date :** 2026-08-09 · **Gravité :** moyenne · **Statut :** corrigé

Le banc de refus de la frontière, écrit ce jour-là, appelle les 161 routes
protégées avec le jeton valide d'un rôle qui n'a rien à y faire. Les 161 ont
refusé — la frontière tient, et c'est le résultat principal.

Mais **159 de ces refus étaient affichés « une erreur est survenue »**.

Les quatre gardes du projet lèvent une clé de traduction :

| Garde | Clé levée |
|---|---|
| `RolesGuard` | `errors.forbidden` |
| `TenantGuard` | `errors.superadmin_cannot_access_tenant_routes` |
| `AdminGuard` | `errors.admin_only` |
| `PlanFeaturesGuard` | `errors.plan_feature_disabled` |
| `ProductionModuleGuard` | `production_module_disabled` |

**Aucune des cinq n'existait dans `shared/src/i18n/fr.json`.** `resolveApiError`
tente `t(clé)`, puis `t('errors.' + clé)`, puis retombe sur `errors.generic`.
Les trois étages étaient muets, donc le message générique sortait — à chaque
refus d'accès de l'application, depuis toujours.

### La forme du défaut

> Une clé d'erreur est un **couple** entre deux dépôts de vérité : le service
> qui la lève et le catalogue qui la traduit. Rien ne tient ce couple quand la
> clé n'est levée que sur un chemin d'erreur — le chemin qu'aucun écran ne
> parcourt pendant qu'on développe.

C'est M5 (deux copies d'accord entre elles) aggravé par M3 (le repli qui
rassure) : le repli sur `errors.generic` **détruit l'information d'absence**.
Une clé manquante n'échoue nulle part ; elle produit une phrase plausible.

### Pourquoi rien ne l'avait vu

- **`verify:i18n` ne pouvait pas le voir.** Il contrôle la parité fr ↔ ar, les
  chaînes en dur dans le JSX, les clés nues. Ses deux extrémités sont le client
  et les deux catalogues. **Les clés levées par le serveur ne sont d'aucun des
  trois** : elles étaient absentes des deux langues à la fois, donc parfaitement
  paritaires. Un contrôle de parité est aveugle à ce qui manque des deux côtés.
- **Aucun écran ne provoque un 403** en usage normal : chaque rôle ne voit que
  ce qu'il a le droit d'ouvrir. Le chemin n'existe qu'en le forçant.
- **Le 401, lui, n'est pas concerné** — et c'est ce qui rendait l'ensemble
  crédible. Passport rend `"Unauthorized"`, qui n'est pas davantage une clé ;
  mais l'intercepteur du client traite tout 401 par un rafraîchissement de
  jeton puis `onSessionExpired()`. Le message n'atteint jamais l'utilisateur.
  Vérifié **avant** de conclure : sans cette vérification, le banc aurait rougi
  322 fois de plus sur un non-défaut.

### Correctif

Les cinq clés ajoutées à `fr.json` et `ar.json`. Le banc passe de 0/159 à
159/159.

**Contrôle :** `python3 scripts/banc-refus-http.py` — le compte des 403
traduisibles est publié à chaque passage, avec son dénominateur.

### Reste à faire — cinq clés encore absentes, et ce n'est pas le même défaut

`errors.document_not_found`, `errors.email_already_used`,
`errors.image_invalid_format`, `errors.logo_invalid_format`,
`errors.logo_too_large`.

Les trois dernières sont des messages de `class-validator` : elles arrivent
dans un **tableau**, et `resolveApiError` retombe sur `errors.generic` pour tout
tableau, quelle que soit la clé. Les traduire ne changerait rien tant que la
résolution des tableaux n'est pas traitée. Les deux premières sont des chaînes
et se corrigent comme les cinq ci-dessus.

### Et une seconde famille, plus nombreuse : les clés **nues**

Mesurée le 2026-08-09 en écrivant le banc de cloisonnement. Le serveur lève ses
clés d'exception sous deux formes — `'errors.xxx'` (32 distinctes) et `'xxx'`
tout court (64 distinctes). Le client sait résoudre les deux, puisqu'il tente
`t(brut)` **puis** `t('errors.' + brut)`. Mais **15 des 64 nues n'existent nulle
part** :

```
delivery_note_already_invoiced      invoice_limit_reached
finished_product_not_found          nomenclature_has_active_orders
invoice_already_paid                nomenclature_not_found              (×6)
invoice_cancelled            (×2)   production_module_no_tenant
invoice_items_required              production_order_already_cancelled
production_order_already_completed  production_order_lines_missing
production_order_not_found   (×6)   production_order_not_in_progress    (×3)
production_order_not_planned
```

Ce sont des **refus métier** — « facture déjà réglée », « ordre déjà terminé »,
« nomenclature encore utilisée ». Exactement les messages qui devraient
expliquer à l'utilisateur pourquoi son geste n'a pas abouti. Tous s'affichent
« une erreur est survenue ».

`production_order_not_found` a été ajoutée, parce que le correctif d'**E019** la
fait remonter sur une route de lecture. **Les quatorze autres restent à
traduire** : leur formulation engage le métier, pas la technique, et c'est au
propriétaire du produit de la trancher.

> Écrit ici pour que l'absence soit une décision, pas un oubli.

---

## E019 — Une lecture qui filtrait l'enfant sans jamais regarder le parent

**Date :** 2026-08-09 · **Gravité :** faible (aucune fuite) · **Statut :** corrigé

Le banc de cloisonnement appelle les 91 routes à paramètre avec le jeton
**valide** de l'owner du locataire A, sur des identifiants du locataire B.
Quatre-vingt-neuf ont répondu « introuvable ». Deux ont répondu **200**.

```
GET /production/orders/:id/movements   → 200 { data: [] }
GET /stock/entries/:rawMaterialId      → 200 { data: [] }
```

**Rien n'était sorti.** Les deux requêtes filtraient bien la collection
d'enfants par `tenantId` :

```ts
.where('m.productionOrderId = :orderId AND m.tenantId = :tenantId', …)
where: { tenantId, finishedProductId: rawMaterialId }
```

Aucune donnée de B n'a jamais pu remonter par là. Ce n'était pas une fuite ;
c'était **la forme qui en produit une**.

### La forme du défaut

> Une route qui liste les **enfants** d'un parent désigné par identifiant
> vérifie l'appartenance des enfants, et jamais celle du parent. Tant que le
> filtre de la collection tient, rien ne sort. Le jour où ce filtre bouge — une
> jointure ajoutée, un `WHERE` réécrit, un `getMany` remplacé par une requête
> brute — il n'y a plus **rien** derrière lui.

L'isolation reposait sur une seule ligne, à un seul endroit, sans second verrou.
Et la dissymétrie était visible dans le même fichier : `create()`, quelques
lignes sous `findByOrder()`, chargeait l'ordre et le refusait s'il n'était pas
au locataire. **L'écriture posait la question ; la lecture ne la posait pas.**

### Pourquoi rien ne l'avait vu

Une lecture qui rend `200 { data: [] }` est indiscernable, pour tout ce qui la
regarde, d'un parent réel sans enfants. Aucune exception, aucun journal, aucun
écran anormal. C'est le principe fondateur de `METHODE_TEST.md` — *une donnée
mal câblée ne casse pas, elle disparaît* — appliqué au cas où c'est la
**vérification** qui a disparu.

Et aucun contrôle statique ne pouvait le voir : le `tenantId` **est** dans la
requête. R020 est respectée à la lettre. Ce qui manque n'est pas dans la ligne
qu'on lit, c'est la ligne qu'on ne lit pas.

### À reconnaître ailleurs

Partout où un chemin porte un identifiant de parent et rend une collection :
`/x/:id/enfants`. La question n'est pas « les enfants sont-ils filtrés ? » mais
**« a-t-on vérifié que le parent est à nous, avant de répondre ? »**

### Correctif

Les deux services chargent le parent avec son `tenantId` et lèvent
`NotFoundException` s'il n'est pas là — comme leurs voisines d'écriture le
faisaient déjà.

**Contrôle :** `python3 scripts/banc-cloisonnement.py` — 91/91 refusés, publié
avec son dénominateur à chaque passage.

### Ce qui prouve que ce banc sait dire non

`tenantId` retiré du `where` de `CustomersService.findOne()`, sur le vrai
fichier :

```
❌ 2 FUITE(S) — des données du locataire B sont sorties :
   GET  /customers/:id          → 200 : 24d3cbd8…, 364e6f07…, DECOR-B
   POST /customers/:id/contacts → 201 : 364e6f07…
```

La seconde ligne est la plus instructive : la mutation d'une **lecture** a
suffi à ouvrir une **écriture** chez le voisin, parce que `createContact()`
s'appuie sur `findOne()` pour vérifier l'appartenance. Une vérification
partagée propage sa défaillance à tout ce qui s'y adosse.

*Le contact créé chez B pendant cette mutation a été supprimé ; le décor a été
rejoué et n'a rien eu à recréer.*

---

## E020 — Une politique de permissions à trois rôles pour un produit qui en a cinq

**Date :** 2026-08-09 · **Gravité :** moyenne · **Statut :** **arbitré et corrigé**

> **Arbitrage du 2026-08-09**, pris sous consigne d'autonomie et consigné dans
> `docs/methode-test/JOURNAL.md` §0 : **la politique écrite a été mise au niveau
> du code ; aucun `@Roles` n'a été touché, aucun droit d'accès n'a été élargi.**
> Un document qu'on corrige se recorrige ; un droit qu'on ouvre ne se referme
> qu'après incident.
>
> `docs/specs/02-auth.md` décrit désormais les cinq rôles avec leurs listes
> nommées, `CLAUDE.md` §4 en donne la forme courte, et le banc transcrit la
> spec : **795/795**.
>
> ⚠️ La politique ayant été **dérivée** du comportement observé, le banc
> risquait de devenir tautologique. Il a donc été revu refuser après
> l'arbitrage : `@Roles('owner')` élargi sur `DELETE /customers/:id` ⇒ manager
> 158/159, **un seul** écart, la route nommée. Il détecte bien une régression,
> et pas seulement lui-même.
>
> **Ce qui reste à relire par le produit** — trois décisions prises faute de
> pouvoir demander : ① l'agent ne convertit ni n'expédie (le code a été suivi
> contre la promesse de l'ancien tableau) ; ② l'agent crée un devis mais ne
> l'édite pas — asymétrie consignée telle quelle, ni corrigée ni justifiée ;
> ③ le manager supprime ce qui se reprend, dont les règlements.

Le banc de la matrice des rôles appelle les 159 routes soumises à un rôle avec
chacun des cinq personas — 795 sondes — et compare le résultat à la **politique
écrite** de `docs/specs/02-auth.md` §« Roles & Permissions Matrix ».

```
owner        159 / 159 conformes
superadmin   159 / 159 conformes
manager      147 / 159      12 écarts
agent        103 / 159      56 écarts
accountant     — / —        aucune politique écrite ne le mentionne
```

**68 écarts.** Le code n'est pas fautif dans la plupart des cas : c'est le
document qui ne dit plus ce que le produit fait.

### La forme du défaut

> Une politique d'autorisation écrite comme un **tableau binaire de rôles ×
> capacités** ne peut pas décrire une implémentation qui décide **route par
> route**. Les deux divergent dès la première nuance, et rien ne le signale :
> le tableau n'est exécuté par personne.

C'est M5 (deux copies d'accord entre elles) dans sa variante la plus coûteuse —
la seconde copie est en français, dans un document que rien ne relie au code.
Et R031 : un document périmé et un code fautif se ressemblent exactement.

### Les trois écarts qui gênent un utilisateur

Sur 68, **65 vont dans le sens « le code accorde plus que le tableau »**. Trois
vont dans l'autre sens — et ce sont les seuls qu'un utilisateur rencontre, parce
qu'ils **bloquent** quelqu'un dans un geste que la politique lui promet :

```
POST /deliveries/delivery-notes/:id/create-invoice   politique : agent oui — code : non
POST /deliveries/delivery-notes/:id/send-email       politique : agent oui — code : non
POST /invoices/sales-invoices/:id/send-email         politique : agent oui — code : non
```

La politique dit « Create invoices / BL : agent Yes ». Un agent crée bien un BL
et une facture, mais ne peut ni convertir l'un en l'autre, ni les expédier.
C'est peut-être délibéré — expédier au client est un acte commercial. Ce n'est
écrit nulle part.

### Ce que le code accorde en plus, et qui mérite arbitrage

**`agent`** — le tableau dit « Agent scope: can only create and view
DeliveryNote and SalesInvoice. All other module routes return 403. » Le code lui
ouvre **45 routes de lecture** dans tous les modules (clients, articles, stock,
achats, production, devis, avoirs…), et lui accorde `POST /quotes`,
`POST /expenses`, les mouvements de production, et l'édition des BL, factures et
dépenses. L'édition reste bornée en aval au statut `draft` — un agent ne peut
pas retoucher une facture émise —, ce que le tableau n'a aucun moyen de dire.

**`manager`** — le tableau dit « Delete resources : No ». Le code le lui refuse
sur les entités principales (client, article, devis, facture, fournisseur : tous
`@Roles('owner')`) mais le lui accorde sur neuf objets secondaires — contacts,
liens article-fournisseur, codes-barres, grilles, nomenclatures, dépenses,
invitations, et **règlements**. Ce dernier a été vérifié : `cancel()` fait une
suppression **douce** et reprend le solde de la facture ; ce n'est pas une
destruction, c'est une annulation traçable. Le tableau dit « No » là où le code
dit « oui, sur ce qui se reprend ».

Il dit aussi « Manage users : No », et le code laisse le manager **lire**
`/users`, `/users/quota`, `/users/invitations` sans rien pouvoir y modifier.
Lire n'est pas gérer.

### `accountant` — un rôle entier, hors de toute politique

Il existe en base, dans l'énumération TypeScript, dans une soixantaine de
décorateurs. Il n'est ni dans ce tableau, ni dans `CLAUDE.md` §4, ni dans une
spec.

Le banc a relevé ce que le code lui accorde : **67 routes, toutes en lecture,
aucune écriture.** C'est une politique cohérente et probablement voulue. Elle
n'est simplement écrite nulle part — donc rien ne la protège d'être élargie par
inadvertance.

### Ce qui prouve que ce banc sait dire non

`@Roles('owner')` élargi à `@Roles('owner', 'manager')` sur
`DELETE /customers/:id`, sur le vrai fichier :

```
manager      146 / 159        (147 avant)
❌ 69 écart(s)                (68 avant)
   DELETE /customers/:id   politique : refusé   observé : autorisé
```

### Correctif — à arbitrer, pas à décider ici

`docs/methode-test/matrice-roles-observee.md` publie la grille complète,
159 routes × 5 personas, groupée par module. Pour chaque écart la question est
la même : **le code déborde-t-il, ou la politique n'a-t-elle jamais été mise à
jour ?**

Une fois tranchée, la grille arbitrée devient la politique — et le banc cesse
d'être un révélateur pour devenir un détecteur de régression.

> Le banc ne tranche pas : ce serait décider d'un droit d'accès à la place de
> ceux qui répondent du produit. Il rend la question posable, ce qu'elle
> n'était pas.

---

## E021 — Une facture émise, rouverte en trois appels, réécrite sous le même numéro

**Date :** 2026-08-09 · **Gravité :** **élevée** (traçabilité fiscale) · **Statut :** ⏳ **ouvert — décision délibérément non prise**

Le banc des cycles de vie relève le graphe de transitions **réel** de chaque
document et le compare aux tableaux des specs. Sur la facture, une seule
transition n'était pas documentée :

```
cancelled → draft
```

Elle est dans `ALLOWED_TRANSITIONS` (`sales-invoices.service.ts:26`). Elle n'est
ni dans `docs/specs/09-invoices.md`, ni ailleurs.

### Ce qu'elle permet, mesuré et non déduit

```
1. facture créée              FAC-26-013     2 380,00 DA     draft
2. PATCH status → sent        200
3. PUT (édition)              422 invoice_cannot_update   ← la garde fait son travail
4. PATCH status → cancelled   200
5. PATCH status → draft       200
6. PUT (édition)              200            ← la même garde, contournée
7. PATCH status → sent        200
8. état final                 FAC-26-013   117 810,00 DA   sent
```

**Même numéro. Contenu multiplié par cinquante.** Aucune trace de l'ancienne
version : `updateStatus` est une simple écriture de champ, et `update()` remplace
les lignes.

### La forme du défaut

> Une garde qui protège un état (`invoice_cannot_update` hors `draft`) ne
> protège rien si une **transition ramène vers cet état**. Le verrou n'est pas
> sur le document, il est sur une valeur de champ — et cette valeur est
> remise à zéro par une route qui n'a pas été écrite pour ça.

C'est un mode qui ne figurait pas encore dans `METHODE_TEST.md` : **le verrou
réversible**. Ni M1 (le contrôle existe et refuse bien), ni M4 (rien n'est
absent). Les deux moitiés sont correctes ; c'est leur composition qui ouvre.

Et il fallait un banc qui essaie **toutes** les cases pour le voir. Un banc qui
n'aurait éprouvé que les transitions documentées ne l'aurait jamais tentée —
`cancelled → draft` n'est écrite nulle part, c'est tout le problème.

### Pourquoi c'est grave ici, et pas seulement inélégant

`FAC-26-013` est un numéro séquentiel R013, porté par un document remis au
client et archivé dix ans (décret 05-468, voir E001). Deux contenus différents
ont porté ce numéro, et rien dans la base ne permet de savoir lequel a été
envoyé. Le PDF archivé et la ligne en base peuvent ne plus décrire le même
document.

### Ce que je n'ai PAS fait, et pourquoi

**Aucun correctif n'a été appliqué.** Trois corrections sont plausibles et
n'ont pas les mêmes conséquences métier :

1. **retirer `cancelled → draft`** — une facture annulée le reste ; on corrige
   par un avoir, ce que le produit sait déjà faire. C'est la plus conforme, et
   celle qui casse le geste de qui annule par erreur ;
2. **régénérer le numéro** à la résurrection — le document redevient un
   brouillon neuf, l'ancien numéro est brûlé. Conforme aussi, mais crée des
   trous dans la séquence, que R013 n'autorise peut-être pas ;
3. **interdire l'édition dès qu'un numéro a été émis**, quel que soit le
   statut — la garde porterait alors sur le document, pas sur un champ.

Choisir engage la conformité fiscale du produit et mérite l'avis d'un
comptable. La consigne d'autonomie du 2026-08-09 ne s'étend pas jusque-là :
*« ne jamais changer un calcul fiscal ou comptable »* (`JOURNAL.md` §0).

**Le banc reste rouge sur cette ligne, délibérément.** C'est le seul moyen de
garantir qu'elle ne s'oublie pas.

### Les six autres transitions non documentées, trouvées au même passage

Aucune n'a la même gravité, mais aucune n'est écrite :

| Document | Transition | Conséquence vérifiée |
|---|---|---|
| BL | `delivered → cancelled` | **sans danger** : `cancel()` appelle `restoreStock()`, et refuse si le BL est déjà facturé (`delivery_note_has_invoice`) |
| BL | `sent → delivered` | saute l'étape `signed` que la spec impose |
| BL | `draft → cancelled`, `sent → cancelled`, `signed → cancelled` | l'état `cancelled` n'est même pas dans l'énumération de `08-deliveries.md` |
| Commande d'achat | `sent → received` | passer une commande en « reçue » **à la main**, sans réception : aucun lot n'entre en stock, mais la commande se dit servie. La spec dit cette transition « automatique lors de la création d'un ReceptionBL » |

Et une transition documentée que le code **refuse** : `sent → signed` sur le BL.
Ce n'est pas un défaut — `signed` se pose par `PATCH /:id/signature`. C'est la
spec qui mélange deux chemins dans un même tableau.

**Contrôle :** `python3 scripts/banc-cycles-de-vie.py` — le graphe observé est
republié à chaque passage, avec son total décomposé.

---

## E022 — Deux effets « non négociables » qui ne se produisent pas

**Date :** 2026-08-09 · **Gravité :** moyenne · **Statut :** ⏳ **ouvert — décisions non prises**

`CLAUDE.md` §2 énumère six enchaînements déclarés non négociables. Le banc des
effets de bord les joue et mesure ce qui se produit **ailleurs** dans la base :

```
effets mesurés  12
tenus            7
rompus           5
```

Sur les cinq, **deux sont des erreurs de rédaction** (corrigées : la route
`/quotes/:id/convert-to-invoice` n'existe pas — c'est `/convert` ; le statut
résultant est `converted` et non `invoiced`), **un n'est pas mesurable** ici
(l'envoi de courriel, sans SMTP local — non réfuté, non couvert). Restent deux
écarts réels.

### ① `reserved` — un état lu par deux agrégats, écrit par personne

Le contrat dit : à la livraison, `status entries → reserved` ; au règlement,
`→ sold`. Mesuré : à la livraison, **dix lots passent directement en `sold`**.

Un `grep` sur tout `src/` le confirme — **aucun chemin d'écriture ne pose
jamais `reserved`**. L'état existe dans l'énumération de `StockEntry`, dans la
migration, et dans le type TypeScript. Il n'est produit nulle part.

Et il est **lu** à deux endroits :

```
src/dashboard/dashboard.service.ts:389   SUM(CASE WHEN se.status='reserved' THEN se.quantity ELSE 0 END)
src/reports/reports.service.ts:300       COUNT(*) FILTER (WHERE status='reserved') AS reserved_entries
```

**Ces deux chiffres valent zéro, toujours, quoi qu'il arrive dans l'entreprise.**
C'est exactement la forme d'E016 — un compteur qui ne mène nulle part — et de
M4 : une capacité servie que rien n'alimente.

⚠️ **Les écrans, eux, vont bien.** La colonne « réservé » de l'inventaire, du
détail article et du rapport de stock ne vient pas de ce statut : elle est
**calculée** depuis `reservedByDeliveryNoteId` joint aux BL non encore partis
(`src/stock/stock-availability.ts`). Ce fichier explique longuement pourquoi —
*« une colonne de réservation devrait être tenue à jour à chaque création,
modification, annulation et suppression de BL — exactement le genre de compteur
qui dérive de sa source »*. Le code a délibérément abandonné le modèle du
contrat pour un calcul dérivé, et il a eu raison.

**Ce qui reste faux, c'est donc le contrat — et les deux agrégats qui y sont
restés fidèles.**

### ② La TVA de 19 % n'est pas calculée

Le contrat dit « Auto-calcule TVA 19% ». Mesuré, sur une facture créée **sans
taux** :

```
HT 1 000,00    TVA mesurée 0,00    attendue 190,00    total 1 000,00
```

`sales-invoices.service.ts:114` : `taxAmount1 = dto.taxRate1 != null ? … : 0`.
Le taux n'est jamais déduit de l'article, ni des réglages du locataire, ni d'un
défaut de 19 %. **Si l'appelant ne le fournit pas, la facture sort sans TVA.**

En pratique l'interface l'envoie toujours, et aucune facture du jeu de
démonstration n'est à 0 %. Le risque n'est donc pas dans l'écran : il est dans
tout autre appelant — l'application mobile, un import, une intégration, une
facture récurrente — pour qui « auto-calcule » est une promesse écrite.

### La forme du défaut

> Un contrat d'effets de bord n'est tenu par rien. Il décrit ce qui doit se
> produire **ailleurs** — dans une autre table, après la réponse. Aucun type,
> aucun compilateur, aucun test de route ne le vérifie ; et un effet qui ne se
> produit pas **ne lève pas d'erreur**, il laisse simplement une valeur à zéro.

C'est le principe fondateur de `METHODE_TEST.md` appliqué à une clause de
contrat : *une donnée mal câblée ne casse pas, elle disparaît.*

### Ce que je n'ai PAS fait, et pourquoi

**Aucun correctif de comportement.** Les deux écarts touchent au fiscal et au
comptable :

- pour ①, corriger peut vouloir dire *écrire* `reserved` à la livraison puis
  `sold` au règlement — ce qui déplace la reconnaissance du coût des ventes du
  moment de la livraison à celui de l'encaissement, un changement de méthode
  comptable — ou bien *retirer* les deux agrégats morts et rectifier le
  contrat. Les deux se défendent ;
- pour ②, poser un défaut de 19 % change le montant de factures créées par
  toute autre voie que l'écran. On ne modifie pas un calcul de TVA sans avis.

La consigne d'autonomie du 2026-08-09 exclut explicitement ce terrain
(`JOURNAL.md` §0). **Le banc reste rouge sur ces deux lignes, délibérément**, et
`CLAUDE.md` §2 les porte désormais en marge.

**Contrôle :** `python3 scripts/banc-effets-de-bord.py`.

---

## E023 — Un `<form>` dans un `<form>`, et huit tests qui le disaient depuis le début

**Date :** 2026-08-09 · **Gravité :** moyenne · **Statut :** corrigé

`docs/CHANTIER_TESTS.md` s'ouvre sur ce défaut. Il servait d'argument au
chantier tout entier :

> *« une erreur console React `<form> cannot contain a nested <form>` sur la
> modale de création de facture. Introduite par la refonte visuelle, invisible
> à l'œil, invisible à la compilation. C'est l'argument de ce chantier en une
> phrase. »*

Trois mois plus tard, il était toujours là — et il faisait échouer **huit
tests** de la suite, sur les quatre modales de création de document : facture,
devis, bon de livraison, commande d'achat.

### Ce que c'était

`BandeauScan`, le bandeau de saisie à la douchette, était un `<form>`. Il est
rendu **à l'intérieur** du formulaire du document (`InvoicesPage.tsx:524`, dans
le `<form>` ouvert ligne 488).

```
body > div > form > div > form
```

### La forme du défaut

> Un composant qui porte son propre `<form>` est **inutilisable à l'intérieur
> d'un formulaire**, et rien dans son interface ne le dit. Il s'importe et se
> pose comme n'importe quel autre ; l'incompatibilité n'apparaît qu'à
> l'exécution, dans la console, sur un écran que personne ne regarde.

C'est M4 retourné : non pas une capacité servie et jamais appelée, mais une
**contrainte portée et jamais déclarée**.

### Ce qu'il fallait pour le nommer

Trois pas, et aucun n'était évitable :

1. **La suite disait « erreurs console : 2 »**, sans plus. Utile pour savoir
   qu'il se passe quelque chose, inutile pour savoir quoi.
2. `msg.text()` de Playwright rend le **gabarit** du message React — « In HTML,
   %s cannot be a descendant of <%s>. » — sans ses arguments. Il a fallu lire
   `msg.args()` pour obtenir `<form> | form`.
3. ⚠️ **Et surtout : vérifier que l'imbrication était RÉELLE.** Le `Modal`
   s'appuie sur `Dialog.Portal` de Radix, qui rend dans `document.body` : on
   pouvait raisonnablement conclure que React se plaignait de son propre arbre
   et que le DOM, lui, allait bien. Un `document.querySelectorAll('form')` a
   tranché — `form > div > form`, l'imbrication existait bel et bien.

   Sans ce troisième pas, la conclusion « faux positif du portail » était
   plausible, confortable, et fausse. C'est E004 : *établir d'abord quelle
   propriété on mesure.*

### Ce que ça cassait, concrètement

Un `<form>` imbriqué n'a pas de propriétaire de soumission défini. La touche
Entrée dans le champ de scan pouvait **enregistrer le document** au lieu
d'ajouter une ligne — au milieu d'une saisie, sur une facture incomplète.

### Correctif

`BandeauScan` est un `<div>`. Entrée est traitée par `onKeyDown` avec
`stopPropagation()`, le bouton porte `type="button"` — dans un formulaire, un
bouton sans type vaut `submit`. Le comportement visible est identique.

**Effet mesuré sur la suite :**

```
avant   78 passés / 17 échoués
après   85 passés / 10 échoués
```

**Contrôle :** `cd e2e && npx playwright test` — les huit tests portent
`errors.assert(...)`, qui refuse toute erreur console.

### Ce qui reste, et pourquoi ce n'est pas le même sujet

Dix échecs subsistent, tous **antérieurs** à ce chantier, en trois familles :

| Famille | Tests | Forme |
|---|---|---|
| `locator('select')` introuvable | 4 | l'écran n'a plus de `<select>` natif — test périmé par la refonte |
| dépendance à l'état | 1 | `19-detail:88` passe seul, échoue après les autres (R030 / M8) |
| divers | 5 | 400 sur `POST /expenses`, `<dialog>` absent, `/Ajouter/i` ambigu, `input[type=email]` introuvable |

Aucun n'a été trié plus avant. **C'est écrit ici pour que l'absence soit une
décision, pas un oubli.**

---

## E024 — Le quatrième chemin vers une facture, celui que le commentaire annonçait

**Date :** 2026-08-09 · **Gravité :** élevée (marge brute faussée) · **Statut :** corrigé

`SalesInvoicesService` porte, depuis la correction d'**E015**, ce commentaire :

> *« Trois chemins mènent à une facture — saisie directe, bon de livraison,
> devis — et les trois doivent figer le coût. Le faire à trois endroits
> garantissait qu'un jour l'un des trois serait oublié, et la marge d'une
> facture issue d'un BL serait devenue fausse sans que rien ne le dise. »*

Il y en avait un **quatrième**. `DeliveriesService.createInvoice` — la route
`POST /deliveries/delivery-notes/:id/create-invoice` — écrit ses propres lignes
de facture, dans un autre service, et `unitCost` **ne figurait pas dans la
liste des colonnes**.

### La conséquence

Une facture créée depuis un bon de livraison sortait avec `unitCost = NULL` sur
toutes ses lignes. Le coût des marchandises vendues sommant `unitCost ×
quantité`, ces lignes comptaient pour **zéro**.

> **La marge brute de ces factures valait 100 %.** C'est E015, mot pour mot,
> par une autre porte — et trois mois après sa correction.

### La forme du défaut

C'est **M13** dans sa version la plus ironique : *« le même geste écrit
ailleurs »*. Le commentaire du service principal **annonce le risque**, compte
les chemins — et se trompe de compte, parce que le quatrième n'est pas dans le
même fichier.

> Compter les endroits où une règle doit s'appliquer ne sert à rien si on les
> compte **dans le fichier qu'on est en train de lire**. La question n'est pas
> « combien de chemins ai-je ici », c'est **« qui d'autre insère dans cette
> table ? »** — et la réponse s'obtient par un `grep`, pas par la mémoire.

### Comment il a été trouvé

Pas par une relecture. `scripts/provision-decor.sh` a été étendu pour poser une
paire BL → facture (le parcours écran en avait besoin), et
`verifier-comptabilite.js` est passé au rouge **au passage suivant** :

```
ECHEC toutes les lignes portent un coût figé
      3 ligne(s) sur 3558 sans coût
```

Trois lignes sur trois mille cinq cent cinquante-huit. Le contrôle a mordu sur
un millième de la table — c'est exactement pour ça qu'il exige **zéro** et non
« presque toutes ».

### Correctif

L'`INSERT` porte désormais `unitCost`, calculé par la même expression que
`SalesInvoicesService.coutsUnitaires`. Vérifié : une facture créée depuis un BL
porte un coût de 900,00 pour un article reçu à 900,00.

⚠️ **L'expression est recopiée** — couple assumé au sens de R029, faute de
pouvoir importer le service sans dépendance circulaire. **Le vrai remède est
qu'il n'y ait qu'un seul créateur de facture.** Tant qu'il y en a deux, un
cinquième chemin reste possible. À trancher par le produit.

**Contrôle :** `node scripts/verifier-comptabilite.js` — « toutes les lignes
portent un coût figé ».

### ⚠️ Et une maladresse de ma part, consignée pour ce qu'elle apprend

En diagnostiquant, j'ai lancé un `DELETE FROM sales_invoice_items WHERE
"unitCost" IS NULL …` pour « nettoyer » avant de mesurer le nouveau
comportement. C'était **supprimer la preuve plutôt que la corriger** : quatre
factures se sont retrouvées avec un total de 1 428,00 DA et **aucune ligne**.

Elles ont été reconstruites depuis leur BL d'origine — ce que la route fait
elle-même —, et aucune donnée du jeu de démonstration n'était concernée : les
quatre avaient été créées le jour même par le décor. Vérifié avant réparation,
et vérifié après : plus aucune facture sans ligne.

> Devant une donnée qui gêne une mesure, le réflexe correct est de **la
> corriger** (`UPDATE`) ou de **restreindre la mesure**, jamais de la
> supprimer. Un `DELETE` sur des lignes de facture est irréversible, et il
> l'était ici sans sauvegarde.
