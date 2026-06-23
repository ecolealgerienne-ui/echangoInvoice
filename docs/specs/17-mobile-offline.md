# 17 — Mobile Offline-First · Spec Finale Arbitrée

> **Statut :** Spec validée — prête à implémenter  
> **Date d'arbitrage :** 2026-06-23  
> **Modèle recommandé pour l'implémentation :** Opus (nouveau module multi-fichiers)

---

## 0. TABLEAU DES DÉCISIONS ARBITRÉES

| # | Désaccord | Décision finale | Justification |
|---|-----------|-----------------|---------------|
| D1 | Framework mobile : Expo SDK 52 vs Capacitor/PWA | **Capacitor** | L'équipe est React (pas React Native). Capacitor réutilise 90 % du code web existant. JSI vs bridge : écart de performance non démontré sur les volumes de données de ce projet (<5 000 enregistrements locaux). Expo exigerait une réécriture complète de l'UI. |
| D2 | DB locale : expo-sqlite + Drizzle vs WatermelonDB | **@capacitor-community/sqlite + Drizzle ORM** | expo-sqlite est un module Expo/React Native — incompatible avec Capacitor. WatermelonDB contraint le schéma de sync. Drizzle est TypeScript-first, <35 kb, migrations typesafes, et fonctionne parfaitement avec capacitor-community/sqlite. |
| D3 | Numérotation offline : TMP- vs pool pré-alloué | **Pool de numéros pré-alloués** | Le numéro apparaît sur un document papier signé par le client. Afficher `TMP-26-001` sur un BL signé est inacceptable en contexte légal algérien. Le pool est alloué au login (10 numéros par agent par type de document) et rechargé à la sync. |
| D4 | Transaction batch push : une seule vs une par opération | **Une transaction par opération** | Conforme R005. Un échec d'une opération ne doit pas annuler les 49 autres. Chaque résultat est retourné individuellement dans `results[]`. |
| D5 | Notification conflits FWW : temps réel vs différé | **Différé, au retour de sync, en langage métier** | Les conflits FWW sont rares. Interrompre l'agent en zone blanche est inutile. Au retour réseau, afficher un journal d'activité listant les documents où "une version plus récente a été enregistrée par [Nom de l'agent]". Jamais le mot "conflit". |
| D6 | Première synchronisation : tout l'historique vs fenêtre glissante | **90 derniers jours** | Protège la mémoire des appareils d'entrée de gamme (Redmi 9A, Galaxy A12). Au-delà, accès web uniquement. |
| D7 | PDF offline | **Jamais généré offline** | Conforme R014. Le PDF est généré côté serveur lors de la sync ou à la demande. L'agent peut imprimer/partager une version HTML simplifiée en offline si besoin. |
| D8 | Calculs financiers offline | **TVA 19 % calculée localement pour affichage** | Conforme R008 : les montants locaux sont indicatifs. Le serveur recalcule et écrase lors de la sync. Le payload push n'envoie jamais `subtotal`/`taxAmount`/`totalAmount` — uniquement les lignes brutes. |
| D9 | Monorepo | **Oui — packages/shared, packages/mobile, packages/web, packages/backend** | Partage des types DTO et des validateurs. Évite la divergence silencieuse des contrats d'API. |

---

## TABLE DES MATIÈRES

1. [Stack technique](#1-stack-technique)
2. [Architecture de synchronisation](#2-architecture-de-synchronisation)
3. [Pool de numérotation offline](#3-pool-de-numérotation-offline)
4. [Schéma SQLite local](#4-schéma-sqlite-local)
5. [API backend — module src/sync/](#5-api-backend--module-srcsync)
6. [Sécurité — 6 blocants critiques](#6-sécurité--6-blocants-critiques)
7. [Entités synchronisées](#7-entités-synchronisées)
8. [Fonctionnalités offline vs online-only](#8-fonctionnalités-offline-vs-online-only)
9. [UX offline](#9-ux-offline)
10. [Plan d'implémentation](#10-plan-dimplémentation)
11. [Tests](#11-tests)
12. [Déploiement stores](#12-déploiement-stores)

---

## 1. Stack technique

### 1.1 Frontend mobile

| Composant | Choix | Version |
|-----------|-------|---------|
| Framework | **Capacitor** | 6.x |
| Base React | Même que le web (Vite + React 19) | — |
| DB locale | **@capacitor-community/sqlite** | 6.x |
| ORM local | **Drizzle ORM** (SQLite dialect) | 0.30.x |
| Chiffrement DB | **SQLCipher** (via capacitor-community/sqlite option) | — |
| Stockage sécurisé | **@capacitor/preferences** (clé de chiffrement) | — |
| Réseau | Axios (même intercepteur que le web) | — |
| Build | **EAS Build** (Expo Application Services) ou Capacitor CLI | — |
| OTA | Capacitor Live Update (Appflow) ou déploiement APK direct | — |

### 1.2 Backend (nouveau module)

```
src/sync/
├── sync.module.ts
├── sync.controller.ts          ← routes pull/push, décorateurs Swagger
├── sync.service.ts             ← orchestration
├── conflict-resolver.ts        ← logique FWW (voir §2.3)
├── entity-registry.ts          ← map entité → service/repo
├── number-pool.service.ts      ← allocation + recharge pool offline
├── dto/
│   ├── pull-query.dto.ts
│   ├── push-batch.dto.ts
│   └── push-item.dto.ts
├── interfaces/
│   ├── sync-entity.interface.ts
│   └── push-result.interface.ts
├── strategies/                 ← une stratégie par entité si logique spécifique
│   ├── delivery-note.strategy.ts
│   ├── invoice.strategy.ts
│   └── payment.strategy.ts
└── __tests__/
    ├── conflict-resolver.spec.ts
    ├── sync.service.spec.ts
    └── number-pool.service.spec.ts
```

---

## 2. Architecture de synchronisation

### 2.1 Vue d'ensemble

```
[Mobile — SQLite local]
        │
        │  PUSH batch (≤50 ops)      PULL delta (200 rec/page)
        │ ─────────────────────────► ◄─────────────────────────
        │
[Backend — src/sync/]
        │
        ├─ TenantOwnershipValidator  (sécurité FK cross-tenant)
        ├─ WhitelistFieldFilter       (sécurité champs par rôle)
        ├─ ConflictResolver FWW       (comparaison timestamps corrects)
        ├─ NumberPoolService          (allocation numéros)
        └─ Side effects per entité    (FIFO, TVA, PDF…)
```

### 2.2 Outbox pattern (table locale `sync_queue`)

Toute mutation locale est **d'abord écrite dans `sync_queue`**, puis appliquée en DB locale, puis synchronisée au retour réseau.

```sql
-- Drizzle schema (packages/mobile/src/db/schema.ts)
CREATE TABLE sync_queue (
  id           TEXT PRIMARY KEY,  -- UUID v4 client
  entity_type  TEXT NOT NULL,     -- 'delivery_note' | 'invoice' | 'payment' | ...
  entity_id    TEXT NOT NULL,     -- UUID de l'entité (généré client)
  operation    TEXT NOT NULL,     -- 'CREATE' | 'UPDATE' | 'DELETE'
  payload      TEXT NOT NULL,     -- JSON sérialisé (lignes brutes uniquement)
  client_updated_at TEXT NOT NULL, -- ISO8601 UTC — timestamp de la mutation locale
  status       TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'synced' | 'error'
  error_message TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_sync_queue_status ON sync_queue(status);
CREATE INDEX idx_sync_queue_entity ON sync_queue(entity_type, entity_id);
```

### 2.3 Algorithme First Write Wins — implémentation correcte

> **Erreur de la spec initiale (documentée pour mémoire) :** l'ancien algorithme remplaçait `clientUpdatedAt` par `now()` **avant** la comparaison, ce qui faisait gagner le client systématiquement.

```typescript
// src/sync/conflict-resolver.ts
export class ConflictResolver {
  resolve(
    serverEntity: { updatedAt: Date },
    clientUpdatedAt: Date,  // envoyé par le client dans le payload
  ): 'client_wins' | 'server_wins' {
    // FWW = celui qui a écrit en PREMIER (timestamp le plus ANCIEN) gagne
    if (clientUpdatedAt < serverEntity.updatedAt) {
      return 'client_wins';  // le client avait le record avant la modif serveur
    }
    return 'server_wins';    // le serveur a modifié après la copie locale du client
  }

  // Si client_wins : persister les données client, puis updatedAt = new Date() côté serveur
  // Si server_wins : ignorer les données client, retourner serverEntity dans le résultat
}
```

### 2.4 Flux PULL

```
GET /api/v1/sync/pull?entity=customers&since=2026-06-20T08:00:00Z&page=1&limit=200

Réponse :
{
  "data": {
    "records": [...],           // entités modifiées après 'since'
    "deletedIds": ["uuid1", "uuid2"],  // soft-deleted après 'since'
    "pagination": { "total": 45, "page": 1, "limit": 200, "hasMore": false },
    "serverTime": "2026-06-23T14:00:00Z"  // à stocker comme prochain 'since'
  }
}
```

- Le client stocke `serverTime` comme `lastSyncAt` → sert de `since` au prochain pull.
- Pull paginé : le client itère jusqu'à `hasMore = false`.
- `deletedIds` : le client supprime localement (soft delete local).
- tenantId extrait du JWT uniquement (R020).

### 2.5 Flux PUSH

```
POST /api/v1/sync/push
Header: X-Request-Nonce: <uuid-nonce>   (anti-replay, Redis 10 min)

Body :
{
  "operations": [
    {
      "queueId": "uuid-local",
      "entityType": "delivery_note",
      "entityId": "uuid-client-generated",
      "operation": "CREATE",
      "clientUpdatedAt": "2026-06-23T09:15:00Z",
      "payload": {
        "customerId": "uuid",
        "pooledNumber": "BL-26-047",    // numéro du pool (si CREATE)
        "items": [
          { "rawMaterialId": "uuid", "quantity": "5.00", "unitPrice": "1200.00" }
        ]
        // NE PAS inclure : subtotal, taxAmount, totalAmount (R008)
        // NE PAS inclure : status (filtré par whitelist rôle)
        // NE PAS inclure : createdBy, updatedBy (toujours depuis JWT, R012)
      }
    }
  ]
}

Réponse :
{
  "data": {
    "results": [
      {
        "queueId": "uuid-local",
        "success": true,
        "serverId": "uuid-server",        // confirme l'UUID client ou retourne un nouveau
        "serverNumber": "BL-26-047",      // confirme le numéro
        "conflict": false
      },
      {
        "queueId": "uuid-local-2",
        "success": false,
        "error": "CONFLICT_SERVER_WINS",
        "serverRecord": { ... }           // version serveur pour affichage journal
      }
    ]
  }
}
```

### 2.6 Validation tenant statut sur chaque push

```typescript
// sync.service.ts — avant tout traitement
const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
if (!tenant || tenant.status === 'suspended') {
  throw new ForbiddenException('Compte suspendu — synchronisation impossible');
}
const user = await this.userRepo.findOne({ where: { id: userId, tenantId } });
if (!user || user.status !== 'active') {
  throw new ForbiddenException('Utilisateur inactif');
}
```

---

## 3. Pool de numérotation offline

### 3.1 Principe

Au login (ou au retour réseau avec `lastPoolRefresh` > 4h), le serveur alloue un pool de numéros séquentiels par agent et par type de document.

```
Agent A, login 2026-06-23 :
  BL vente  : BL-26-047 à BL-26-056  (10 numéros)
  Factures  : FAC-26-023 à FAC-26-027 (5 numéros)
  Devis     : DEV-26-011 à DEV-26-015 (5 numéros)
```

L'agent utilise les numéros séquentiellement. Le numéro apparaît **immédiatement et définitivement** sur le document local — il est visible par le client sans mention TMP-.

### 3.2 API pool

```
POST /api/v1/sync/number-pool/allocate
Body: { "types": ["delivery_note", "sales_invoice", "quote"] }

Réponse :
{
  "data": {
    "pools": {
      "delivery_note": { "numbers": ["BL-26-047", ..., "BL-26-056"], "expiresAt": "2026-06-30T23:59:59Z" },
      "sales_invoice": { "numbers": ["FAC-26-023", ..., "FAC-26-027"], "expiresAt": "2026-06-30T23:59:59Z" },
      "quote":         { "numbers": ["DEV-26-011", ..., "DEV-26-015"], "expiresAt": "2026-06-30T23:59:59Z" }
    }
  }
}
```

### 3.3 Implémentation serveur — lock par tenant

```typescript
// number-pool.service.ts
async allocatePool(tenantId: string, userId: string, type: string, count: number): Promise<string[]> {
  const queryRunner = this.dataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();
  try {
    // Lock scopé par tenant + type (R013 + R020)
    await queryRunner.query(
      `SELECT pg_advisory_xact_lock(hashtext($1))`,
      [`pool_${type}_${tenantId}`]
    );
    const year = new Date().getFullYear();
    const last = await queryRunner.manager
      .createQueryBuilder(NumberPoolAllocation, 'np')
      .where('np.tenantId = :tenantId AND np.documentType = :type AND EXTRACT(YEAR FROM np.createdAt) = :year', { tenantId, type, year })
      .orderBy('np.lastNumber', 'DESC')
      .limit(1)
      .getOne();
    const start = last ? last.lastNumber + 1 : 1;
    const numbers = Array.from({ length: count }, (_, i) => this.format(type, year, start + i));
    await queryRunner.manager.save(NumberPoolAllocation, {
      tenantId, userId, documentType: type,
      firstNumber: start, lastNumber: start + count - 1,
      numbers: JSON.stringify(numbers),
    });
    await queryRunner.commitTransaction();
    return numbers;
  } catch (e) {
    await queryRunner.rollbackTransaction();
    throw e;
  } finally {
    await queryRunner.release();
  }
}
```

### 3.4 Numéros non utilisés

- À la sync, le serveur marque les numéros du pool effectivement utilisés.
- Les numéros non utilisés après 30 jours sont **libérés** (marqués `expired`, recalcul du prochain séquentiel depuis le dernier utilisé).
- Table `number_pool_allocations` :

```sql
CREATE TABLE number_pool_allocations (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id),
  user_id        UUID NOT NULL REFERENCES users(id),
  document_type  VARCHAR(50) NOT NULL,
  first_number   INT NOT NULL,
  last_number    INT NOT NULL,
  numbers        JSONB NOT NULL,
  expires_at     TIMESTAMPTZ NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_npa_tenant_type ON number_pool_allocations(tenant_id, document_type);
UNIQUE (tenant_id, document_type, first_number);  -- contrainte composite (R020)
```

---

## 4. Schéma SQLite local

Drizzle schema — `packages/mobile/src/db/schema.ts`

```typescript
import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

// Tables miroir (pull depuis serveur, lecture seule locale)
export const customers = sqliteTable('customers', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  name: text('name').notNull(),
  nif: text('nif'),
  phone: text('phone'),
  address: text('address'),
  updatedAt: text('updated_at').notNull(),
  deletedAt: text('deleted_at'),
});

export const rawMaterials = sqliteTable('raw_materials', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  name: text('name').notNull(),
  unit: text('unit').notNull(),
  unitPrice: text('unit_price').notNull(), // stocker en string (décimal exact)
  updatedAt: text('updated_at').notNull(),
  deletedAt: text('deleted_at'),
});

// Inventaire local (indicatif — FIFO décrémenté côté serveur uniquement)
export const inventorySummary = sqliteTable('inventory_summary', {
  id: text('id').primaryKey(),
  rawMaterialId: text('raw_material_id').notNull(),
  tenantId: text('tenant_id').notNull(),
  quantityAvailable: text('quantity_available').notNull(),
  updatedAt: text('updated_at').notNull(),
});

// Tables de travail offline (mutations locales)
export const deliveryNotes = sqliteTable('delivery_notes', {
  id: text('id').primaryKey(),           // UUID v4 généré client
  tenantId: text('tenant_id').notNull(),
  customerId: text('customer_id').notNull(),
  number: text('number').notNull(),      // depuis pool
  status: text('status').notNull().default('draft'), // toujours draft en offline
  notes: text('notes'),
  syncStatus: text('sync_status').notNull().default('pending'), // 'pending'|'synced'|'conflict'
  clientUpdatedAt: text('client_updated_at').notNull(),
  createdAt: text('created_at').notNull(),
});

export const deliveryNoteItems = sqliteTable('delivery_note_items', {
  id: text('id').primaryKey(),
  deliveryNoteId: text('delivery_note_id').notNull(),
  rawMaterialId: text('raw_material_id').notNull(),
  quantity: text('quantity').notNull(),  // string décimal
  unitPrice: text('unit_price').notNull(),
});

export const salesInvoices = sqliteTable('sales_invoices', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  customerId: text('customer_id').notNull(),
  number: text('number').notNull(),
  status: text('status').notNull().default('draft'),
  notes: text('notes'),
  // Affichage local indicatif uniquement — le serveur recalcule (R008)
  displaySubtotal: text('display_subtotal'),
  displayTaxAmount: text('display_tax_amount'),
  displayTotal: text('display_total'),
  syncStatus: text('sync_status').notNull().default('pending'),
  clientUpdatedAt: text('client_updated_at').notNull(),
  createdAt: text('created_at').notNull(),
});

export const payments = sqliteTable('payments', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  invoiceId: text('invoice_id').notNull(),
  amount: text('amount').notNull(),
  paymentMethod: text('payment_method').notNull(),
  paymentDate: text('payment_date').notNull(),
  reference: text('reference'),
  syncStatus: text('sync_status').notNull().default('pending'),
  clientUpdatedAt: text('client_updated_at').notNull(),
  createdAt: text('created_at').notNull(),
});

export const expenses = sqliteTable('expenses', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  description: text('description').notNull(),
  amount: text('amount').notNull(),
  category: text('category').notNull(),
  expenseDate: text('expense_date').notNull(),
  syncStatus: text('sync_status').notNull().default('pending'),
  clientUpdatedAt: text('client_updated_at').notNull(),
  createdAt: text('created_at').notNull(),
});

// Pool de numéros (stocké localement au login)
export const numberPools = sqliteTable('number_pools', {
  id: text('id').primaryKey(),
  documentType: text('document_type').notNull(),
  numbers: text('numbers').notNull(),   // JSON array stringifié
  usedCount: integer('used_count').notNull().default(0),
  expiresAt: text('expires_at').notNull(),
  allocatedAt: text('allocated_at').notNull(),
});

// Outbox (mutations en attente de sync)
export const syncQueue = sqliteTable('sync_queue', {
  id: text('id').primaryKey(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  operation: text('operation').notNull(),
  payload: text('payload').notNull(),   // JSON
  clientUpdatedAt: text('client_updated_at').notNull(),
  status: text('status').notNull().default('pending'),
  errorMessage: text('error_message'),
  createdAt: text('created_at').notNull().default("(datetime('now'))"),
});

// Cache paramètres (TVA, etc.)
export const settingsCache = sqliteTable('settings_cache', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  cachedAt: text('cached_at').notNull(),
  expiresAt: text('expires_at').notNull(),
});
```

---

## 5. API backend — module src/sync/

### 5.1 Endpoints

| Méthode | Route | Auth | Description |
|---------|-------|------|-------------|
| GET | `/api/v1/sync/pull` | JWT | Pull delta d'une entité |
| POST | `/api/v1/sync/push` | JWT | Push batch d'opérations |
| POST | `/api/v1/sync/number-pool/allocate` | JWT | Allouer pool numéros |
| GET | `/api/v1/sync/status` | JWT | Statut sync (lastSync, pendingCount) |

### 5.2 Entités pullables

```typescript
// entity-registry.ts
export const PULLABLE_ENTITIES = [
  'customers',
  'suppliers',
  'raw_materials',
  'products',
  'inventory_summary',
  'delivery_notes',
  'sales_invoices',
  'payments',
  'quotes',
  'expenses',
  'settings',
] as const;
```

### 5.3 PullQueryDto

```typescript
export class PullQueryDto {
  @IsIn(PULLABLE_ENTITIES)
  entity: string;

  @IsDateString()
  since: string;        // ISO8601 UTC

  @IsInt() @Min(1)
  page: number = 1;

  @IsInt() @Min(1) @Max(200)
  limit: number = 200;
}
```

### 5.4 PushItemDto

```typescript
export class PushItemDto {
  @IsUUID(4) queueId: string;
  @IsIn(['delivery_note', 'sales_invoice', 'payment', 'quote', 'expense']) entityType: string;
  @IsUUID(4) entityId: string;
  @IsIn(['CREATE', 'UPDATE', 'DELETE']) operation: string;
  @IsDateString() clientUpdatedAt: string;  // comparé vs serverEntity.updatedAt
  @IsObject() payload: Record<string, unknown>;
}

export class PushBatchDto {
  @IsArray() @ArrayMaxSize(50) @ValidateNested({ each: true })
  @Type(() => PushItemDto)
  operations: PushItemDto[];
}
```

### 5.5 Logique push par opération (pseudo-code)

```typescript
// sync.service.ts
async processPushOperation(op: PushItemDto, userId: string, tenantId: string): Promise<PushResult> {
  const queryRunner = this.dataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();
  try {
    // 1. Valider statut tenant + user
    await this.validateTenantActive(tenantId, userId, queryRunner);

    // 2. Whitelist champs par rôle
    const filtered = this.fieldWhitelist.filter(op.payload, op.entityType, userRole);

    // 3. Valider ownership FK (R020 sécurité cross-tenant)
    await this.tenantOwnershipValidator.validate(filtered, tenantId, queryRunner);

    // 4. Valider timestamp client (anti-futur)
    const clientTs = new Date(op.clientUpdatedAt);
    if (clientTs > new Date(Date.now() + 5 * 60 * 1000)) {
      throw new BadRequestException('Timestamp client dans le futur rejeté');
    }

    // 5. Résolution FWW si UPDATE
    if (op.operation === 'UPDATE') {
      const server = await queryRunner.manager.findOne(entity, { where: { id: op.entityId, tenantId } });
      if (server) {
        const winner = this.conflictResolver.resolve(server, clientTs);
        if (winner === 'server_wins') {
          await queryRunner.commitTransaction();
          return { queueId: op.queueId, success: false, error: 'CONFLICT_SERVER_WINS', serverRecord: server };
        }
      }
    }

    // 6. Recalculer montants côté serveur (R008)
    if (['delivery_note', 'sales_invoice', 'quote'].includes(op.entityType)) {
      await this.recalculateTotals(filtered, queryRunner);
    }

    // 7. Persister + side effects (R005 — dans la même transaction)
    const saved = await this.entityStrategies[op.entityType].persist(filtered, tenantId, userId, queryRunner);

    // 8. Side effects métier (FIFO, stock, statut)
    await this.entityStrategies[op.entityType].applyEffects(saved, queryRunner);

    await queryRunner.commitTransaction();
    return { queueId: op.queueId, success: true, serverId: saved.id };
  } catch (e) {
    await queryRunner.rollbackTransaction();
    throw e;  // remonté → AllExceptionsFilter (R006)
  } finally {
    await queryRunner.release();
  }
}
```

---

## 6. Sécurité — 6 blocants critiques

### S1 — CRITICAL : DB locale chiffrée (SQLCipher)

```typescript
// packages/mobile/src/db/connection.ts
import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite';

const sqlite = new SQLiteConnection(CapacitorSQLite);
// La clé de chiffrement est générée au premier lancement et stockée dans @capacitor/preferences (secure enclave)
const encryptionKey = await this.getOrGenerateKey();
const db = await sqlite.createConnection('echango_db', true, 'secret', encryptionKey, false);
```

La clé de chiffrement n'est **jamais** stockée en clair. Elle est générée via `crypto.getRandomValues()` et stockée dans le secure storage natif. Lors d'un changement de tenant ou d'un logout, la DB est **supprimée et recréée**.

### S2 — CRITICAL : TenantOwnershipValidator

Toute FK dans le payload push est validée contre le tenantId du JWT avant persistance.

```typescript
// src/sync/tenant-ownership-validator.ts
async validate(payload: Record<string, unknown>, tenantId: string, qr: QueryRunner): Promise<void> {
  const fkFields: Record<string, EntityTarget<any>> = {
    customerId: Customer,
    supplierId: Supplier,
    rawMaterialId: RawMaterial,
    invoiceId: SalesInvoice,
  };
  for (const [field, Entity] of Object.entries(fkFields)) {
    if (payload[field]) {
      const exists = await qr.manager.count(Entity, { where: { id: payload[field], tenantId } });
      if (!exists) throw new ForbiddenException(`FK invalide ou cross-tenant : ${field}`);
    }
  }
}
```

### S3 — HIGH : Whitelist champs par rôle

```typescript
// src/sync/field-whitelist.ts
const ALLOWED_FIELDS: Record<string, Record<string, string[]>> = {
  delivery_note: {
    owner:   ['customerId', 'items', 'notes', 'pooledNumber', 'status'],
    manager: ['customerId', 'items', 'notes', 'pooledNumber', 'status'],
    agent:   ['customerId', 'items', 'notes', 'pooledNumber'],  // pas de status
  },
  payment: {
    owner:   ['invoiceId', 'amount', 'paymentMethod', 'paymentDate', 'reference'],
    manager: ['invoiceId', 'amount', 'paymentMethod', 'paymentDate', 'reference'],
    agent:   [],  // agents ne peuvent pas créer de paiements
  },
  // ...
};
```

Un AGENT ne peut jamais envoyer `status: 'paid'` — le champ est filtré avant persistance.

### S4 — HIGH : Montants recalculés serveur-side (R008)

Le payload push **ne contient jamais** `subtotal`, `taxAmount`, `totalAmount`. Si présents, ils sont ignorés (whitelist). Le serveur recalcule depuis les lignes brutes avec le `taxRate` issu des settings du tenant.

### S5 — HIGH : Session offline max 72h

```typescript
// packages/mobile/src/hooks/useOfflineSessionGuard.ts
const lastOnline = await getLastOnlineTimestamp();
const hoursOffline = (Date.now() - lastOnline) / (1000 * 3600);
if (hoursOffline > 72) {
  // Forcer re-auth au prochain accès réseau
  await clearLocalSession();
  navigate('/login');
}
```

La création de nouveaux documents est bloquée après 72h sans sync (voir §9).

### S6 — HIGH : Anti-replay nonce

```
Header: X-Request-Nonce: <UUID v4>
```

Le serveur stocke chaque nonce en Redis avec TTL 10 minutes. Un nonce déjà vu retourne HTTP 409.

```typescript
// sync.controller.ts
@Post('push')
async push(@Headers('x-request-nonce') nonce: string, ...) {
  if (!nonce) throw new BadRequestException('X-Request-Nonce requis');
  const seen = await this.redis.set(`nonce:${nonce}`, '1', 'EX', 600, 'NX');
  if (!seen) throw new ConflictException('Nonce déjà utilisé (replay détecté)');
  // ...
}
```

### S6b — createdBy/updatedBy toujours depuis JWT (R012)

Le payload push ne contient jamais `createdBy` ni `updatedBy`. L'AuditInterceptor les injecte depuis le JWT décodé. Le sync.service les passe explicitement au repository via `userId` du token.

### S6c — Purge DB au changement de tenant

```typescript
// packages/mobile/src/db/lifecycle.ts
async onTenantChange(newTenantId: string): Promise<void> {
  await sqlite.deleteDatabase('echango_db');
  await this.initDatabase();
  await this.pullInitialData(newTenantId);
}
```

---

## 7. Entités synchronisées

### 7.1 Entités pullées (lecture seule sur mobile)

| Entité | Péremption locale | Données initiales |
|--------|------------------|-------------------|
| `customers` | 24h | 90 derniers jours d'activité |
| `suppliers` | 24h | 90 derniers jours |
| `raw_materials` | 24h | Tous |
| `inventory_summary` | 1h | Tous |
| `settings` | 7 jours | Complet |

### 7.2 Entités poussées (mutations offline)

| Entité | Opérations autorisées | Side effects serveur |
|--------|-----------------------|---------------------|
| `delivery_note` + items | CREATE, UPDATE (draft uniquement) | FIFO décrémenté (R015), stock → reserved |
| `sales_invoice` + items | CREATE, UPDATE (draft uniquement) | TVA recalculée (R008) |
| `payment` | CREATE | amountPaid+=, amountDue-=, status→paid si soldé, stock→sold |
| `quote` + items | CREATE, UPDATE | TVA recalculée |
| `expense` | CREATE, UPDATE | — |

### 7.3 Side effects non disponibles offline

- **PDF** (R014) : généré serveur à la demande post-sync
- **Email** : online-only
- **FIFO décrémentation** (R015) : serveur uniquement — le stock local est indicatif
- **Conversion BL → Facture** : online-only (crée deux entités liées avec numérotation)
- **Production orders** : online-only (complexité FIFO MP + PF)

---

## 8. Fonctionnalités offline vs online-only

| Fonctionnalité | Offline | Online | Notes |
|----------------|---------|--------|-------|
| Créer BL vente | ✅ | ✅ | Numéro du pool |
| Consulter historique client | ✅ | ✅ | 90j en cache |
| Créer facture | ✅ | ✅ | TVA affichée indicative |
| Enregistrer paiement espèces | ✅ | ✅ | |
| Créer devis | ✅ | ✅ | |
| Saisir dépense terrain | ✅ | ✅ | |
| Réception entrepôt (BL achat) | ❌ | ✅ | Stock FIFO complexe |
| Générer PDF | ❌ | ✅ | R014 |
| Envoyer email | ❌ | ✅ | |
| Convertir BL → Facture | ❌ | ✅ | |
| Ordre de production | ❌ | ✅ | |
| Dashboard / rapports | ❌ | ✅ | |

---

## 9. UX offline

### 9.1 Indicateur de fraîcheur des données

| Âge données locales | Affichage |
|--------------------|-----------|
| < 8h | Aucune mention |
| 8–24h | Chip subtile "Mis à jour hier" |
| 24–72h | Bandeau orange "Données de plus de 24h — synchronisez dès que possible" |
| > 72h | Blocage création nouveaux documents. Message : "Reconnectez-vous pour continuer à créer des documents." |

### 9.2 Journal d'activité offline (filet de sécurité psychologique)

Écran accessible dans Menu → "Activité offline" :

```
● BL-26-047 — Client Sarl Amrani — 23 juin 09:15 — ✅ Synchronisé
● FAC-26-023 — Client Sarl Amrani — 23 juin 09:18 — ⏳ En attente de sync
● BL-26-048 — Client Mouloud SARL — 23 juin 10:05 — ℹ️ Une version plus récente existe (enregistrée par Karim)
```

**Règle UX :** jamais le mot "conflit". En cas de `CONFLICT_SERVER_WINS`, afficher :
> "Une version plus récente de ce document a été enregistrée par [prénom agent]. Votre version n'a pas été appliquée."

Avec bouton "Voir les deux versions" — affichage côte à côte en langage métier (champs renommés, pas de JSON).

### 9.3 Synchronisation automatique

- Au retour réseau (détection via `@capacitor/network`)
- En foreground toutes les 5 minutes si réseau disponible
- Toujours : pull d'abord, puis push (pour avoir le contexte le plus récent avant d'envoyer)

---

## 10. Plan d'implémentation

**Estimation totale : 11–13 semaines-développeur**  
**Équipe : 1 backend senior + 1 mobile (React) à partir de S4**

### Phase 1 — Backend sync module (S1–S3) · Backend uniquement

**Objectif :** Module `src/sync/` production-ready avec tests 100 % avant d'écrire une ligne de mobile.

| Semaine | Tâches |
|---------|--------|
| S1 | Scaffold `src/sync/`, `entity-registry.ts`, `PullQueryDto`, endpoint GET pull + tests unitaires |
| S2 | `ConflictResolver` (algo FWW corrigé), `TenantOwnershipValidator`, `FieldWhitelist`, endpoint POST push skeleton + tests |
| S3 | `NumberPoolService` + migration `number_pool_allocations`, strategies DeliveryNote/Invoice/Payment, benchmark <500ms/1000 records |

**Décisions irréversibles à confirmer avant S1 :**
- [ ] Compte développeur Apple disponible ? (Visa internationale requise)
- [ ] Instance Redis disponible pour nonces anti-replay ?
- [ ] Monorepo : `packages/` à la racine ou dans un repo séparé ?

### Phase 2 — MVP mobile (S4–S7) · Backend + Mobile en parallèle

| Semaine | Backend | Mobile |
|---------|---------|--------|
| S4 | API pool numéros, endpoint /sync/status | Setup Capacitor + Drizzle + SQLCipher, migrations locales |
| S5 | Stratégie Payment, side effects complets | Écrans : liste clients, créer BL offline |
| S6 | Tests intégration end-to-end sync | Écrans : créer facture, enregistrer paiement |
| S7 | Bug fixes sync | Journal d'activité offline, indicateurs fraîcheur |

### Phase 3 — Complément (S8–S9)

- Devis offline
- Dépenses offline
- Notifications push (réception sync réussie)
- Tests appareils réels (Redmi 9A, Galaxy A12)

### Phase 4 — Stores + Polish (S10–S13)

- Soumission Play Store (D1 : $25 one-time)
- Soumission App Store (D2 : $99/an — Visa internationale)
- OTA updates (Capacitor Live Update ou Appflow)
- CI/CD GitHub Actions : build APK + IPA automatique

---

## 11. Tests

### 11.1 Backend

```typescript
// __tests__/conflict-resolver.spec.ts
describe('ConflictResolver', () => {
  it('client wins when clientUpdatedAt is older than serverUpdatedAt', () => {
    const server = { updatedAt: new Date('2026-06-23T10:00:00Z') };
    const clientTs = new Date('2026-06-23T09:00:00Z');
    expect(resolver.resolve(server, clientTs)).toBe('client_wins');
  });
  it('server wins when serverUpdatedAt is older', () => {
    const server = { updatedAt: new Date('2026-06-23T08:00:00Z') };
    const clientTs = new Date('2026-06-23T10:00:00Z');
    expect(resolver.resolve(server, clientTs)).toBe('server_wins');
  });
  it('rejects future timestamps', async () => {
    // clientUpdatedAt = now + 10 min → BadRequestException
  });
});

// __tests__/tenant-ownership-validator.spec.ts
describe('TenantOwnershipValidator', () => {
  it('throws ForbiddenException on cross-tenant FK', async () => { ... });
  it('passes valid same-tenant FK', async () => { ... });
});

// __tests__/sync.service.spec.ts
describe('SyncService', () => {
  it('recalculates totals server-side, ignores client amounts', async () => { ... });
  it('blocks push when tenant is suspended', async () => { ... });
  it('detects replay via nonce', async () => { ... });
  it('processes each operation independently (no cascade rollback)', async () => { ... });
});

// benchmark
describe('Pull performance', () => {
  it('returns 1000 records in < 500ms', async () => { ... });
});
```

### 11.2 Mobile

- Tests Drizzle migrations (schema up/down)
- Tests `NumberPoolService` local (allocation séquentielle, expiration)
- Tests `SyncQueue` (enqueue, dequeue, retry on error)
- Tests de détection réseau et déclenchement sync automatique
- Tests E2E Detox : création BL offline → sync → vérification serveur

---

## 12. Déploiement stores

### Play Store (priorité 1)
- Frais : $25 one-time
- Délai review : 2–7 jours
- APK signé via EAS Build ou Capacitor CLI + keystore

### App Store (priorité 2)
- Frais : $99/an
- Carte Visa internationale requise (CIB algérienne non acceptée)
- Délai review : 1–3 jours
- Capacitor apps acceptées si valeur native réelle (offline + notifications push)
- Compte Apple Developer à ouvrir **au plus tard en S8** pour ne pas bloquer la Phase 4

### OTA (mises à jour sans passer par les stores)

- Capacitor Live Update (Appflow) ou fichier JSON hébergé en self-hosted
- Limité aux assets JS/CSS — tout changement de plugin natif = nouvelle soumission store

---

## Invariants R001–R020 — tensions et résolutions

| Invariant | Tension | Résolution |
|-----------|---------|------------|
| R005 | Une transaction par opération push (pas tout le batch) | Confirmé D4. Chaque opération = son propre QueryRunner. |
| R008 | TVA calculée localement pour affichage | Affichage indicatif uniquement. Serveur recalcule et écrase. `displaySubtotal` etc. ne sont pas synchés vers le serveur. |
| R012 | createdBy/updatedBy depuis JWT | Jamais dans le payload push. Injectés par AuditInterceptor côté serveur. |
| R013 | Auto-numérotation avec lock | Pool pré-alloué avec `pg_advisory_xact_lock(hashtext('pool_type_tenantId'))`. |
| R014 | PDF archivé au chemin ARCHIVES/ | Généré serveur-side post-sync uniquement. |
| R015 | FIFO oldest first | Décrémenté côté serveur uniquement lors du push CREATE delivery_note. Stock local = indicatif. |
| R020 | tenantId dans toutes les queries | Pull : filtré par tenantId JWT. Push : TenantOwnershipValidator sur toutes les FK. Pool : scopé par tenantId. |

---

*Spec arbitrée par le décideur multi-agent le 2026-06-23.*  
*Prochaine étape : validation équipe → démarrer Phase 1 S1.*
