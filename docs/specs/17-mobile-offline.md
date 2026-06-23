# 17 — Mobile Offline-First · Spec Finale Définitive

> **Statut :** Spec validée — prête à implémenter  
> **Date d'arbitrage :** 2026-06-23  
> **Sources :** 6 rapports experts (Architecte, Métier, Sécurité, Processus, UX, Data)  
> **Modèle recommandé pour l'implémentation :** Opus (nouveau module multi-fichiers)

---

## 0. TABLEAU DES DÉCISIONS ARBITRÉES

| # | Désaccord | Décision finale | Justification |
|---|-----------|-----------------|---------------|
| D1 | Framework mobile : Expo SDK 52 vs Capacitor | **Capacitor 6.x** | L'équipe est React (pas React Native). Capacitor réutilise 90 % du code web existant. L'écart JSI vs WebView SQLite n'est pas démontré sur les volumes de ce projet (<7 MB, <5 000 enregistrements actifs). Expo exigerait une réécriture complète de l'UI. Pour une PME algérienne avec 1–2 devs, la productivité prime. |
| D2 | DB locale : expo-sqlite vs @capacitor-community/sqlite | **@capacitor-community/sqlite + Drizzle ORM** | expo-sqlite est un module React Native — incompatible avec Capacitor. Drizzle ORM est TypeScript-first, <35 KB, migrations typesafes, SQLite dialect natif. WatermelonDB contraint trop le protocole de sync. |
| D3 | Numérotation offline : TMP- prefix vs pool pré-alloué | **Pool de numéros pré-alloués** | Le numéro apparaît sur un document papier signé par le client. Afficher `TMP-26-001` sur un BL signé est inacceptable en contexte légal algérien. 10 numéros par agent par type, expiration 72h si non utilisés. |
| D4 | Transaction batch push : une seule vs une par opération | **Une transaction par opération** | Conforme R005. Un échec d'une opération ne doit pas annuler les 49 autres. Chaque résultat est retourné individuellement dans `results[]`. |
| D5 | Notification conflits FWW : temps réel vs différé | **Différé, au retour de sync, en langage métier** | Les conflits FWW sont rares. Interrompre l'agent en zone blanche est inutile. Au retour réseau, afficher un journal d'activité. Jamais le mot "conflit". |
| D6 | Première synchronisation : tout l'historique vs fenêtre glissante | **90 derniers jours** | Protège la mémoire des appareils d'entrée de gamme (Redmi 9A, Galaxy A12). DB locale ≈ 5–7 MB. Au-delà, accès web uniquement. |
| D7 | PDF offline | **Jamais généré offline** | Conforme R014. PDF généré côté serveur post-sync. L'agent peut partager une vue HTML simplifiée en offline si besoin. |
| D8 | Calculs financiers offline | **TVA calculée localement pour affichage indicatif uniquement** | Conforme R008 : les montants locaux (`displaySubtotal`, `displayTaxAmount`, `displayTotal`) ne sont jamais envoyés au serveur. Le serveur recalcule depuis les lignes brutes. |
| D9 | Monorepo | **Oui — packages/shared, packages/mobile, packages/web, packages/backend** | Partage des types DTO et des validateurs. Évite la divergence silencieuse des contrats d'API. |
| D10 | FWW tiebreaker — horloge client vs serveur | **Timestamp serveur de réception (`receivedAt`) comme tiebreaker** | Les horloges Android mid-range (Redmi 9A) peuvent dériver de >2 min. `clientUpdatedAt` seul est insuffisant pour résoudre correctement les conflits. Voir §2.3 pour l'algorithme corrigé. |

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
10. [Volumes et performances](#10-volumes-et-performances)
11. [Plan d'implémentation](#11-plan-dimplémentation)
12. [Tests](#12-tests)
13. [Déploiement stores](#13-déploiement-stores)
14. [Invariants R001–R020 — tensions et résolutions](#14-invariants-r001r020--tensions-et-résolutions)

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
| Détection réseau | **@capacitor/network** | — |
| Réseau HTTP | Axios (même intercepteur que le web) | — |
| Build | Capacitor CLI + Gradle (Android) / Xcode (iOS) | — |
| OTA | Capacitor Live Update (Appflow) ou APK direct | — |

### 1.2 Backend (nouveau module)

```
src/sync/
├── sync.module.ts
├── sync.controller.ts              ← routes pull/push, décorateurs Swagger
├── sync.service.ts                 ← orchestration push/pull
├── conflict-resolver.ts            ← logique FWW corrigée (D10, §2.3)
├── tenant-ownership-validator.ts   ← validation FK cross-tenant (S2)
├── field-whitelist.ts              ← whitelist champs par rôle (S3)
├── entity-registry.ts              ← map entité → service/repo
├── number-pool.service.ts          ← allocation + recharge pool offline
├── dto/
│   ├── pull-query.dto.ts
│   ├── push-batch.dto.ts
│   └── push-item.dto.ts
├── interfaces/
│   ├── sync-entity.interface.ts
│   └── push-result.interface.ts
├── strategies/                     ← une stratégie par entité
│   ├── delivery-note.strategy.ts
│   ├── invoice.strategy.ts
│   ├── payment.strategy.ts
│   ├── quote.strategy.ts
│   └── expense.strategy.ts
└── __tests__/
    ├── conflict-resolver.spec.ts
    ├── sync.service.spec.ts
    ├── tenant-ownership-validator.spec.ts
    └── number-pool.service.spec.ts
```

**Principe clé :** ce module est **entièrement additionnel**. Zéro modification des controllers existants. Les services métier existants (InvoicesService, DeliveryNotesService…) sont appelés depuis les stratégies via leurs interfaces normales, dans une QueryRunner partagée.

---

## 2. Architecture de synchronisation

### 2.1 Vue d'ensemble

```
[Mobile — SQLite local chiffré SQLCipher]
        │
        │  PUSH batch (≤50 ops)      PULL delta (200 rec/page)
        │ ─────────────────────────► ◄─────────────────────────
        │
[Backend — src/sync/]
        │
        ├─ TenantActiveValidator      (statut tenant + user)
        ├─ TenantOwnershipValidator   (sécurité FK cross-tenant)
        ├─ FieldWhitelist             (sécurité champs par rôle)
        ├─ ConflictResolver FWW       (receivedAt serveur comme tiebreaker)
        ├─ TotalsRecalculator         (R008 — lignes brutes → TVA serveur)
        ├─ NumberPoolService          (allocation numéros)
        └─ EntityStrategies           (FIFO, side effects, persistance)
```

### 2.2 Outbox pattern (table locale `sync_queue`)

Toute mutation locale est **d'abord écrite dans `sync_queue`**, puis appliquée en DB locale, puis synchronisée au retour réseau.

```sql
-- Drizzle schema (packages/mobile/src/db/schema.ts)
CREATE TABLE sync_queue (
  id              TEXT PRIMARY KEY,  -- UUID v4 client
  entity_type     TEXT NOT NULL,     -- 'delivery_note' | 'sales_invoice' | 'payment' | ...
  entity_id       TEXT NOT NULL,     -- UUID de l'entité (généré client)
  operation       TEXT NOT NULL,     -- 'CREATE' | 'UPDATE' | 'DELETE'
  payload         TEXT NOT NULL,     -- JSON sérialisé (lignes brutes uniquement)
  client_updated_at TEXT NOT NULL,   -- ISO8601 UTC — timestamp de la mutation locale
  status          TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'synced' | 'error'
  error_message   TEXT,
  retry_count     INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_sync_queue_status  ON sync_queue(status) WHERE status = 'pending';
CREATE INDEX idx_sync_queue_entity  ON sync_queue(entity_type, entity_id);
```

### 2.3 Algorithme First Write Wins — implémentation corrigée (D10)

> **Problème identifié par le rapport Sécurité (NO-GO 3) :** un algorithme FWW basé uniquement sur `clientUpdatedAt` est vulnérable à la dérive d'horloge Android (>2 min courante sur appareils mid-range Redmi 9A, Galaxy A12). La version précédente de la spec utilisait `clientUpdatedAt` comme seule source de vérité, ce qui pouvait écraser la version la plus récente.
>
> **Correction (D10) :** le serveur enregistre `receivedAt = new Date()` dès la réception de la requête push. Ce timestamp serveur sert de tiebreaker lorsque `clientUpdatedAt` est ambigu (dérive > 2 min).

```typescript
// src/sync/conflict-resolver.ts

export interface ServerEntity {
  updatedAt: Date;        // dernière modification serveur
  receivedAt?: Date;      // timestamp de réception du dernier push (null si modif web)
}

export class ConflictResolver {
  /**
   * FWW = celui qui a écrit en PREMIER gagne.
   * Tiebreaker : si l'écart clientUpdatedAt vs serverUpdatedAt < CLOCK_DRIFT_TOLERANCE,
   * on utilise receivedAt (timestamp serveur objectif) comme arbitre final.
   */
  private readonly CLOCK_DRIFT_TOLERANCE_MS = 2 * 60 * 1000; // 2 minutes

  resolve(
    serverEntity: ServerEntity,
    clientUpdatedAt: Date,
    receivedAt: Date,       // = new Date() au moment du traitement de la requête
  ): 'client_wins' | 'server_wins' {
    const diff = Math.abs(clientUpdatedAt.getTime() - serverEntity.updatedAt.getTime());

    // Pas d'ambiguïté : l'écart est clair
    if (diff > this.CLOCK_DRIFT_TOLERANCE_MS) {
      return clientUpdatedAt < serverEntity.updatedAt ? 'client_wins' : 'server_wins';
    }

    // Zone d'ambiguïté (dérive horloge possible) → tiebreaker serveur
    // Si le serveur a une réception précédente, comparer
    if (serverEntity.receivedAt) {
      // Le client a écrit AVANT la réception serveur précédente → client plus ancien → client_wins
      return clientUpdatedAt < serverEntity.receivedAt ? 'client_wins' : 'server_wins';
    }

    // Pas de receivedAt précédent (modif via web interface) → la modif web gagne
    return 'server_wins';
  }
}
```

**Colonne `received_at` à ajouter sur les entités mutables :** `delivery_notes`, `sales_invoices`, `quotes`, `payments`, `expenses`. Migration requise (R002).

```sql
-- Migration : AddReceivedAtToSyncableEntities
ALTER TABLE delivery_notes   ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ;
ALTER TABLE sales_invoices   ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ;
ALTER TABLE quotes           ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ;
ALTER TABLE payments         ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ;
ALTER TABLE expenses         ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ;
```

### 2.4 Flux PULL

```
GET /api/v1/sync/pull?entity=customers&since=2026-06-20T08:00:00Z&page=1&limit=200

Réponse :
{
  "data": {
    "records": [...],
    "deletedIds": ["uuid1", "uuid2"],
    "pagination": { "total": 45, "page": 1, "limit": 200, "hasMore": false },
    "serverTime": "2026-06-23T14:00:00Z"   ← stocker comme prochain 'since'
  }
}
```

- Le client stocke `serverTime` comme `lastSyncAt` → sert de `since` au prochain pull.
- Pull paginé : le client itère jusqu'à `hasMore = false`.
- `deletedIds` : le client supprime localement (soft delete local, `deletedAt = now()`).
- `tenantId` extrait du JWT uniquement (R020).
- Ordre d'import first sync : voir §10.3.

### 2.5 Flux PUSH

```
POST /api/v1/sync/push
Header: X-Request-Nonce: <uuid-nonce>   (anti-replay Redis 10 min)

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
        "pooledNumber": "BL-26-047",
        "notes": "Livraison matin",
        "items": [
          { "productId": "uuid", "quantity": "5.00", "unitPrice": "1200.00" }
        ]
        // NE PAS inclure : subtotal, taxAmount, totalAmount (R008 — whitelist filtre)
        // NE PAS inclure : status (filtré par rôle)
        // NE PAS inclure : createdBy, updatedBy (injectés depuis JWT via AuditInterceptor, R012)
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
        "serverId": "uuid-server",
        "serverNumber": "BL-26-047",
        "conflict": false
      },
      {
        "queueId": "uuid-local-2",
        "success": false,
        "error": "CONFLICT_SERVER_WINS",
        "serverRecord": { ... }   // version serveur pour affichage journal
      }
    ]
  }
}
```

### 2.6 Validation statut tenant au push (NO-GO 6)

> **Risque :** un tenant suspendu pendant qu'un agent est offline peut soumettre des documents créés offline après la suspension. Ces documents ne doivent pas être acceptés.

```typescript
// sync.service.ts — PREMIÈRE vérification, avant tout traitement
async validateTenantActive(tenantId: string, userId: string, qr: QueryRunner): Promise<void> {
  const tenant = await qr.manager.findOne(Tenant, {
    where: { id: tenantId, deletedAt: IsNull() },
  });
  if (!tenant) {
    throw new ForbiddenException('Tenant introuvable');
  }
  if (tenant.status === 'suspended') {
    throw new ForbiddenException(
      'Compte suspendu — synchronisation impossible. Contactez le support.',
    );
  }
  const user = await qr.manager.findOne(User, {
    where: { id: userId, tenantId, deletedAt: IsNull() },
  });
  if (!user || user.status !== 'active') {
    throw new ForbiddenException('Utilisateur inactif ou supprimé');
  }
}
```

Cette vérification est appelée **une fois par requête push** (pas par opération individuelle) — elle court-circuite l'intégralité du batch si le tenant est suspendu.

---

## 3. Pool de numérotation offline

### 3.1 Principe

Au login (ou au retour réseau avec `lastPoolRefresh` > 4h), le serveur alloue un pool de numéros séquentiels par agent et par type de document.

```
Agent A, login 2026-06-23 :
  BL vente   : BL-26-047 → BL-26-056  (10 numéros)
  Factures   : FAC-26-023 → FAC-26-027  (5 numéros)
  Devis      : DEV-26-011 → DEV-26-015  (5 numéros)
```

Le numéro apparaît **immédiatement et définitivement** sur le document local — il est visible par le client sans aucune mention TMP-.

**Numéros non utilisés :** expiration après 72h (rapport Métier). Les numéros expirés sont marqués `expired`. Le prochain séquentiel est calculé depuis le dernier numéro *effectivement utilisé* (pas le dernier alloué), pour éviter les trous dans la séquence.

### 3.2 API pool

```
POST /api/v1/sync/number-pool/allocate
Body: { "types": ["delivery_note", "sales_invoice", "quote"] }

Réponse :
{
  "data": {
    "pools": {
      "delivery_note": {
        "numbers": ["BL-26-047", ..., "BL-26-056"],
        "expiresAt": "2026-06-26T09:15:00Z"   ← 72h
      },
      "sales_invoice": {
        "numbers": ["FAC-26-023", ..., "FAC-26-027"],
        "expiresAt": "2026-06-26T09:15:00Z"
      },
      "quote": {
        "numbers": ["DEV-26-011", ..., "DEV-26-015"],
        "expiresAt": "2026-06-26T09:15:00Z"
      }
    }
  }
}
```

### 3.3 Implémentation serveur — lock par tenant (R013 + R020)

```typescript
// src/sync/number-pool.service.ts
async allocatePool(
  tenantId: string,
  userId: string,
  type: string,
  count: number,
): Promise<string[]> {
  const queryRunner = this.dataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();
  try {
    // Lock scopé par tenant + type — évite les doublons en concurrence (R013)
    await queryRunner.query(
      `SELECT pg_advisory_xact_lock(hashtext($1))`,
      [`pool_${type}_${tenantId}`],
    );
    const year = new Date().getFullYear();
    // Chercher le dernier numéro UTILISÉ (pas alloué) pour ce tenant/type/année
    const lastUsed = await queryRunner.manager
      .createQueryBuilder(NumberPoolAllocation, 'np')
      .where(
        'np.tenantId = :tenantId AND np.documentType = :type AND EXTRACT(YEAR FROM np.createdAt) = :year AND np.status = :status',
        { tenantId, type, year, status: 'used' },
      )
      .orderBy('np.lastNumber', 'DESC')
      .limit(1)
      .getOne();
    const start = lastUsed ? lastUsed.lastNumber + 1 : 1;
    const expiresAt = new Date(Date.now() + 72 * 3600 * 1000);
    const numbers = Array.from({ length: count }, (_, i) =>
      this.format(type, year, start + i),
    );
    await queryRunner.manager.save(NumberPoolAllocation, {
      tenantId,
      userId,
      documentType: type,
      firstNumber: start,
      lastNumber: start + count - 1,
      numbers: JSON.stringify(numbers),
      expiresAt,
      status: 'allocated',
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

private format(type: string, year: number, n: number): string {
  const yy = String(year).slice(-2);
  const seq = String(n).padStart(3, '0');
  const prefixes: Record<string, string> = {
    delivery_note: 'BL',
    sales_invoice: 'FAC',
    quote: 'DEV',
    purchase_order: 'PO',
  };
  return `${prefixes[type]}-${yy}-${seq}`;
}
```

### 3.4 Table `number_pool_allocations` (migration R002)

```sql
CREATE TABLE number_pool_allocations (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id),
  user_id        UUID NOT NULL REFERENCES users(id),
  document_type  VARCHAR(50) NOT NULL,
  first_number   INT NOT NULL,
  last_number    INT NOT NULL,
  numbers        JSONB NOT NULL,
  status         VARCHAR(20) NOT NULL DEFAULT 'allocated', -- 'allocated' | 'used' | 'expired'
  expires_at     TIMESTAMPTZ NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by     VARCHAR(255),
  updated_by     VARCHAR(255),
  CONSTRAINT uq_npa_tenant_type_first UNIQUE (tenant_id, document_type, first_number)
);
CREATE INDEX idx_npa_tenant_type    ON number_pool_allocations(tenant_id, document_type);
CREATE INDEX idx_npa_status         ON number_pool_allocations(status);
CREATE INDEX idx_npa_expires_at     ON number_pool_allocations(expires_at);
```

**Cron d'expiration :** job quotidien marquant `status = 'expired'` les allocations dont `expires_at < now() AND status = 'allocated'`.

---

## 4. Schéma SQLite local

Drizzle schema — `packages/mobile/src/db/schema.ts`

### 4.1 Colonnes retenues par entité (rapport Data)

**Principes :**
- Montants stockés en `TEXT` (décimal exact, pas de `REAL` — évite l'approximation flottante)
- Colonnes `displayXxx` pour les montants indicatifs calculés localement (jamais envoyées au serveur)
- `syncStatus` : `'pending'` | `'synced'` | `'conflict'` | `'error'`
- `localOnly` : `true` si créé offline et jamais vu par le serveur

```typescript
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

// ─── Entités pull-only (lecture seule locale) ───────────────────────────────

export const customers = sqliteTable('customers', {
  id:         text('id').primaryKey(),
  tenantId:   text('tenant_id').notNull(),
  name:       text('name').notNull(),
  phone:      text('phone'),
  email:      text('email'),
  address:    text('address'),
  nif:        text('nif'),
  rc:         text('rc'),
  balance:    text('balance'),   // indicatif
  updatedAt:  text('updated_at').notNull(),
  deletedAt:  text('deleted_at'),
});

export const customerContacts = sqliteTable('customer_contacts', {
  id:         text('id').primaryKey(),
  customerId: text('customer_id').notNull(),
  tenantId:   text('tenant_id').notNull(),
  name:       text('name').notNull(),
  phone:      text('phone'),
  updatedAt:  text('updated_at').notNull(),
  deletedAt:  text('deleted_at'),
});

export const finishedProducts = sqliteTable('finished_products', {
  id:          text('id').primaryKey(),
  tenantId:    text('tenant_id').notNull(),
  name:        text('name').notNull(),
  unitPrice:   text('unit_price').notNull(),
  taxRate:     text('tax_rate').notNull(),  // ex: "19.00"
  unit:        text('unit').notNull(),
  description: text('description'),
  updatedAt:   text('updated_at').notNull(),
  deletedAt:   text('deleted_at'),
});

// InventorySummary : lecture seule — FIFO décrémenté côté serveur uniquement
export const inventorySummary = sqliteTable('inventory_summary', {
  id:                text('id').primaryKey(),
  rawMaterialId:     text('raw_material_id').notNull(),
  tenantId:          text('tenant_id').notNull(),
  quantityAvailable: text('quantity_available').notNull(),
  updatedAt:         text('updated_at').notNull(),
});

// ─── Entités mutables offline ────────────────────────────────────────────────

export const deliveryNotes = sqliteTable('delivery_notes', {
  id:              text('id').primaryKey(),   // UUID v4 client
  tenantId:        text('tenant_id').notNull(),
  customerId:      text('customer_id').notNull(),
  number:          text('number').notNull(), // depuis pool
  status:          text('status').notNull().default('draft'),
  notes:           text('notes'),
  // Montants indicatifs (calculés localement, jamais envoyés au serveur)
  displaySubtotal: text('display_subtotal'),
  displayTaxAmount:text('display_tax_amount'),
  displayTotal:    text('display_total'),
  syncStatus:      text('sync_status').notNull().default('pending'),
  localOnly:       integer('local_only', { mode: 'boolean' }).notNull().default(true),
  clientUpdatedAt: text('client_updated_at').notNull(),
  createdAt:       text('created_at').notNull(),
  syncedAt:        text('synced_at'),
});

export const deliveryNoteItems = sqliteTable('delivery_note_items', {
  id:             text('id').primaryKey(),
  deliveryNoteId: text('delivery_note_id').notNull(),
  productId:      text('product_id').notNull(),
  quantity:       text('quantity').notNull(),
  unitPrice:      text('unit_price').notNull(),
});

export const quotes = sqliteTable('quotes', {
  id:              text('id').primaryKey(),
  tenantId:        text('tenant_id').notNull(),
  customerId:      text('customer_id').notNull(),
  number:          text('number').notNull(),
  status:          text('status').notNull().default('draft'),
  notes:           text('notes'),
  validUntil:      text('valid_until'),
  displaySubtotal: text('display_subtotal'),
  displayTaxAmount:text('display_tax_amount'),
  displayTotal:    text('display_total'),
  syncStatus:      text('sync_status').notNull().default('pending'),
  localOnly:       integer('local_only', { mode: 'boolean' }).notNull().default(true),
  clientUpdatedAt: text('client_updated_at').notNull(),
  createdAt:       text('created_at').notNull(),
  syncedAt:        text('synced_at'),
});

export const quoteItems = sqliteTable('quote_items', {
  id:        text('id').primaryKey(),
  quoteId:   text('quote_id').notNull(),
  productId: text('product_id').notNull(),
  quantity:  text('quantity').notNull(),
  unitPrice: text('unit_price').notNull(),
});

export const salesInvoices = sqliteTable('sales_invoices', {
  id:              text('id').primaryKey(),
  tenantId:        text('tenant_id').notNull(),
  customerId:      text('customer_id').notNull(),
  number:          text('number').notNull(),
  status:          text('status').notNull().default('draft'),
  invoiceDate:     text('invoice_date'),
  notes:           text('notes'),
  amountPaid:      text('amount_paid'),
  amountDue:       text('amount_due'),
  // Indicatifs locaux — le serveur recalcule et écrase (R008)
  displaySubtotal: text('display_subtotal'),
  displayTaxAmount:text('display_tax_amount'),
  displayTotal:    text('display_total'),
  syncStatus:      text('sync_status').notNull().default('pending'),
  localOnly:       integer('local_only', { mode: 'boolean' }).notNull().default(true),
  clientUpdatedAt: text('client_updated_at').notNull(),
  createdAt:       text('created_at').notNull(),
  syncedAt:        text('synced_at'),
});

export const salesInvoiceItems = sqliteTable('sales_invoice_items', {
  id:             text('id').primaryKey(),
  salesInvoiceId: text('sales_invoice_id').notNull(),
  productId:      text('product_id').notNull(),
  quantity:       text('quantity').notNull(),
  unitPrice:      text('unit_price').notNull(),
});

export const payments = sqliteTable('payments', {
  id:            text('id').primaryKey(),
  tenantId:      text('tenant_id').notNull(),
  invoiceId:     text('invoice_id').notNull(),
  amount:        text('amount').notNull(),
  paymentMethod: text('payment_method').notNull(),
  paymentDate:   text('payment_date').notNull(),
  reference:     text('reference'),
  syncStatus:    text('sync_status').notNull().default('pending'),
  localOnly:     integer('local_only', { mode: 'boolean' }).notNull().default(true),
  clientUpdatedAt: text('client_updated_at').notNull(),
  createdAt:     text('created_at').notNull(),
  syncedAt:      text('synced_at'),
});

export const expenses = sqliteTable('expenses', {
  id:          text('id').primaryKey(),
  tenantId:    text('tenant_id').notNull(),
  description: text('description').notNull(),
  amount:      text('amount').notNull(),
  category:    text('category').notNull(),
  expenseDate: text('expense_date').notNull(),
  syncStatus:  text('sync_status').notNull().default('pending'),
  localOnly:   integer('local_only', { mode: 'boolean' }).notNull().default(true),
  clientUpdatedAt: text('client_updated_at').notNull(),
  createdAt:   text('created_at').notNull(),
  syncedAt:    text('synced_at'),
});

// ─── Tables techniques ───────────────────────────────────────────────────────

export const numberPools = sqliteTable('number_pools', {
  id:           text('id').primaryKey(),
  documentType: text('document_type').notNull(),
  numbers:      text('numbers').notNull(),  // JSON array stringifié
  usedCount:    integer('used_count').notNull().default(0),
  expiresAt:    text('expires_at').notNull(),
  allocatedAt:  text('allocated_at').notNull(),
});

export const syncQueue = sqliteTable('sync_queue', {
  id:              text('id').primaryKey(),  // UUID v4 client
  entityType:      text('entity_type').notNull(),
  entityId:        text('entity_id').notNull(),
  operation:       text('operation').notNull(),
  payload:         text('payload').notNull(),  // JSON
  clientUpdatedAt: text('client_updated_at').notNull(),
  status:          text('status').notNull().default('pending'),
  errorMessage:    text('error_message'),
  retryCount:      integer('retry_count').notNull().default(0),
  createdAt:       text('created_at').notNull().default("(datetime('now'))"),
});

export const settingsCache = sqliteTable('settings_cache', {
  key:       text('key').primaryKey(),
  value:     text('value').notNull(),
  cachedAt:  text('cached_at').notNull(),
  expiresAt: text('expires_at').notNull(),
});
```

### 4.2 Index SQLite obligatoires (rapport Data)

```sql
-- Recherche clients (FTS5 ou LIKE)
CREATE INDEX idx_customers_name       ON customers(name);
CREATE INDEX idx_customers_updated    ON customers(updated_at);

-- Filtrage documents
CREATE INDEX idx_dn_customer          ON delivery_notes(customer_id);
CREATE INDEX idx_dn_status            ON delivery_notes(status);
CREATE INDEX idx_dn_updated           ON delivery_notes(updated_at);
CREATE INDEX idx_si_customer          ON sales_invoices(customer_id);
CREATE INDEX idx_si_status            ON sales_invoices(status);
CREATE INDEX idx_si_updated           ON sales_invoices(updated_at);

-- Sync queue (ne lire que les pending)
CREATE INDEX idx_sq_status            ON sync_queue(status) WHERE status = 'pending';
CREATE INDEX idx_sq_entity            ON sync_queue(entity_type, entity_id);

-- Pool numéros
CREATE INDEX idx_fp_updated           ON finished_products(updated_at);
```

### 4.3 Configuration SQLCipher

```typescript
// packages/mobile/src/db/connection.ts
const db = await sqlite.createConnection('echango_db', true, 'secret', encryptionKey, false);
await db.open();
// Paramètres SQLCipher (rapport Sécurité)
await db.execute(`PRAGMA cipher = 'aes-256-cbc'`);
await db.execute(`PRAGMA kdf_iter = 64000`);
await db.execute(`PRAGMA page_size = 4096`);
await db.execute(`PRAGMA foreign_keys = OFF`);  // OFF pendant le first sync (voir §10.3)
```

---

## 5. API backend — module src/sync/

### 5.1 Endpoints

| Méthode | Route | Auth | Description |
|---------|-------|------|-------------|
| GET | `/api/v1/sync/pull` | JWT | Pull delta d'une entité |
| POST | `/api/v1/sync/push` | JWT | Push batch d'opérations (≤50) |
| POST | `/api/v1/sync/number-pool/allocate` | JWT | Allouer pool numéros |
| GET | `/api/v1/sync/status` | JWT | Statut sync (lastSync, pendingCount) |

**Rate limiting :** `/api/v1/sync/push` — 50 opérations/heure par tenant (rapport Sécurité). Configurer via `@nestjs/throttler`.

### 5.2 Entités pullables

```typescript
// entity-registry.ts
export const PULLABLE_ENTITIES = [
  'customers',
  'customer_contacts',
  'finished_products',
  'inventory_summary',
  'delivery_notes',
  'delivery_note_items',
  'sales_invoices',
  'sales_invoice_items',
  'quotes',
  'quote_items',
  'payments',
  'expenses',
  'settings',
] as const;
```

### 5.3 PullQueryDto

```typescript
// dto/pull-query.dto.ts
export class PullQueryDto {
  @IsIn(PULLABLE_ENTITIES)
  entity: string;

  @IsDateString()
  since: string;       // ISO8601 UTC

  @IsInt() @Min(1)
  page: number = 1;

  @IsInt() @Min(1) @Max(200)
  limit: number = 200;
}
```

### 5.4 PushItemDto

```typescript
// dto/push-item.dto.ts
export class PushItemDto {
  @IsUUID(4)
  queueId: string;

  @IsIn(['delivery_note', 'sales_invoice', 'payment', 'quote', 'expense'])
  entityType: string;

  @IsUUID(4)
  entityId: string;

  @IsIn(['CREATE', 'UPDATE', 'DELETE'])
  operation: string;

  @IsDateString()
  clientUpdatedAt: string;    // comparé vs serverEntity pour FWW

  @IsObject()
  payload: Record<string, unknown>;
}

// dto/push-batch.dto.ts
export class PushBatchDto {
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => PushItemDto)
  operations: PushItemDto[];
}
```

### 5.5 Logique push par opération

```typescript
// sync.service.ts
async processPushOperation(
  op: PushItemDto,
  userId: string,
  tenantId: string,
  userRole: string,
  receivedAt: Date,   // timestamp serveur de réception de la requête (D10)
): Promise<PushResult> {
  const queryRunner = this.dataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();
  try {
    // 1. Whitelist champs par rôle (champs calculés et sensibles filtrés)
    const filtered = this.fieldWhitelist.filter(op.payload, op.entityType, userRole);

    // 2. Valider ownership FK cross-tenant (R020)
    await this.tenantOwnershipValidator.validate(filtered, tenantId, queryRunner);

    // 3. Valider timestamp client (anti-futur)
    const clientTs = new Date(op.clientUpdatedAt);
    if (clientTs > new Date(Date.now() + 5 * 60 * 1000)) {
      throw new BadRequestException('Timestamp client dans le futur — rejeté');
    }

    // 4. Résolution FWW si UPDATE (algorithme corrigé D10)
    if (op.operation === 'UPDATE') {
      const entityClass = this.entityRegistry.getClass(op.entityType);
      const server = await queryRunner.manager.findOne(entityClass, {
        where: { id: op.entityId, tenantId, deletedAt: IsNull() },
      });
      if (server) {
        const winner = this.conflictResolver.resolve(server, clientTs, receivedAt);
        if (winner === 'server_wins') {
          await queryRunner.commitTransaction();
          return {
            queueId: op.queueId,
            success: false,
            error: 'CONFLICT_SERVER_WINS',
            serverRecord: server,
          };
        }
      }
    }

    // 5. Recalculer montants côté serveur (R008 — jamais faire confiance au mobile)
    if (['delivery_note', 'sales_invoice', 'quote'].includes(op.entityType)) {
      await this.totalsRecalculator.recalculate(filtered, tenantId, queryRunner);
    }

    // 6. Persister + side effects dans la même transaction (R005)
    const strategy = this.entityStrategies[op.entityType];
    const saved = await strategy.persist(
      filtered,
      tenantId,
      userId,
      op.operation,
      receivedAt,
      queryRunner,
    );
    await strategy.applyEffects(saved, queryRunner);

    await queryRunner.commitTransaction();
    return {
      queueId: op.queueId,
      success: true,
      serverId: saved.id,
      serverNumber: saved.number,
      conflict: false,
    };
  } catch (e) {
    await queryRunner.rollbackTransaction();
    throw e;  // AllExceptionsFilter global (R006)
  } finally {
    await queryRunner.release();
  }
}
```

---

## 6. Sécurité — 6 blocants critiques

### S1 — CRITICAL : DB locale chiffrée (SQLCipher)

> **NO-GO 1 (rapport Sécurité) :** sans chiffrement, toutes les données financières sont lisibles sur appareil volé ou rooté.

```typescript
// packages/mobile/src/db/lifecycle.ts

async getOrGenerateEncryptionKey(): Promise<string> {
  const stored = await Preferences.get({ key: 'db_encryption_key' });
  if (stored.value) return stored.value;
  // Génération cryptographiquement sûre
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  const key = Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
  await Preferences.set({ key: 'db_encryption_key', value: key });
  return key;
}

async onLogout(): Promise<void> {
  await sqlite.deleteDatabase('echango_db');
  await Preferences.remove({ key: 'db_encryption_key' });
}

async onTenantChange(newTenantId: string): Promise<void> {
  await sqlite.deleteDatabase('echango_db');
  await this.initDatabase();
  await this.pullInitialData(newTenantId);
}
```

**Paramètres SQLCipher :** `cipher=aes-256-cbc`, `kdf_iter=64000`, `page_size=4096` (rapport Data).

**Tokens JWT :** stockés dans `@capacitor/preferences` avec option `WHEN_UNLOCKED_THIS_DEVICE_ONLY`. Refresh token avec `requireAuthentication: true` (biométrie si disponible).

### S2 — CRITICAL : TenantOwnershipValidator (FK cross-tenant)

> **NO-GO 2 (rapport Sécurité) :** si le backend accepte des FK sans vérifier `tenantId`, un acteur malveillant peut lire les données d'un autre tenant.

```typescript
// src/sync/tenant-ownership-validator.ts
@Injectable()
export class TenantOwnershipValidator {
  private readonly FK_FIELDS: Record<string, EntityTarget<any>> = {
    customerId:    Customer,
    supplierId:    Supplier,
    productId:     FinishedProduct,
    rawMaterialId: RawMaterial,
    invoiceId:     SalesInvoice,
    deliveryNoteId:DeliveryNote,
    quoteId:       Quote,
  };

  async validate(
    payload: Record<string, unknown>,
    tenantId: string,
    qr: QueryRunner,
  ): Promise<void> {
    for (const [field, EntityClass] of Object.entries(this.FK_FIELDS)) {
      const value = payload[field];
      if (value && typeof value === 'string') {
        const count = await qr.manager.count(EntityClass as any, {
          where: { id: value, tenantId, deletedAt: IsNull() },
        });
        if (!count) {
          throw new ForbiddenException(
            `FK invalide ou cross-tenant : champ "${field}" introuvable pour ce tenant`,
          );
        }
      }
    }
  }
}
```

### S3 — HIGH : FWW avec `receivedAt` serveur (D10)

> **NO-GO 3 (rapport Sécurité) :** FWW "last timestamp wins" basé sur `clientUpdatedAt` est insuffisant (dérive horloge Android >2 min).

Algorithme corrigé en §2.3. Le serveur enregistre `receivedAt = new Date()` au moment de la réception de la requête push et le persiste sur l'entité.

### S4 — HIGH : Whitelist champs par rôle

> **NO-GO 4 (rapport Sécurité) :** le mobile ne doit pas pouvoir modifier des champs calculés serveur ou changer son propre rôle.

```typescript
// src/sync/field-whitelist.ts
export const ALLOWED_FIELDS: Record<string, Record<string, string[]>> = {
  delivery_note: {
    owner:   ['customerId', 'items', 'notes', 'pooledNumber', 'status'],
    manager: ['customerId', 'items', 'notes', 'pooledNumber', 'status'],
    agent:   ['customerId', 'items', 'notes', 'pooledNumber'],
    // agents ne peuvent pas changer le status
  },
  sales_invoice: {
    owner:   ['customerId', 'items', 'notes', 'pooledNumber', 'invoiceDate'],
    manager: ['customerId', 'items', 'notes', 'pooledNumber', 'invoiceDate'],
    agent:   ['customerId', 'items', 'notes', 'pooledNumber', 'invoiceDate'],
  },
  payment: {
    owner:   ['invoiceId', 'amount', 'paymentMethod', 'paymentDate', 'reference'],
    manager: ['invoiceId', 'amount', 'paymentMethod', 'paymentDate', 'reference'],
    agent:   [],  // agents ne peuvent pas enregistrer de paiements
  },
  quote: {
    owner:   ['customerId', 'items', 'notes', 'pooledNumber', 'validUntil'],
    manager: ['customerId', 'items', 'notes', 'pooledNumber', 'validUntil'],
    agent:   ['customerId', 'items', 'notes', 'pooledNumber', 'validUntil'],
  },
  expense: {
    owner:   ['description', 'amount', 'category', 'expenseDate'],
    manager: ['description', 'amount', 'category', 'expenseDate'],
    agent:   ['description', 'amount', 'category', 'expenseDate'],
  },
};

// Champs JAMAIS acceptés depuis le mobile (filtrés systématiquement) :
// subtotal, taxAmount, totalAmount, amountPaid, amountDue, createdBy, updatedBy,
// tenantId (depuis JWT uniquement), deletedAt
```

### S5 — HIGH : Montants recalculés serveur-side (R008)

> **NO-GO 5 (rapport Sécurité) :** le serveur doit recalculer `subtotal`, `taxAmount`, `totalAmount` depuis les lignes brutes. Jamais faire confiance aux montants du mobile.

- Le payload push ne contient jamais `subtotal`, `taxAmount`, `totalAmount`.
- Si présents (bug client), la whitelist les filtre avant persistance.
- Le `taxRate` est récupéré depuis les `settings` du tenant (jamais depuis le mobile).

```typescript
// src/sync/totals-recalculator.ts
async recalculate(
  payload: Record<string, unknown>,
  tenantId: string,
  qr: QueryRunner,
): Promise<void> {
  const settings = await qr.manager.findOne(Settings, { where: { tenantId } });
  const taxRate = settings?.taxRate ?? 19;
  const items = payload.items as Array<{ quantity: string; unitPrice: string }>;
  if (!items?.length) return;
  const subtotal = items.reduce(
    (sum, item) => sum + parseFloat(item.quantity) * parseFloat(item.unitPrice),
    0,
  );
  const taxAmount = Math.round(subtotal * taxRate) / 100;
  payload.subtotal   = subtotal.toFixed(2);
  payload.taxAmount  = taxAmount.toFixed(2);
  payload.totalAmount = (subtotal + taxAmount).toFixed(2);
}
```

### S6 — HIGH : Session offline max 72h sans re-auth réseau

> **NO-GO 6 additionnel (rapport Sécurité) :** après 72h sans contact serveur, l'agent ne peut plus créer de nouveaux documents.

```typescript
// packages/mobile/src/hooks/useOfflineSessionGuard.ts
export function useOfflineSessionGuard() {
  const navigate = useNavigate();
  useEffect(() => {
    const check = async () => {
      const lastOnlineStr = await Preferences.get({ key: 'last_online_at' });
      if (!lastOnlineStr.value) return;
      const hoursOffline = (Date.now() - new Date(lastOnlineStr.value).getTime()) / 3600000;
      if (hoursOffline > 72) {
        // Bloquer la création — forcer re-auth au retour réseau
        navigate('/session-expired');
      }
    };
    check();
  }, []);
}
```

**PIN local :** 4–6 chiffres, 5 tentatives max, verrouillage app après 15 min d'inactivité. Dérivation de la clé SQLCipher via PBKDF2 HMAC-SHA512.

### S6b — Anti-replay nonce

```typescript
// sync.controller.ts
@Post('push')
@ApiOperation({ summary: 'Push batch d\'opérations offline' })
async push(
  @Headers('x-request-nonce') nonce: string,
  @Body() dto: PushBatchDto,
  @CurrentUser() user: User,
) {
  if (!nonce) throw new BadRequestException('Header X-Request-Nonce requis');
  const set = await this.redis.set(`nonce:${nonce}`, '1', 'EX', 600, 'NX');
  if (!set) throw new ConflictException('Nonce déjà utilisé — replay détecté');
  // Vérification statut tenant avant traitement
  await this.syncService.validateTenantActive(user.tenantId, user.id);
  return this.syncService.processBatch(dto, user);
}
```

### S6c — createdBy/updatedBy toujours depuis JWT (R012)

Le payload push ne contient jamais `createdBy` ni `updatedBy`. L'`AuditInterceptor` existant les injecte depuis le JWT décodé. Le `sync.service` passe `userId` depuis le token à la stratégie de persistance.

---

## 7. Entités synchronisées

### 7.1 Entités incluses MVP (rapport Data)

| Entité | Direction | Notes |
|--------|-----------|-------|
| `customers` | Pull | 90 derniers jours d'activité |
| `customer_contacts` | Pull | Liés aux customers pullés |
| `finished_products` | Pull | Tous (catalogue complet) |
| `inventory_summary` | Pull | Lecture seule — FIFO côté serveur |
| `sales_invoices` | Pull + Push | Status `draft` uniquement en push |
| `sales_invoice_items` | Pull + Push | Liés aux invoices |
| `delivery_notes` | Pull + Push | Status `draft` uniquement |
| `delivery_note_items` | Pull + Push | Liés aux BL |
| `quotes` | Pull + Push | |
| `quote_items` | Pull + Push | |
| `payments` | Pull + Push | CREATE uniquement (owner/manager) |
| `expenses` | Pull + Push | CREATE + UPDATE |
| `settings` | Pull | Péremption 7 jours (taxRate, formats) |

### 7.2 Entités EXCLUES définitivement (rapport Data)

| Entité | Raison |
|--------|--------|
| `stock_entries` | 8–15k lignes, FIFO impossible offline → InventorySummary lecture seule |
| `admin_audit_logs` | 20–50k lignes, 15–40 MB — volume inacceptable |
| `saas_payments` | Données sensibles abonnement SaaS |
| `production_orders` + BOM | Complexité FIFO MP+PF → v2 |
| `reception_bls` | Réception entrepôt FIFO complexe → v1.1 |

### 7.3 Opérations autorisées par entité

| Entité | CREATE | UPDATE | DELETE | Side effects serveur |
|--------|--------|--------|--------|---------------------|
| `delivery_note` | ✅ | ✅ (draft) | ❌ | FIFO décrémenté (R015), stock → reserved |
| `sales_invoice` | ✅ | ✅ (draft) | ❌ | TVA recalculée (R008) |
| `payment` | ✅ | ❌ | ❌ | amountPaid+=, amountDue-=, status→paid si soldé, stock→sold |
| `quote` | ✅ | ✅ (draft) | ❌ | TVA recalculée |
| `expense` | ✅ | ✅ | ❌ | — |

### 7.4 Side effects non disponibles offline

- **PDF** (R014) : généré serveur à la demande post-sync
- **Email** : online-only
- **FIFO décrémentation** (R015) : serveur uniquement
- **Conversion BL → Facture** : online-only (crée deux entités liées avec numérotation)
- **Production orders** : online-only (complexité FIFO MP + PF)

---

## 8. Fonctionnalités offline vs online-only

| Fonctionnalité | Offline | Online | Notes |
|----------------|:-------:|:------:|-------|
| Créer BL vente | ✅ | ✅ | Numéro du pool, FIFO côté serveur |
| Modifier BL (draft) | ✅ | ✅ | |
| Consulter historique client | ✅ | ✅ | 90 jours en cache |
| Créer facture | ✅ | ✅ | TVA affichée indicative |
| Enregistrer paiement espèces | ✅ | ✅ | Owner/Manager uniquement |
| Créer devis | ✅ | ✅ | |
| Saisir dépense terrain | ✅ | ✅ | |
| Consulter stock (indicatif) | ✅ | ✅ | InventorySummary local |
| Réception entrepôt | ❌ | ✅ | Stock FIFO complexe → v1.1 |
| Générer PDF | ❌ | ✅ | R014 |
| Envoyer email | ❌ | ✅ | |
| Convertir BL → Facture | ❌ | ✅ | |
| Ordre de production | ❌ | ✅ | → v2 |
| Dashboard / rapports | ❌ | ✅ | |
| Modifier facture payée | ❌ | ✅ | Status lock |

---

## 9. UX offline

### 9.1 Design système terrain

> **Contraintes spécifiques PME algérienne** (rapport UX) : utilisation en plein soleil, appareils entrée de gamme (Redmi 9A, Galaxy A12), réseau instable.

**Tailles de tap target :**
- Minimum absolu : **48dp**
- Recommandé : **56dp**
- Hauteur item liste : **72dp**
- FAB Créer : **64dp**, couleur primaire, toujours visible

**Contraste :**
- Ratio **7:1** pour les montants et numéros de documents (texte critique plein soleil)
- Ratio **4.5:1** minimum pour le texte courant

**Mode de couleur :**
- Mode clair par défaut (lisibilité soleil)
- Bascule manuelle Mode sombre disponible
- Aucune couleur hardcodée — uniquement tokens sémantiques Tailwind (charte Echango, CLAUDE.md §3)

### 9.2 Navigation — Bottom Tabs 5 onglets

```
┌──────────────────────────────────────────────────┐
│                                                  │
│                 [Contenu principal]              │
│                                                  │
├──────────────────────────────────────────────────┤
│  🏠        📄        ➕        📦        👤      │
│ Accueil  Documents  Créer    Stock     Profil   │
│                    [FAB 64dp]                    │
└──────────────────────────────────────────────────┘
```

- **Accueil** : résumé journalier (CA du jour, documents en attente de sync, alertes stock)
- **Documents** : liste BL / Factures / Devis avec filtres rapides (statut, client)
- **Créer (FAB)** : bottom sheet avec options BL, Facture, Devis, Dépense
- **Stock** : InventorySummary indicatif (lecture seule)
- **Profil** : déconnexion, journal d'activité offline, infos pool numéros

### 9.3 Bandeau offline — indicateur de fraîcheur

```
┌─────────────────────────────────────────────────────┐
│ 📡 Hors ligne · Données du 22/06 à 14:30            │  ← ambre #F59E0B, hauteur 36dp
│                              [Sync maintenant]      │
└─────────────────────────────────────────────────────┘
```

| Âge données locales | Affichage |
|--------------------|-----------|
| < 8h | Aucun bandeau — indicator discret dans la barre de statut |
| 8–24h | Chip subtile "Mis à jour hier" dans le header |
| 24–72h | Bandeau ambre permanent "Données de plus de 24h — synchronisez dès que possible" |
| > 72h | Bandeau rouge + blocage création. Message : "Reconnectez-vous pour continuer à créer des documents." |

**Pendant la sync :** skeleton screens par section (pas de spinner bloquant). L'UI reste navigable pendant le pull/push.

### 9.4 Flux de création BL offline — 4 étapes

```
Étape 1 — Sélection client
  ┌────────────────────────────────┐
  │ 🔍 Rechercher un client...     │  ← FTS5 locale
  ├────────────────────────────────┤
  │ Sarl Amrani          Béjaïa   │
  │ Mouloud SARL         Alger    │
  │ Entreprise Ferhat    Djelfa   │
  └────────────────────────────────┘
  [Nouveau client ➕]  →  online-only (toast explicatif)

Étape 2 — Ajout lignes produits
  ┌─────────────────────────────────────────┐
  │ Produit : [Fromage blanc 250g      ▼]  │
  │ Quantité : [    5    ] unités           │
  │ Prix unit : [  1200  ] DZD             │
  │ Total ligne : 6 000 DZD                │  ← indicatif local
  ├─────────────────────────────────────────┤
  │ [📷 Scanner code-barres]               │  ← optionnel
  │ [+ Ajouter une ligne]                  │
  └─────────────────────────────────────────┘

Étape 3 — Récapitulatif
  ┌─────────────────────────────────────────┐
  │ BL-26-047         Sarl Amrani           │
  │ ─────────────────────────────────────── │
  │ Fromage blanc 250g   5 × 1 200  6 000  │
  │ Lait entier 1L      10 × 450    4 500  │
  │ ─────────────────────────────────────── │
  │ Sous-total                    10 500   │
  │ TVA 19% (indicatif)            1 995   │  ← avec mention "indicatif"
  │ TOTAL                         12 495   │
  └─────────────────────────────────────────┘
  Numéro affiché : BL-26-047 (définitif, depuis pool)

Étape 4 — Confirmation
  → Sauvegarde locale SQLite
  → Entrée dans sync_queue (opération CREATE)
  → Mise à jour du pool local (usedCount++)
  → Toast : "BL-26-047 créé — synchronisation en attente"
```

**Règle UX :** la mention "(indicatif)" apparaît systématiquement à côté de TVA et Total en mode offline. Elle disparaît après la première sync réussie.

### 9.5 Journal d'activité offline

Écran accessible depuis l'onglet Profil → "Activité offline" :

```
● BL-26-047  Sarl Amrani          23 juin 09:15  ✅ Synchronisé
● FAC-26-023 Sarl Amrani          23 juin 09:18  ⏳ En attente de sync
● BL-26-048  Mouloud SARL         23 juin 10:05  ℹ️ Version plus récente
● DEP-26-011 Dépense carburant    23 juin 10:30  ❌ Erreur — réessayer
```

**En cas de `CONFLICT_SERVER_WINS` :** jamais le mot "conflit". Message exact :
> "Une version plus récente de BL-26-047 a été enregistrée par Karim à 10:12. Votre version du 23 juin 09:15 n'a pas été appliquée."

Bouton **"Voir les deux versions"** → affichage côte à côte en langage métier (labels lisibles, pas de JSON).

### 9.6 Synchronisation automatique

- Au retour réseau détecté via `@capacitor/network` (`Network.addListener('networkStatusChange', ...)`)
- Toutes les 5 minutes si réseau disponible et documents en attente (`sync_queue` non vide)
- **Ordre fixe :** PULL d'abord → PUSH ensuite (contexte le plus récent avant envoi)
- Retry automatique avec backoff exponentiel : 1min → 5min → 15min → 1h

### 9.7 Gestion des pools — état visible

Dans l'onglet Profil, section "Documents hors ligne" :

```
Pool de numéros disponibles
─────────────────────────────────
BL vente    ████████░░  8/10 restants  expire 26/06
Factures    █████░░░░░  5/5  restants  expire 26/06
Devis       ████░░░░░░  4/5  restants  expire 26/06
─────────────────────────────────
[Recharger les numéros]   ← actif uniquement si connecté
```

**Alerte pool épuisé :** si le pool d'un type est à 0, le bouton de création correspondant est désactivé avec message : "Connectez-vous pour obtenir de nouveaux numéros de BL."

---

## 10. Volumes et performances

### 10.1 Volumes tenant moyen (rapport Data — base 90 jours)

| Entité | Lignes estimées | Taille SQLite |
|--------|----------------|---------------|
| customers | 50–200 | ~200 KB |
| finished_products | 20–100 | ~100 KB |
| sales_invoices | 200–500 | ~400 KB |
| sales_invoice_items | 800–2 000 | ~600 KB |
| delivery_notes | 300–600 | ~500 KB |
| delivery_note_items | 1 200–3 000 | ~800 KB |
| quotes | 100–300 | ~300 KB |
| payments | 200–400 | ~200 KB |
| expenses | 100–300 | ~200 KB |
| sync_queue + pools + settings | — | ~200 KB |
| **Total DB SQLite (clair)** | | **~3,5–5 MB** |
| **Total avec SQLCipher (+25%)** | | **~5–7 MB** |

### 10.2 Performance first sync

| Réseau | Durée estimée |
|--------|--------------|
| 4G (10 Mbps) | 5–7 secondes |
| 3G (1 Mbps) | 13–15 secondes |
| Delta quotidien (50 factures modifiées) | < 1 seconde même sur 3G |

**Payload compressé gzip :** ~1,4 MB pour 90 jours de données.

**Insertion SQLite batch :** 200–500 lignes par transaction. `setTimeout(resolve, 0)` entre chaque batch pour ne pas bloquer le thread UI (rapport Data).

```typescript
// packages/mobile/src/sync/first-sync.service.ts
async insertBatch<T>(items: T[], inserter: (batch: T[]) => Promise<void>): Promise<void> {
  const BATCH_SIZE = 300;
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    await inserter(batch);
    // Céder le thread UI entre chaque batch
    await new Promise(resolve => setTimeout(resolve, 0));
  }
}
```

### 10.3 Ordre d'import first sync (dépendances FK)

```
PRAGMA foreign_keys = OFF;   -- pendant tout le first sync

Niveau 0 (pas de FK) :
  finished_products, customers, settings

Niveau 1 (FK vers niveau 0) :
  customer_contacts, quotes, inventory_summary

Niveau 2 (FK vers niveau 0–1) :
  sales_invoices, delivery_notes, quote_items

Niveau 3 (FK vers niveau 0–2) :
  sales_invoice_items, delivery_note_items, payments

Niveau 4 :
  expenses

PRAGMA foreign_keys = ON;    -- réactivation après tout l'import
```

### 10.4 Benchmark objectifs (à valider Phase 3)

| Opération | Objectif |
|-----------|---------|
| Pull 1 000 records | < 500ms backend |
| Insertion SQLite 1 000 lignes | < 2s mobile |
| Push 50 opérations | < 3s backend |
| Recherche client (FTS5 local) | < 100ms |
| Déchiffrement SQLCipher ouverture DB | < 200ms |

---

## 11. Plan d'implémentation

**Estimation totale : 11–13 semaines-développeur**  
**Équipe : 1 backend senior + 1 dev mobile React à partir de S4**

### Phase 1 — Backend sync module (S1–S3) · Backend uniquement

**Objectif :** module `src/sync/` production-ready avec tests 100 % avant d'écrire une ligne de mobile.

| Semaine | Tâches |
|---------|--------|
| S1 | Scaffold `src/sync/`, `entity-registry.ts`, `PullQueryDto`, endpoint GET pull (pagination + `deletedIds` + `serverTime`), tests unitaires |
| S2 | `ConflictResolver` (algo FWW corrigé D10 avec `receivedAt`), `TenantOwnershipValidator`, `FieldWhitelist`, endpoint POST push skeleton, migration `received_at`, tests |
| S3 | `NumberPoolService` + migration `number_pool_allocations`, strategies DeliveryNote/Invoice/Payment, `TotalsRecalculator`, benchmark <500ms/1000 records, anti-replay nonce Redis |

**Décisions à confirmer avant S1 :**
- [ ] Compte développeur Apple disponible ? (Visa internationale requise)
- [ ] Instance Redis disponible pour nonces anti-replay ?
- [ ] Monorepo : `packages/` à la racine ou repo séparé ?
- [ ] `received_at` : ajouter sur toutes les entités mutables ou seulement celles synchées ?

### Phase 2 — MVP mobile (S4–S7) · Backend + Mobile en parallèle

| Semaine | Backend | Mobile |
|---------|---------|--------|
| S4 | API pool numéros, endpoint `/sync/status`, cron expiration pool | Setup Capacitor + Drizzle + SQLCipher, migrations locales, first sync avec ordre FK |
| S5 | Stratégie Payment (side effects amountPaid/amountDue), tests intégration | Écrans : liste clients (FTS5), créer BL offline (flux 4 étapes) |
| S6 | Bug fixes sync, tests E2E backend | Écrans : créer facture, enregistrer paiement, indicateur pool numéros |
| S7 | Tests appareils réels (Redmi 9A) | Journal d'activité offline, bandeau fraîcheur, bloc création >72h |

### Phase 3 — Complément + Tests (S8–S9)

- Devis offline + conversion devis → facture (online uniquement, clarifier UX)
- Dépenses terrain (CREATE + UPDATE)
- Notifications push au retour sync
- Tests E2E Maestro/Detox sur appareils réels (Redmi 9A, Galaxy A12)
- Benchmarks performance (objectifs §10.4)
- Tests PIN local, expiration session 72h

### Phase 4 — Stores + CI/CD (S10–S13)

- Soumission Play Store (frais $25 one-time, délai 2–7 jours)
- Soumission App Store (frais $99/an, Visa internationale — ouvrir compte au plus tard S8)
- OTA : Capacitor Live Update (Appflow) ou APK direct pour utilisateurs connus
- CI/CD GitHub Actions : build APK + IPA automatique à chaque tag

---

## 12. Tests

### 12.1 Backend — tests unitaires obligatoires

```typescript
// __tests__/conflict-resolver.spec.ts
describe('ConflictResolver (D10 — receivedAt tiebreaker)', () => {
  it('client wins when clientUpdatedAt is clearly older than serverUpdatedAt', () => {
    const server = { updatedAt: new Date('2026-06-23T10:00:00Z'), receivedAt: null };
    const clientTs = new Date('2026-06-23T08:00:00Z');
    const receivedAt = new Date('2026-06-23T14:00:00Z');
    expect(resolver.resolve(server, clientTs, receivedAt)).toBe('client_wins');
  });
  it('server wins when clientUpdatedAt is clearly newer than serverUpdatedAt', () => {
    const server = { updatedAt: new Date('2026-06-23T08:00:00Z'), receivedAt: null };
    const clientTs = new Date('2026-06-23T10:00:00Z');
    const receivedAt = new Date('2026-06-23T14:00:00Z');
    expect(resolver.resolve(server, clientTs, receivedAt)).toBe('server_wins');
  });
  it('uses receivedAt tiebreaker when timestamps are within drift tolerance', () => {
    const server = {
      updatedAt: new Date('2026-06-23T10:00:00Z'),
      receivedAt: new Date('2026-06-23T10:01:30Z'),  // réception précédente
    };
    const clientTs = new Date('2026-06-23T10:01:00Z');  // 1 min d'écart → dans la zone ambiguë
    const receivedAt = new Date('2026-06-23T10:05:00Z');
    // clientTs < server.receivedAt → client plus ancien → client_wins
    expect(resolver.resolve(server, clientTs, receivedAt)).toBe('client_wins');
  });
  it('rejects timestamps more than 5 minutes in the future', async () => {
    // clientUpdatedAt = now + 10 min → BadRequestException dans sync.service
  });
});

// __tests__/tenant-ownership-validator.spec.ts
describe('TenantOwnershipValidator', () => {
  it('throws ForbiddenException on cross-tenant customerId', async () => { ... });
  it('passes valid same-tenant customerId', async () => { ... });
  it('throws on cross-tenant invoiceId in payment payload', async () => { ... });
});

// __tests__/sync.service.spec.ts
describe('SyncService', () => {
  it('recalculates subtotal/taxAmount/totalAmount from items, ignores client amounts', async () => { ... });
  it('blocks entire push when tenant is suspended', async () => { ... });
  it('detects nonce replay (HTTP 409)', async () => { ... });
  it('processes each operation independently — failure of one does not rollback others', async () => { ... });
  it('blocks push when user is inactive', async () => { ... });
  it('filters status field for agent role on delivery_note', async () => { ... });
  it('persists receivedAt on entity when operation succeeds', async () => { ... });
});

// __tests__/number-pool.service.spec.ts
describe('NumberPoolService', () => {
  it('allocates sequential numbers starting from last used (not last allocated)', async () => { ... });
  it('uses pg_advisory_xact_lock scoped by tenant + type', async () => { ... });
  it('expires allocations after 72h', async () => { ... });
  it('formats correctly: BL-26-047, FAC-26-023, DEV-26-011', async () => { ... });
});

// benchmark
describe('Pull performance', () => {
  it('returns 1000 records in < 500ms', async () => { ... });
});
```

### 12.2 Mobile — tests

- Drizzle migrations (schema up/down — tous les niveaux)
- `NumberPoolService` local (allocation séquentielle, epuisement, expiration)
- `SyncQueue` (enqueue, dequeue, retry avec backoff, purge après sync)
- Détection réseau et déclenchement sync automatique
- Calcul TVA indicatif local (format d'affichage, mention "indicatif")
- Verrouillage création après 72h offline
- Tests E2E Detox/Maestro : flux complet BL offline → sync → vérification serveur

---

## 13. Déploiement stores

### Play Store (priorité 1)

- Frais : $25 one-time
- Délai review : 2–7 jours
- APK/AAB signé via Capacitor CLI + keystore (stocker le keystore hors du repo Git)
- Politique données : déclarer chiffrement DB et données financières

### App Store (priorité 2)

- Frais : $99/an
- Carte Visa internationale requise (CIB algérienne non acceptée)
- Délai review : 1–3 jours
- Capacitor apps acceptées si valeur native réelle (offline + notifications push → OK)
- Compte Apple Developer à ouvrir **au plus tard en S8** pour ne pas bloquer la Phase 4
- Attention : refus possible en Algérie pour certaines catégories financières — prévoir un appel

### OTA (mises à jour sans passer par les stores)

- Capacitor Live Update (Appflow) ou fichier manifest JSON hébergé en self-hosted
- **Limité aux assets JS/CSS** — tout changement de plugin natif Capacitor = nouvelle soumission store
- Critique pour hotfixes sécurité sans attendre la review (2–7 jours Play Store)

### CI/CD recommandé

```yaml
# .github/workflows/mobile-build.yml
on:
  push:
    tags: ['v*']
jobs:
  android:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci && npm run build:mobile
      - run: npx cap build android --release
      # Signer avec keystore depuis GitHub Secrets
  ios:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci && npm run build:mobile
      - run: npx cap build ios --release
```

---

## 14. Invariants R001–R020 — tensions et résolutions

| Invariant | Tension | Résolution |
|-----------|---------|------------|
| R001 | `@Column()` nu sur `received_at` | `@Column({ type: 'timestamptz', nullable: true }) receivedAt: Date` — migration requise |
| R002 | `received_at` sur 5 tables + `number_pool_allocations` | Migration `AddReceivedAtAndNumberPool` créée dans le même commit (voir §2.3 et §3.4) |
| R005 | Une transaction par opération push (pas tout le batch) | Confirmé D4. Chaque opération = son propre QueryRunner. Rollback individuel. |
| R006 | Erreur dans une opération push | Exception remontée → AllExceptionsFilter → résultat `{ success: false, error: ... }` dans le tableau results (pas de HTTP 500 global) |
| R008 | TVA calculée localement pour affichage | Affichage indicatif + mention explicite en UI. Payload push ne contient jamais `subtotal`/`taxAmount`/`totalAmount`. Serveur recalcule et écrase. |
| R010 | Pagination du pull | `{ data: { records, deletedIds, pagination: { total, page, limit, hasMore }, serverTime } }` — conforme envelope R007/R010 |
| R012 | createdBy/updatedBy depuis JWT | Jamais dans le payload push. Injectés par AuditInterceptor côté serveur depuis `userId` du JWT. |
| R013 | Auto-numérotation avec lock | Pool pré-alloué avec `pg_advisory_xact_lock(hashtext('pool_type_tenantId'))` — conforme R013. |
| R014 | PDF archivé au chemin `ARCHIVES/` | Généré serveur-side post-sync uniquement. Jamais offline. |
| R015 | FIFO oldest first | Décrémenté côté serveur uniquement lors du push CREATE delivery_note. Stock local = indicatif (InventorySummary). |
| R017 | Rate limiting sur /sync/push | 50 opérations/heure par tenant via `@nestjs/throttler`. |
| R018 | i18n — textes UX offline | Toutes les chaînes UI ("Hors ligne", "Données de plus de 24h", messages conflits) via `t()` dans `src/i18n/fr.json`. |
| R019 | Pas de logique métier dans les controllers | `sync.controller.ts` : HTTP uniquement (validation nonce, validation DTO, appel `sync.service`). Toute logique dans `sync.service` et les stratégies. |
| R020 | tenantId dans toutes les queries | Pull : filtré par tenantId JWT. Push : TenantOwnershipValidator sur toutes les FK. Pool : scopé par tenantId. Jamais depuis URL ou body. |

---

*Spec arbitrée par le décideur multi-agent le 2026-06-23.*  
*Sources : 6 rapports experts — Architecte (Expo SDK 52), Métier (cas d'usage + numérotation), Sécurité (6 NO-GO), Processus (planning), UX (design terrain), Data (volumes + SQLite).*  
*Prochaine étape : validation équipe → démarrer Phase 1 S1.*
