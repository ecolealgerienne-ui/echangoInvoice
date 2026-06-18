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

## 1. INVARIANTS ABSOLUS (R001–R020) — Violations = rejet immédiat du code

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
// Format de réponse d'erreur standardisé :
{
  "statusCode": 409,
  "message": "Ce numéro de BL existe déjà",
  "field": "blNumber"   // optionnel
}

// ✅ CORRECT — les services laissent remonter ou throw explicitement
if (!customer) throw new NotFoundException(`Client ${id} introuvable`);

// ❌ INTERDIT — catch silencieux dans un service
try {
  await this.repo.save(entity);
} catch (e) {
  // rien → bug invisible
}
```

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

**Transitions de statut StockEntry :**
```
available → reserved  (lors de la création du DeliveryNote)
reserved  → sold      (lors du paiement de la facture)
available → adjusted  (ajustement manuel)
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

Code quality
[ ] R004 — zéro console.* dans le code backend
[ ] R012 — createdBy/updatedBy alimentés via interceptor (jamais manuellement)
[ ] npm run build passe sans erreur TypeScript
[ ] Pas de `any` dans le code modifié

Suivi
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

*Specs complètes → `SPECS_PROJET_INVOICING.md`*
*Erreurs connues → `docs/ERREURS.md` (document vivant, à créer)*
*Statut features → `docs/STATUS.md` (à créer au début du développement)*
