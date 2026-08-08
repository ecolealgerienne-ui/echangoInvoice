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
qui ne rend **rien**. Mesuré le 2026-08-08, après la migration du droit de
timbre : la sonde produit une migration d'une vingtaine d'instructions, toutes
des `DROP CONSTRAINT` de clés étrangères (`stock_entries`, `production_*`,
`bom_lines`, `partner_contacts`, `users`, `subscriptions`, `quote_items`…).

Les colonnes du timbre, elles, n'y figurent pas : **l'écart est préexistant**,
pas introduit par ce lot.

### Pourquoi c'est dangereux tel quel

Un futur `migration:generate` fait pour une petite évolution embarquera ces
`DROP CONSTRAINT` dans une migration qu'on relira comme additive — et
supprimera en production des contraintes d'intégrité que personne n'aura voulu
retirer. C'est exactement le scénario que décrit R024.

À traiter comme un chantier propre : déclarer les relations manquantes dans les
entités, ou nommer les contraintes existantes, jusqu'à ce que la sonde rende le
vide.
