# CLAUDE.md — Chambre Froide Djelfa · Invoicing SaaS

> **Ce fichier = règles d'action uniquement.**
> Specs par module → `docs/specs/00-overview.md` … `docs/specs/14-settings.md`
> Architecture descriptive → `docs/ARCHITECTURE.md`
> Erreurs connues → `docs/ERREURS.md`
> Statut features → `docs/STATUS.md`

---

## 0. PROTOCOLE DE DÉMARRAGE — Avant chaque tâche

```
[ ] 1. Consulter docs/ERREURS.md — une erreur similaire existe peut-être déjà
[ ] 2. Vérifier les invariants R001–R020 concernés par cette tâche
[ ] 3. Annoncer le modèle adapté (section 3)
[ ] 4. Produire un /plan avant d'écrire du code sur toute tâche > 2 fichiers
[ ] 5. Attendre validation du /plan avant d'implémenter
```

**Après toute implémentation significative :**
Mettre à jour `docs/STATUS.md` si le statut d'une feature change.

---

## 1. INVARIANTS ABSOLUS (R001–R032) — Violations = rejet immédiat du code

> R001–R020 sont issus des specs initiales. **R021–R032 ont été ajoutés le
> 2026-08-07**, adaptés de `echangopromo` — mais aucun n'est repris parce qu'il
> existe ailleurs : chacun référence un défaut mesuré dans *ce* dépôt, cité en
> italique. C'est ce qui permet de reconnaître un cas nouveau relevant de la
> même règle.

---

### R001 — Types TypeORM toujours explicites

**`@Column()` nu est interdit sur tout champ.**

```typescript
// ✅ CORRECT
@Column({ type: 'varchar', nullable: true }) name?: string;
@Column({ type: 'int', default: 0 }) count: number;
@Column({ type: 'decimal', precision: 12, scale: 2 }) amount: number;
@Column({ type: 'decimal', precision: 10, scale: 2 }) quantity: number;
@Column({ type: 'enum', enum: ['draft', 'sent', 'paid'] }) status: string;

// ❌ INTERDIT — TypeORM infère "Object" → crash DataTypeNotSupportedError
@Column() amount: number;
@Column() status: string;
```

**Vérification :**
```bash
grep -rn "@Column()" src/ | grep -v "// OK"
```

---

### R002 — Migration obligatoire pour tout changement de schéma

**Toute nouvelle entité, colonne ajoutée, ou colonne modifiée = migration dans le même commit.**

`synchronize: true` est **interdit** en production. En développement uniquement.

```typescript
// Template migration
export class AddMonChamp1709980000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "ma_table" ADD COLUMN IF NOT EXISTS "mon_champ" varchar(255)`
    );
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "ma_table" DROP COLUMN IF EXISTS "mon_champ"`
    );
  }
}
```

**Vérification :** chaque PR qui touche une entity doit avoir un fichier dans `src/database/migrations/`.

---

### R003 — Pas de secrets hardcodés + fail-fast obligatoire

```typescript
// ✅ CORRECT — crash au démarrage si manquant
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`[FATAL] Variable d'environnement manquante: ${name}`);
  return value;
}

// ❌ INTERDIT
const secret = 'mon-secret-jwt';
const key = process.env.API_KEY || 'fallback'; // échec silencieux
```

Variables d'environnement requises (toutes via `requireEnv()`) :
```
DATABASE_URL, JWT_SECRET, JWT_EXPIRY, REFRESH_TOKEN_EXPIRY,
EMAIL_SMTP_HOST, EMAIL_SMTP_PORT, EMAIL_SMTP_USER, EMAIL_SMTP_PASSWORD,
STORAGE_TYPE, STORAGE_PATH, NODE_ENV, PORT
```

---

### R004 — NestJS Logger uniquement, jamais console.*

```typescript
// ✅ CORRECT
import { Logger } from '@nestjs/common';
private readonly logger = new Logger(MonService.name);
this.logger.warn('Message descriptif');
this.logger.error('Erreur', error.stack);

// ❌ INTERDIT dans le backend
console.log(...)
console.error(...)
console.warn(...)
```

**Vérification :**
```bash
grep -rn "console\." src/
```

---

### R005 — Transactions QueryRunner obligatoires sur les opérations multi-tables

**Toute opération qui touche plus d'une table doit utiliser un QueryRunner avec rollback automatique.**

```typescript
// ✅ CORRECT
const queryRunner = this.dataSource.createQueryRunner();
await queryRunner.connect();
await queryRunner.startTransaction();
try {
  await queryRunner.manager.save(DeliveryNote, deliveryNote);
  await this.stockService.decrementFIFO(queryRunner, items); // passe le queryRunner
  await queryRunner.commitTransaction();
} catch (error) {
  await queryRunner.rollbackTransaction();
  throw error;
} finally {
  await queryRunner.release();
}

// ❌ INTERDIT — opérations multi-tables sans transaction
await this.deliveryNoteRepo.save(deliveryNote);
await this.stockService.decrement(items); // si ça plante → stock incohérent
```

**Opérations qui exigent une transaction :**
- Création d'un `DeliveryNote` → décrémentation stock (FIFO)
- Création d'un `ReceptionBL` → création `StockEntry` + update `InventorySummary`
- Enregistrement d'un `Payment` → update `amountPaid`, `amountDue`, statut facture
- Toute opération avec side effects multiples

---

### R006 — Gestion d'erreur centralisée — jamais de catch silencieux

**Backend :**

```typescript
// ✅ CORRECT — AllExceptionsFilter global (src/common/filters/exception.filter.ts)
// Format de réponse d'erreur standardisé — `message` est une CLÉ i18n :
{
  "statusCode": 409,
  "message": "errors.duplicate_entry",
  "field": "blNumber"   // optionnel
}

// ✅ CORRECT — les services throw une clé, jamais une phrase
if (!customer) throw new NotFoundException('errors.customer_not_found');

// ❌ INTERDIT — message en dur : le frontend ne peut plus le traduire,
//    et la chaîne française fuit jusqu'à l'utilisateur (R018)
if (!customer) throw new NotFoundException(`Client ${id} introuvable`);

// ❌ INTERDIT — catch silencieux dans un service
try {
  await this.repo.save(entity);
} catch (e) {
  // rien → bug invisible
}
```

⚠️ **Toute clé levée côté backend doit exister dans `shared/src/i18n/fr.json`,
section `errors.*`, dans le même commit.** `resolveApiError` tente `t(clé)` puis
`t('errors.' + clé)` avant de retomber sur `errors.generic` : une clé absente
n'échoue nulle part, elle affiche juste un message générique. La désynchronisation
est silencieuse des deux côtés.

*État au 2026-08-07 : 89 `throw` utilisent la clé nue (`'credit_note_not_found'`)
au lieu de la clé préfixée. Ça fonctionne par le repli ci-dessus, mais la
convention a dérivé. Et au moins un message est une phrase française en dur —
`« Montant (…) supérieur au solde dû (…) »` dans le service de paiements.*

**Frontend :**

```typescript
// ✅ CORRECT — intercepteur axios global
// - Toutes les erreurs API affichées via toast
// - 401 → refresh token automatique → retry
// - Refresh échoue → redirect /login

// ✅ CORRECT — React Error Boundary wrapping l'app
// Composant ErrorBoundary entoure <App /> dans main.tsx
```

**Codes d'erreur DB :**
- `23505` (unique constraint) → HTTP 409
- `23503` (foreign key) → HTTP 422

---

### R007 — API versioning et envelope de réponse obligatoires

**Toute route API doit être préfixée `/api/v1/`.**

```typescript
// ✅ CORRECT — dans main.ts
app.setGlobalPrefix('api/v1');

// ✅ CORRECT — réponse liste
{
  "data": [...],
  "pagination": { "total": 45, "page": 1, "limit": 20 }
}

// ✅ CORRECT — réponse objet unique
{
  "data": { "id": "uuid", ... }
}

// ❌ INTERDIT — retourner un tableau brut ou un objet sans envelope
return customers; // ← pas d'envelope
```

**Swagger :** chaque controller et chaque DTO doivent être décorés avec `@ApiTags`, `@ApiOperation`, `@ApiResponse`.

---

### R008 — Calculs financiers backend uniquement

**Le frontend ne calcule jamais de montants, TVA, totaux ou marges.**

```typescript
// ✅ CORRECT — service backend
const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
const taxAmount = Math.round(subtotal * taxRate) / 100; // taxRate depuis settings
const totalAmount = subtotal + taxAmount;

// ❌ INTERDIT — frontend
const tva = subtotal * 0.19; // jamais en React
```

**Règles de calcul :**
```
lineTotal    = quantity × unitPrice
subtotal     = SUM(lineTotal) de tous les items
taxAmount    = subtotal × (taxRate / 100)   ← taxRate depuis settings (défaut 19)
totalAmount  = subtotal + taxAmount
grossMargin  = revenue - purchaseCost
netProfit    = grossMargin - expenses
```

**Précision décimale :**
- Montants : `decimal(12, 2)`
- Quantités : `decimal(10, 2)`
- Jamais de `parseFloat()` pour des calculs intermédiaires financiers

---

### R009 — Timezone : UTC stockage, Africa/Algiers affichage

```typescript
// ✅ CORRECT — backend : toujours UTC en base
@Column({ type: 'timestamptz' }) invoiceDate: Date; // stocké UTC

// ✅ CORRECT — frontend : afficher en heure algérienne
new Intl.DateTimeFormat('fr-DZ', { timeZone: 'Africa/Algiers' }).format(date)

// ❌ INTERDIT
new Date().toLocaleDateString() // dépend du fuseau du navigateur
```

---

### R010 — Pagination uniforme sur tous les endpoints liste

**Tous les `GET` qui retournent une collection doivent supporter la pagination et retourner le même format.**

```typescript
// ✅ CORRECT — query params standards
GET /api/v1/customers?page=1&limit=20&search=nom

// ✅ CORRECT — réponse
{
  "data": [...],
  "pagination": {
    "total": 45,
    "page": 1,
    "limit": 20
  }
}

// ❌ INTERDIT — format custom par endpoint
{ "items": [...], "count": 45 }
{ "results": [...], "totalPages": 3 }
```

⚠️ **Exception à vérifier avant de paginer un endpoint existant.** Si un client
le consomme aujourd'hui comme une **liste de référence complète** (un sélecteur,
un cache mobile), ajouter la pagination le tronque silencieusement dès que le
total dépasse la taille de page par défaut. Vérifier les consommateurs — web,
mobile, autre service — avant d'activer une pagination par défaut sur un endpoint
déjà servi.

Les endpoints qui ne paginent volontairement pas : `/settings` (singleton),
`/dashboard/*`, `/production/dashboard`, `/admin/stats` (agrégats),
`/admin/plans` (3 lignes fixes).

---

### R011 — Soft delete : filtre WHERE deletedAt IS NULL toujours explicite

```typescript
// ✅ CORRECT
await this.repo.find({ where: { id, deletedAt: IsNull() } });
await this.repo
  .createQueryBuilder('c')
  .where('c.id = :id', { id })
  .andWhere('c.deletedAt IS NULL')
  .getOne();

// ❌ INTERDIT — ne pas filtrer (peut retourner des entités supprimées)
await this.repo.findOne({ where: { id } });
```

TypeORM `@DeleteDateColumn` avec `withDeleted()` est réservé aux cas intentionnels (admin, audit).

---

### R012 — Audit trail : createdBy / updatedBy alimentés automatiquement

```typescript
// ✅ CORRECT — via un interceptor ou middleware NestJS
// src/common/interceptors/audit.interceptor.ts
entity.updatedBy = request.user.id; // depuis le JWT décodé

// ❌ INTERDIT — alimenter manuellement dans chaque service
entity.updatedBy = userId; // répétition, oubli possible
```

Toutes les entités ayant un cycle de vie métier incluent :
```typescript
@Column({ type: 'varchar', nullable: true }) createdBy: string;
@Column({ type: 'varchar', nullable: true }) updatedBy: string;
```

---

### R013 — Auto-numérotation avec lock DB

**La génération de numéros séquentiels (BL, FAC, PO) doit utiliser un lock pour éviter les doublons en concurrence.**

```typescript
// ✅ CORRECT — advisory lock PostgreSQL dans une transaction
await queryRunner.query(`SELECT pg_advisory_xact_lock(1)`);
const last = await queryRunner.manager
  .createQueryBuilder(DeliveryNote, 'dn')
  .where('EXTRACT(YEAR FROM dn.createdAt) = :year', { year })
  .orderBy('dn.blNumber', 'DESC')
  .limit(1)
  .getOne();
const next = last ? parseInt(last.blNumber.split('-')[2]) + 1 : 1;
return `BL-${String(year).slice(-2)}-${String(next).padStart(3, '0')}`;

// ❌ INTERDIT — génération sans lock → doublons possibles sous charge
```

Formats par défaut (configurables dans settings) :
- BL vente : `BL-YY-###`
- BL réception : `BL-REC-YY-###`
- Facture : `FAC-YY-###`
- Commande achat : `PO-YY-###`

Toutes les colonnes de numérotation ont une contrainte `UNIQUE` en base.

⚠️ **Un numéro émis est consommé définitivement — la numérotation ne filtre
JAMAIS les documents supprimés.** L'index unique porte sur `(numéro, tenantId)`
sans exclure les lignes soft-deleted : si le générateur, lui, les exclut, il
régénère un numéro déjà pris et l'insertion échoue en 500. C'est aussi la bonne
sémantique comptable — une facture annulée ne libère pas son numéro.

```typescript
// ✅ CORRECT — @DeleteDateColumn filtre par défaut, il faut l'exclure explicitement
const last = await qr.manager
  .createQueryBuilder(DeliveryNote, 'dn')
  .withDeleted()                                    // ← indispensable
  .where('dn.tenantId = :tenantId', { tenantId })
  .andWhere('EXTRACT(YEAR FROM dn."createdAt") = :year', { year })
  .orderBy('dn.blNumber', 'DESC')
  .limit(1).getOne();

// ❌ INTERDIT — le numéro d'un document supprimé serait réattribué
  .andWhere('dn.deletedAt IS NULL')
```

⚠️ **Retirer le `.andWhere('deletedAt IS NULL')` ne suffit pas** : toutes ces
entités portent `@DeleteDateColumn`, donc TypeORM ajoute le filtre de lui-même.
Sans `.withDeleted()`, le comportement reste inchangé. Les requêtes SQL brutes,
elles, n'ont pas ce filtre implicite : il suffit de ne pas l'écrire.

*Trouvé le 2026-08-07 : `BL-26-801` supprimé en douceur, générateur voyant
`BL-26-800`, régénérant `BL-26-801` → violation de `UQ_delivery_notes_bl_number_tenant`.
Les huit générateurs étaient concernés, sauf `PO` et `BL-REC` qui utilisaient
déjà `.withDeleted()`.*

Cette règle est la seule exception à R011, et elle est délibérée : partout
ailleurs, le filtre `deletedAt IS NULL` reste obligatoire.

---

### R014 — PDF : archivage au chemin imposé

```typescript
// ✅ CORRECT
const path = `ARCHIVES/${year}/${month}/${type}/${filename}.pdf`;
// Exemples :
// ARCHIVES/2024/06/BL/BL-24-001.pdf
// ARCHIVES/2024/06/FACTURES/FAC-24-001.pdf

// ❌ INTERDIT — chemin libre ou non structuré
const path = `uploads/${filename}.pdf`;
const path = `pdfs/bl/${id}.pdf`;
```

Le `type` correspond au sous-répertoire : `BL`, `FACTURES`, `RAPPORTS`.

---

### R015 — FIFO stock : oldest entries first, transitions d'état obligatoires

```typescript
// ✅ CORRECT — lors de la création d'un DeliveryNote
const entries = await queryRunner.manager
  .createQueryBuilder(StockEntry, 'se')
  .where('se.rawMaterialId = :id', { id: item.materialId })
  .andWhere('se.status = :status', { status: 'available' })
  .andWhere('se.deletedAt IS NULL')
  .orderBy('se.enteredAt', 'ASC') // ← FIFO : les plus anciens d'abord
  .getMany();

// ❌ INTERDIT — ordre non défini ou LIFO
.orderBy('se.enteredAt', 'DESC')
```

**Transitions de statut StockEntry, telles qu'implémentées :**
```
available → sold      (création d'un BL — consommation FIFO)
sold      → available (annulation/suppression du BL)
available → adjusted  (ajustement manuel)
```

⚠️ **`stockQuantity` sur `finished_products` est un CACHE, jamais une source.**
La vérité est dans les lots ; l'agrégat se recalcule depuis eux via
`recomputeProductStock` (`src/stock/recompute-product-stock.ts`). Toute sortie
doit donc **consommer des lots**, jamais décrémenter le cache directement —
sinon la prochaine réception, qui recalcule depuis les lots, ressuscite ce qui
est parti.

*Trouvé et reproduit le 2026-08-08 : `decrementStock` faisait un
`UPDATE finished_products SET stockQuantity` sans toucher aux lots — le
commentaire disait « sans FIFO » quand Swagger annonçait l'inverse. Séquence
100 reçus → 30 livrés → 50 reçus donnait **150 au lieu de 120**.*

**Un lot entamé se scinde** : la part sortie devient un lot `sold` rattaché au
BL (`reservedByDeliveryNoteId`), le reste demeure `available`. C'est ce qui rend
l'annulation réversible et permet de savoir quel lot est parti chez qui.

Le stock négatif reste toléré — le métier livre parfois avant de régulariser —
mais il est désormais **visible** : la quantité manquante n'est prise sur aucun
lot et un avertissement remonte.

**Vérification :**
```bash
# Aucune écriture directe de stockQuantity hors du recalcul partagé
grep -rn 'SET "stockQuantity"' src/ | grep -v recompute-product-stock
```

---

### R016 — Indexes DB obligatoires

**Toute nouvelle table doit indexer :**
1. Toutes les colonnes FK
2. Les colonnes de filtre/tri fréquent : `status`, `invoiceDate`, `expiresAt`, `createdAt`, `deletedAt`

```typescript
// ✅ CORRECT dans la migration
CREATE INDEX "IDX_delivery_notes_customer_id" ON "delivery_notes" ("customerId");
CREATE INDEX "IDX_delivery_notes_status" ON "delivery_notes" ("status");
CREATE INDEX "IDX_stock_entries_expires_at" ON "stock_entries" ("expiresAt");
```

---

### R017 — Sécurité : Helmet + CORS + Rate Limiting + Validation

```typescript
// ✅ CORRECT — main.ts
import helmet from 'helmet';
app.use(helmet());
app.enableCors({ origin: process.env.ALLOWED_ORIGINS?.split(',') ?? [] });
app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));

// Rate limiting sur les routes sensibles (/auth/login, /auth/refresh)
// Utiliser @nestjs/throttler
```

**Règles JWT :**
- Access token : 1h
- Refresh token : 7 jours, rotation à chaque usage (l'ancien est invalidé)
- Jamais de secret JWT hardcodé (voir R003)

**CORS :**
- Origines autorisées via env var `ALLOWED_ORIGINS` (liste séparée par virgules)
- Aucun wildcard `*` en production

---

### R018 — i18n : aucune chaîne user-visible hardcodée

**Tout texte affiché à l'utilisateur doit passer par le système de traduction.**

```typescript
// ✅ CORRECT — frontend
const { t } = useTranslation();
<h1>{t('suppliers.title')}</h1>
<Button>{t('common.save')}</Button>

// ✅ CORRECT — messages d'erreur via clé
toast.error(t(`errors.${error.code}`));

// ❌ INTERDIT
<h1>Fournisseurs</h1>
toast.error('Une erreur est survenue');
```

**Phase 1 :** Français uniquement. Structure i18n en place dès le début pour permettre l'ajout de l'arabe sans refactoring.

Fichiers : `src/i18n/fr.json` — toutes les clés dès la création du composant.

---

### R019 — Pas de logique métier dans les controllers

```typescript
// ✅ CORRECT — controller : HTTP uniquement
@Post()
async create(@Body() dto: CreateDeliveryNoteDto, @CurrentUser() user: User) {
  return this.deliveryNotesService.create(dto, user.id);
}

// ❌ INTERDIT — logique dans le controller
@Post()
async create(@Body() dto: CreateDeliveryNoteDto) {
  const subtotal = dto.items.reduce(...); // ← appartient au service
  dto.status = 'draft';                   // ← appartient au service
  return this.repo.save(dto);
}
```

---

### R020 — tenantId obligatoire sur toutes les queries — zéro fuite cross-tenant

**Toute query sur une entité métier doit filtrer par `tenantId` extrait du JWT, jamais depuis l'URL.**

```typescript
// ✅ CORRECT — tenantId depuis le JWT via @CurrentUser()
async findOne(id: string, tenantId: string) {
  return this.repo.findOne({ where: { id, tenantId, deletedAt: IsNull() } });
}

// ✅ CORRECT — QueryBuilder
.where('c.id = :id AND c.tenantId = :tenantId', { id, tenantId })

// ❌ INTERDIT — oubli du tenantId → un tenant peut lire les données d'un autre
await this.repo.findOne({ where: { id } });

// ❌ INTERDIT — tenantId depuis l'URL ou le body (falsifiable)
async findOne(@Param('tenantId') tenantId: string, @Param('id') id: string) { ... }
```

**Auto-numérotation multi-tenant (R013) :**
```typescript
// Lock scopé par tenant pour éviter les doublons
await queryRunner.query(
  `SELECT pg_advisory_xact_lock(hashtext('quote_number_' || $1))`, [tenantId]
);
// Query last number WHERE tenantId = tenantId AND year = year
```

**Contraintes unique toutes composites :**
```sql
UNIQUE ("number", "tenantId")   -- pour BL, FAC, DEV, PO
```

**Vérification :**
```bash
# Toute query repo.findOne/find sans tenantId dans le where est une violation
grep -rn "findOne\|find({" src/ | grep -v "tenantId"
```

---

### R021 — Un DTO décoré n'est pas un DTO borné

**Pour chaque champ, se demander : quelle valeur extrême le fait sortir de ce que
la base, le calcul ou l'affichage savent encaisser ?** Ce que la base refuse,
l'entrée doit le refuser d'abord — sinon Postgres lève et l'utilisateur reçoit un
500 là où un 422 était dû.

```typescript
// ❌ TROUVÉ — colonne decimal(12,2), aucun plafond côté entrée
@ApiProperty() @IsNumber() @Min(0) unitPrice: number;

// Reproduit le 2026-08-07 :
//   POST /invoices/sales-invoices  {"unitPrice": 1e14}
//   → 500  QueryFailedError: numeric field overflow

// ✅ CORRECT — la borne se nomme une fois, à côté de la colonne
export const MONTANT_MAX = 9_999_999_999.99;   // decimal(12, 2)
@ApiProperty() @IsNumber() @Min(0) @Max(MONTANT_MAX) unitPrice: number;
```

`@IsPositive` sans plafond, `@IsString` sans `@MaxLength`, `@IsArray` sans
`@ArrayMaxSize` sont des bornes **manquantes**, pas des choix.

⚠️ **`NaN` traverse toutes les comparaisons** : `NaN <= max` et `NaN > min` sont
**tous les deux faux**. Toute comparaison numérique sur une donnée venue du
réseau établit d'abord que c'est un nombre fini (`Number.isFinite`), jamais
supposé d'un `@IsNumber` en amont.

⚠️ **Un `@Body() dto: { reason?: string }` typé en ligne n'est pas validé du
tout** — le type disparaît à la compilation, la validation est à l'exécution, et
le `ValidationPipe` ne valide que les classes décorées. *Mesuré au 2026-08-07 :
0 occurrence, la discipline est acquise ; cette règle existe pour qu'elle ne se
relâche pas.*

**Vérification :**
```bash
grep -rc "@IsNumber" src/ --include=*.dto.ts   # à comparer au nombre de @Max
grep -rn "@Body()[^)]*: *{" src/               # doit rendre 0
```

---

### R022 — Toute garde, tout module écrit doit être branché dans le même commit

**Une méthode d'autorisation définie mais jamais appelée est un signal d'alarme,
pas un détail.** Un module non branché donne une fausse impression de couverture
— pire qu'une absence déclarée, parce que le code existe et que personne ne le
cherche.

*Trouvé le 2026-08-07 : le commit `0e9347e` a rendu `refresh_tokens.jti`
obligatoire et mis à jour `auth.service.ts`, mais a laissé
`admin/auth/admin-auth.service.ts` de côté. Tout le module admin SaaS (spec 16)
répondait 500 au login — aucune erreur au build, aucun test pour le dire.*

**Corollaire — ce que le serveur sert doit avoir un appelant.** Une route neuve
n'est pas finie tant qu'un écran ne l'appelle pas ; ce qui n'a plus d'appelant se
supprime. Une capacité écrite, testée et appelée nulle part ne produit pas
d'erreur : elle produit une fonctionnalité absente que personne ne cherche.

---

### R023 — Polarité de protection : la route qu'on oublie est OUVERTE

Chaque contrôleur pose son propre `@UseGuards` d'**authentification** ; il n'y a
pas de `JwtGuard` global. L'oubli ne se voit donc ni à la compilation, ni à
l'exécution, ni dans les journaux — à l'inverse d'un garde global dont on se
retire explicitement.

⚠️ **Le seul garde global est le `ThrottlerGuard`** (`app.module.ts`, fourni via
`APP_GUARD`). *Il ne l'était pas jusqu'au 2026-08-08 : `ThrottlerModule` était
enregistré, les `@Throttle` décoraient bien les routes d'auth, et **rien ne les
appliquait** — 20 tentatives de login consécutives, aucun 429. Cette section
elle-même affirmait le contraire, ce qui en faisait un état périmé au sens de
R031.* Limites effectives, vérifiées : `register` 5/min, `login` 10/min,
`refresh` 20/min, tout le reste 100/min.

**Conséquence directe : toute route publique est épinglée nommément ici, avec sa
justification.** Une route publique non listée est un défaut, pas un choix.

| Route publique | Pourquoi |
|---|---|
| `GET /api/v1/health` | sonde de connectivité mobile (spec 17 §3.2) — un token expiré ne doit pas passer pour une panne réseau |
| `POST /api/v1/auth/login` · `register` · `refresh` | délivrent le jeton ; rate-limités par `@Throttle` (R017) |
| `POST /api/v1/admin/auth/login` · `refresh` | idem pour le superadmin |

⚠️ **Ne jamais énumérer « les routes protégées » depuis leur garde** : l'ensemble
contrôlé rétrécirait avec ce qu'il contrôle.

**Vérification :**
```bash
for f in $(grep -rl '@Controller' src/ --include=*.controller.ts); do
  grep -q 'UseGuards' "$f" || echo "PUBLIC: $f"
done
```

---

### R024 — Un `@Index()` d'entité ne crée rien par lui-même

`synchronize: false` est permanent (R002) : **le schéma est tenu par les seules
migrations versionnées.** Un décorateur `@Index()` non repris dans un
`CREATE INDEX` est un commentaire, pas un index — la base tourne sans lui, et le
prochain `migration:generate` l'émettra dans une migration qu'on croira additive.

Toute pose d'`@Index()` s'accompagne de sa migration, dans le même commit (R002,
R016).

⚠️ **La mesure de l'écart entité ↔ base, c'est un `migration:generate` qui ne
rend RIEN.** Tant qu'il rend quelque chose, les deux ne disent pas la même chose
— même quand « ce ne sont que des renommages ». La sortie vide est la seule
normale.

---

### R025 — `migration:generate` écrit un fichier, ce n'est pas une lecture

Une génération exploratoire laisse une **migration en attente**. Comme TypeORM
enveloppe **toutes** les migrations en attente dans **une seule transaction**, un
fichier oublié fait échouer le lot entier — et annule au passage les migrations
légitimes appliquées dans le même `run`.

Supprimer le fichier exploratoire avant tout `migration:run`. Et **ne jamais
filtrer la sortie d'un `run` sur les seules lignes de succès** : c'est ainsi
qu'un échec passe pour un succès.

---

### R026 — Bannir `Promise.all(map(async => findOne/count))`

C'est un signal quasi certain de N+1. Chercher l'équivalent en une requête SQL
agrégée (`GROUP BY`, sous-requête, `JOIN LATERAL`) **avant** d'écrire ce pattern.

*Trouvé le 2026-08-07 : deux occurrences dans `production/nomenclature.service.ts`
(résolution des lignes de nomenclature).*

---

### R027 — Ne jamais retourner une entité TypeORM via un spread

`{...entity, extra}` transforme l'instance en objet plain et **désactive
silencieusement les `@Exclude()`** du `ClassSerializerInterceptor`. Retourner
l'instance de classe, ou une DTO de sortie dédiée.

*Trouvé le 2026-08-07 : `customers.service.ts` renvoie `{...customer, history}`.*

---

### R028 — Une clé de configuration n'existe pas tant qu'elle n'est pas dans le `.env` qui tourne

`.env.example` est un **document**, lu par aucun processus. Le `.env` réel vit
**uniquement dans le clone WSL** (voir §10), n'est pas versionné, et **ne se met
pas à jour en tirant une branche**. Ajouter une clé au seul `.env.example`
produit l'inverse de ce qu'on croit : le dépôt annonce un réglage que
l'environnement qui tourne ignore.

Le défaut est **silencieux par construction** quand un repli existe : rien ne
distingue « la clé est absente, je retombe sur la valeur par défaut » de « la clé
vaut cette valeur ».

**En pratique** : toute clé ajoutée l'est dans `.env.example` **et** dans le
`.env` de WSL, dans le même geste — ce dernier étant hors dépôt, le **dire** dans
le message de commit, sinon personne ne saura que ça reste à faire.

---

### R029 — Un invariant s'applique, il ne se documente pas

Dès qu'un commentaire dit « même règle que X », « doit rester identique à X »,
c'est l'aveu que **rien ne tient l'invariant à notre place** — et **un
commentaire ne peut pas échouer**.

Le critère n'est pas « ces deux bouts se ressemblent-ils » mais **« si l'un
change, l'autre doit-il changer ? »** — oui ⇒ un seul endroit ; non ⇒ deux
endroits et un commentaire qui dit pourquoi ; fusion trop coûteuse ⇒ **un
contrôle exécuté**, jamais une phrase.

*Trouvé le 2026-08-07 : la liste de colonnes du `ColumnToggleMenu` et l'union
typée de `useColumnVisibility` devaient s'accorder, et rien ne l'imposait — 21
des 31 erreurs TypeScript du build client venaient de là.*

---

### R030 — Un contrôle doit prouver qu'il sait refuser

Un vérificateur au vert n'a montré qu'une chose : sa capacité à dire **oui**.
Tant qu'on ne l'a pas vu **refuser**, on ne sait pas s'il regarde.

*Trouvé le 2026-08-07, deux fois dans la même journée : le contrôle d'intégrité
du seed de démo comparait `totalAmount` à `Σ lineTotal` — il bloquait un jeu de
données correct, parce que le test était faux, pas les données. Et un test e2e
(`07-purchases`) passait ou échouait selon les données créées par les tests
précédents.*

**Corollaires :**
- Une **assertion qui se vérifie elle-même** ne peut pas refuser. Si ce qu'on
  cherche peut venir du test lui-même, l'assertion ne mesure rien.
- Une **assertion d'absence** est satisfaite par le chargement. Chercher ce qui
  ne doit plus être là ne vaut que si l'on a d'abord établi que le reste est là.
- Une **mesure prise trop tôt** mesure un état qui n'existe plus. Mesurer au plus
  près du geste, jamais en préambule.
- Une **contre-mesure fondée sur une prémisse fausse accuse le produit**, et
  c'est le pire des faux négatifs parce qu'il est crédible. Avant d'écrire
  « après ce geste, X doit baisser », établir que **X pouvait baisser**.

---

### R031 — Un état périmé est pire qu'aucun état : il fait conclure

`docs/STATUS.md` et ce fichier décrivent un état à une date. **Une ligne qui a
cessé d'être vraie ne se contente pas d'être inutile : elle fait prendre des
décisions.** Corriger dans le même commit que le changement, ou dater et barrer.

*Trouvé le 2026-08-07 : `STATUS.md` annonçait la migration
`stock_entries.deletedAt` « non appliquée — requêtes SQL omettent ce filtre en
attendant ». Elle était appliquée, index compris.*

---

### R032 — Un outil qui réécrit le dépôt ne peut pas servir de barrière

Une commande de vérification portant `--fix` **modifie** au lieu de juger : elle
fabrique le diff qu'elle devrait signaler.

Pour **constater** sans écrire :
```bash
npx eslint "src/**/*.ts"          # jamais --fix dans un contrôle
npm --prefix client run build     # tsc -b : doit rendre 0 erreur
```

⚠️ **État au 2026-08-07 : `npm run lint` ne tourne pas du tout.** ESLint 9 exige
un `eslint.config.js` (flat config) qui n'existe pas — aucun lint n'a donc jamais
été exécuté sur ce dépôt. À corriger avant de s'appuyer sur cette barrière.

---

## 2. SIDE EFFECTS OBLIGATOIRES (non-négociables)

Ces effets doivent toujours se produire dans une transaction (R005) :

| Trigger | Side effects obligatoires |
|---------|--------------------------|
| `POST /purchases/reception-bls` | Crée `StockEntry` + met à jour `InventorySummary` |
| `POST /deliveries/delivery-notes` | Décrémente stock FIFO + status entries → `reserved` |
| `POST /invoices/sales-invoices` | Auto-calcule TVA 19% |
| `POST /invoices/sales-invoices/:id/send-email` | Génère PDF + attache + status → `sent` |
| `POST /invoices/payments` | `amountPaid +=`, `amountDue -=`, si `amountDue = 0` → status `paid` + entries → `sold` |
| `POST /quotes/:id/convert-to-invoice` | Crée `SalesInvoice` + `SalesInvoiceItems` + met à jour `Quote.status → invoiced` + vérifie quota freemium |

---

## 3. CHARTE GRAPHIQUE ECHANGO

> **[À COMPLÉTER]** — En attente des fichiers `tailwind.config.ts` et `globals.css` du projet Echango.

**Règles en vigueur en attendant :**
- Utiliser uniquement les tokens sémantiques Tailwind (pas de couleurs hardcodées)
- Aucune couleur hex dans le JSX ou les fichiers de composants
- Ce projet sera lié à Echango — la charte doit être 100% compatible

```tsx
// ✅ CORRECT — tokens sémantiques
className="text-foreground bg-background border-border"

// ❌ INTERDIT — valeurs hardcodées
style={{ color: '#374151', background: '#fff' }}
className="text-gray-700 bg-white border-gray-200"
```

---

## 4. RÔLES & PERMISSIONS

```typescript
// Décorateurs obligatoires sur toute route protégée
@Roles('owner', 'manager')
@UseGuards(JwtGuard, RolesGuard)

// Matrice des permissions
OWNER   → tout
MANAGER → view, create, edit sur tout ; pas de delete ; approve expenses
AGENT   → create/view DeliveryNote, SalesInvoice uniquement
```

---

## 5. MODEL STRATEGY

| Modèle | Utiliser pour |
|--------|--------------|
| **haiku** | Renommage, formatting, boilerplate, migration simple, DTO |
| **sonnet** | Feature dans module existant, bug localisé (1-3 fichiers), composant UI, query |
| **opus** | Nouveau module from scratch, architecture multi-modules, bug cross-services, sécurité |

Annoncer le modèle avant chaque tâche longue.

---

## 6. PROTOCOLE /plan

Obligatoire avant toute tâche impliquant > 2 fichiers créés ou modifiés.

```
/plan

1. Quels invariants R001–R020 sont concernés par cette implémentation ?
2. Y a-t-il une entrée dans docs/ERREURS.md qui couvre un cas similaire ?
3. Quels fichiers existants vais-je MODIFIER (pas créer) ?
4. Y a-t-il un changement de schéma → migration requise (R002) ?
5. Y a-t-il des side effects multi-tables → transaction requise (R005) ?
6. La décision architecturale la plus risquée de cette implémentation ?

Attendre validation avant de coder.
```

---

## 7. STRUCTURE DU PROJET

```
src/
├─ main.ts                    ← Helmet, CORS, ValidationPipe, GlobalPrefix /api/v1
├─ app.module.ts
│
├─ auth/                      ← JWT, refresh token rotation, guards
├─ users/
├─ tenants/                   ← Tenant entity, onboarding, TenantGuard
├─ subscriptions/             ← Subscription entity, freemium quota check
├─ suppliers/
├─ raw-materials/
├─ purchases/
│  ├─ purchase-orders/
│  ├─ purchase-order-items/
│  └─ reception-bls/
├─ stock/                     ← FIFO logic, alerts, InventorySummary
├─ customers/
├─ quotes/                    ← Quote + QuoteItem, convert-to-invoice
│  ├─ quotes/
│  └─ quote-items/
├─ deliveries/
│  ├─ delivery-notes/
│  ├─ delivery-note-items/
│  └─ pdf.service.ts
├─ invoices/
│  ├─ sales-invoices/
│  ├─ sales-invoice-items/
│  ├─ payments/
│  ├─ pdf.service.ts
│  └─ email.service.ts
├─ expenses/
├─ dashboard/
├─ reports/
├─ settings/                  ← Settings + TaxRateConfig entities
│
├─ common/
│  ├─ constants.ts            ← TVA_RATE, DATE_FORMAT, etc.
│  ├─ decorators/
│  │  ├─ current-user.decorator.ts
│  │  └─ roles.decorator.ts
│  ├─ filters/
│  │  └─ exception.filter.ts  ← AllExceptionsFilter global
│  ├─ guards/
│  │  ├─ jwt.guard.ts
│  │  ├─ roles.guard.ts
│  │  └─ tenant.guard.ts      ← injecte tenantId dans req.user depuis JWT
│  ├─ interceptors/
│  │  └─ audit.interceptor.ts ← createdBy/updatedBy auto
│  └─ pipes/
│     └─ validation.pipe.ts
│
├─ database/
│  ├─ migrations/             ← Une migration par changement de schéma (R002)
│  └─ seeds/
│
└─ config/
   ├─ database.config.ts      ← requireEnv() (R003)
   ├─ jwt.config.ts
   ├─ storage.config.ts
   └─ email.config.ts
```

---

## 8. CHECKLIST PR — Avant tout commit

```
Invariants TypeORM & DB
[ ] R001 — @Column({ type: '...' }) explicite sur toutes les nouvelles colonnes
[ ] R002 — migration créée si nouvelle entité ou colonne modifiée
[ ] R011 — soft delete filtré (deletedAt IS NULL) sur toutes les nouvelles queries
[ ] R016 — indexes DB sur FK et colonnes de filtre dans la migration

Sécurité & Config
[ ] R003 — zéro secret hardcodé, requireEnv() sur toutes les vars critiques
[ ] R017 — CORS strict configuré, pas de wildcard
[ ] R017 — ValidationPipe global, DTOs class-validator sur tous les inputs

Business logic
[ ] R005 — QueryRunner + transaction sur toute opération multi-tables
[ ] R006 — AllExceptionsFilter global actif, aucun catch silencieux
[ ] R008 — calculs financiers uniquement côté backend
[ ] R013 — auto-numérotation avec lock DB (pas de génération naïve)
[ ] R014 — PDF archivé au bon chemin ARCHIVES/YYYY/MM/TYPE/
[ ] R015 — FIFO respecté (orderBy enteredAt ASC) + transitions de statut

API & Frontend
[ ] R007 — toutes les routes préfixées /api/v1/, Swagger documenté
[ ] R010 — pagination uniforme { data, pagination } sur tous les GET liste
[ ] R018 — zéro string hardcodée FR dans le JSX, clés i18n utilisées
[ ] R019 — zéro logique métier dans les controllers
[ ] R020 — tenantId présent dans toutes les queries WHERE, jamais depuis URL/body

Entrées & bornes
[ ] R021 — @Max / @MaxLength / @ArrayMaxSize sur tout champ borné par la base
[ ] R021 — Number.isFinite avant toute comparaison sur une donnée réseau
[ ] R021 — zéro @Body typé en ligne (le ValidationPipe ne le voit pas)

Branchement & protection
[ ] R022 — toute garde/module écrit est branché dans CE commit, pas le suivant
[ ] R022 — toute route neuve a un appelant ; tout code sans appelant est supprimé
[ ] R023 — nouvelle route publique ⇒ épinglée dans le tableau R023 avec sa raison

Schéma
[ ] R024 — tout @Index() a sa migration CREATE INDEX dans le même commit
[ ] R024 — `migration:generate` ne rend RIEN (sinon entité et base divergent)
[ ] R025 — aucune migration exploratoire oubliée dans src/database/migrations/

Requêtes & sérialisation
[ ] R026 — aucun Promise.all(map(async => findOne/count)) introduit
[ ] R027 — aucune entité retournée via spread ({...entity})

Configuration
[ ] R028 — clé ajoutée dans .env.example ET dans le .env de WSL, dit au commit

Code quality
[ ] R004 — zéro console.* dans le code backend
[ ] R012 — createdBy/updatedBy alimentés via interceptor (jamais manuellement)
[ ] R029 — aucun commentaire « doit rester identique à X » : un contrôle, ou un seul endroit
[ ] R032 — npm run build passe sans erreur TypeScript (backend ET client)
[ ] Pas de `any` dans le code modifié

Vérification
[ ] R030 — tout nouveau contrôle a été vu REFUSER, pas seulement passer
[ ] R030 — aucune assertion qui se vérifie elle-même, aucune mesure prise en préambule

Suivi
[ ] R031 — toute ligne de doc devenue fausse est corrigée dans CE commit
[ ] docs/STATUS.md mis à jour si statut feature change
[ ] docs/ERREURS.md mis à jour si nouvelle erreur découverte
```

---

## 9. DÉPLOIEMENT VPS / DOCKER

```bash
# Variables d'environnement obligatoires (jamais dans Git)
DATABASE_URL=postgresql://user:password@db:5432/chambre_froide
JWT_SECRET=...
JWT_EXPIRY=3600
REFRESH_TOKEN_EXPIRY=604800
EMAIL_SMTP_HOST=...
EMAIL_SMTP_PORT=587
EMAIL_SMTP_USER=...
EMAIL_SMTP_PASSWORD=...
STORAGE_TYPE=local
STORAGE_PATH=./uploads
NODE_ENV=production
PORT=3000
ALLOWED_ORIGINS=https://mon-domaine.dz
```

```dockerfile
# Pattern recommandé
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
EXPOSE 3000
CMD ["node", "dist/main.js"]
```

**Checklist déploiement :**
```
[ ] .env absent du dépôt git (.gitignore)
[ ] Migrations exécutées avant le démarrage (npm run migration:run)
[ ] synchronize: false dans la config TypeORM de production
[ ] Logs sans secrets (pas de console.log des variables d'env)
[ ] Docker non-root user configuré
[ ] Backup DB configuré
```

---

## 10. L'ENVIRONNEMENT, TEL QU'IL EST SUR CE POSTE (2026-08-07)

⚠️ **Il y a DEUX clones, et c'est structurant.**

| | |
|---|---|
| `~/projects/echangoinvoice/echangoInvoice` (**WSL Ubuntu**) | backend, base, web — **et le seul à porter `.env`** |
| `C:\Users\amar\Desktop\shope\echangoinvoice\echangoInvoice` (**Windows**) | mobile Capacitor, build Android — **et le seul à avoir le JDK et le SDK** |

**Les deux divergent dès qu'on commite d'un côté sans tirer de l'autre.** Ils ne
communiquent que par git : `push` d'un côté, `pull` de l'autre. Aucun partage de
fichiers, aucune synchronisation automatique.

| Service | Où | Port |
|---|---|---|
| API NestJS | WSL | 3000 (`/api/v1`, Swagger sur `/api/docs`) |
| Web Vite | WSL | 5173 |
| Mobile Vite | **Windows** | 5174 |
| PostgreSQL | conteneur `echango-invoice-db` | **5434** (5432 et 5433 sont pris par d'autres projets) |

**Depuis l'émulateur Android, l'hôte est `10.0.2.2`, jamais `localhost`.**

**Comptes de développement** (créés par `npm run seed` puis `npm run seed:demo`) :

| Rôle | Email | Mot de passe |
|---|---|---|
| owner | `admin@chambre-froide.dz` | `admin1234` |
| manager | `manager@chambre-froide.dz` | `manager1234` |
| agent | `agent@chambre-froide.dz` | `agent1234` |
| superadmin | `superadmin@echango.dz` | `SuperAdmin2026!` (login séparé `/admin/auth/login`) |

**Quatre pièges rencontrés, tous coûteux à rediagnostiquer :**

- **Node 20 est le défaut du shell, le projet exige 22** (`.nvmrc`). Faire
  `nvm use 22` avant tout `npm run`, sinon l'échec est obscur.
- **L'analyse HTTPS d'AVG casse Gradle** en `PKIX path building failed` : sa
  racine est dans le magasin Windows, pas dans le truststore Java. Symptôme
  reconnaissable — **PowerShell télécharge, Java non**. Contourné hors dépôt par
  `%USERPROFILE%\.gradle\gradle.properties`, qui pointe un truststore dédié
  (copie du `cacerts` du JDK + la racine AVG). ⚠️ **La racine est réémise à
  chaque mise à jour d'AVG** — le fichier documente comment le regénérer.
- **Android refuse le HTTP en clair depuis la version 9.** Sans
  `network_security_config.xml`, l'app se croit hors ligne en permanence, sans
  aucun message. Le nôtre n'ouvre que `10.0.2.2`, `localhost` et `127.0.0.1`.
- **`npm install` sur Windows (npm 11) élague `package-lock.json`** de ~965
  lignes par rapport à WSL (npm 10). **Ne jamais commiter le lock depuis
  Windows** — l'install backend casserait côté Linux.

---

## 11. RÈGLES DE `echangopromo` VOLONTAIREMENT NON REPRISES

Une exclusion non écrite est indiscernable d'un oubli.

| Règle | Pourquoi pas ici |
|---|---|
| Enum Dart miroir de chaque enum backend | Notre mobile est en TypeScript et partage `@echango/shared` avec le web — les types viennent de la même source, le problème ne se pose pas |
| `ConsumerWidget` / `context.mounted`, `autoDispose` Riverpod | Flutter. Notre mobile est React + TanStack Query |
| Fichiers `.arb` trilingues, une clé dans les 3 langues | Nous sommes mono-langue (français) avec un seul `fr.json` partagé. R018 couvre le besoin ; l'arabe rouvrira la question |
| Couleur sémantique venue du thème, `check_theme.dart` | Pas de bascule clair/sombre. §3 (charte) couvre déjà l'interdit des couleurs en dur |
| Upload S3 pré-signé borné en taille | Stockage local (`STORAGE_TYPE=local`), pas d'URL pré-signée |
| Compteur de tentatives + cooldown OTP | Pas de flux OTP — authentification par mot de passe uniquement |
| Séparer cycle de vie et statut de modération | Nos `status` sont déjà mono-dimension (`draft`/`sent`/`paid`…), il n'y a pas de modération |
| Poser les questions de structure au graphe plutôt qu'au `grep` | Suppose Graphify installé |

---

*Specs complètes → `SPECS_PROJET_INVOICING.md`*
*Erreurs connues → `docs/ERREURS.md` (document vivant, à créer)*
*Statut features → `docs/STATUS.md` (à créer au début du développement)*
