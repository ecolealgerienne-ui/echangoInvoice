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
