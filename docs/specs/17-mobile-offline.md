# 17 — Mobile Offline-First + Synchronisation "First Write Wins"

**Projet:** echangoInvoice — Invoicing SaaS pour PME algériennes  
**Stack actuelle:** NestJS + React + PostgreSQL + JWT  
**Nouvelle feature:** Application mobile iOS/Android offline-first avec sync asynchrone  
**Stratégie de conflit:** "First Write Wins" — le premier arrivé écrase, sans résolution complexe  

---

## TABLE DES MATIÈRES

1. [Choix technologique mobile](#1-choix-technologique-mobile)
2. [Architecture de synchronisation](#2-architecture-de-synchronisation-first-write-wins)
3. [Entités à synchroniser](#3-entités-à-synchroniser)
4. [Gestion des conflits](#4-gestion-des-conflits-first-write-wins)
5. [Sécurité et authentification offline](#5-sécurité-et-authentification-offline)
6. [API de synchronisation backend](#6-api-de-synchronisation-backend)
7. [Impact sur le backend existant](#7-impact-sur-le-backend-existant)
8. [Fonctionnalités offline vs online-only](#8-fonctionnalités-offline-vs-online-only)
9. [Plan d'implémentation par phases](#9-plan-dimplémentation-par-phases)

---

## 1. Choix technologique mobile

### 1.1 Comparaison des approches

| Approche | Avantages | Inconvénients | Recommandation |
|----------|-----------|--------------|---|
| **React Native (bare)** | Réutilise code React web, équipe déjà React | Setup complexe, module natif lourd, offline/sync à implémenter soi-même | ❌ Trop coûteux en setup pour MVP |
| **Expo + Expo Go** | Rapid prototyping, déploiement facile, SDK complet | Limites sur modules natifs, performances, lock-in Expo | ⚠️ Pour prototype rapide uniquement |
| **PWA (Progressive Web App)** | Zéro Native, offline facile (Service Worker), déploie comme web | Limites UX mobile, pas app store, stockage limité (~50MB) | ✅ Viabilité pour MVP + test marché |
| **Capacitor (Ionic)** | Web-first, meilleur des deux mondes, stockage + plugins natifs | Overhead Ionic framework, dépendance Capacitor | ⚠️ Option crédible si PWA insuffisante |
| **Flutter** | Performances, UI riche, très bonne sync | Équipe doit apprendre Dart, zéro réutilisabilité React | ❌ Décalage technologique |
| **WatermelonDB/PowerSync** | DB locale avec sync server ultra-optimisée | Apprentissage courbe, prix ($) pour PowerSync | ✅ Meilleure pour sync complexe |

### 1.2 Recommandation : **PWA + Capacitor (MVP) → React Native (future)**

**Phase 1 (MVPs iOS/Android rapides):** PWA + Capacitor  
- Réutilise 90% du code React web
- Stockage local via `expo-sqlite` + `WatermelonDB`
- Offline-first hors de la boîte
- Déploiement rapide sur app stores (via Capacitor)
- Équipe = développeurs React/TypeScript existants

**Phase 2 (Performance à la production):** React Native Bare  
- Réinvestissement progressif une fois le product-market fit validé
- Même pattern sync que Phase 1
- Plus haute performance

### 1.3 Stack technique recommandé (Phase 1 : PWA + Capacitor)

```typescript
// Dependencies
{
  // UI Framework
  "react": "^19.0.0",
  "react-dom": "^19.0.0",
  "react-router-dom": "^6.27.0",
  
  // Offline DB Local
  "@nozbe/watermelondb": "^0.28.0",      // Sync-ready SQLite wrapper
  "expo-sqlite": "^14.0.0",               // SQLite pour Expo + Capacitor
  
  // API & Sync
  "@tanstack/react-query": "^5.59.0",
  "axios": "^1.7.7",
  
  // State Management
  "zustand": "^4.5.0",                    // Gestion sync queue
  
  // Capacitor (déploiement app store)
  "@capacitor/core": "^6.0.0",
  "@capacitor/app": "^6.0.0",
  "@capacitor/storage": "^6.0.0",
  "@capacitor/network": "^6.0.0",
  "@capacitor/preferences": "^6.0.0",
  
  // Utils
  "uuid": "^9.0.0",
  "date-fns": "^4.1.0",
  "zod": "^3.23.8",
  
  // Vite (unchanged)
  "vite": "^5.4.10"
}
```

### 1.4 Database locale : WatermelonDB vs alternatives

| BDD locale | Sync-ready | Offline-first | Performance | Taille DB | Recommandé |
|-----------|-----------|--------------|-------------|-----------|-----------|
| **WatermelonDB** | ✅ Natif | ✅✅ Excellent | ✅ Très rapide | 50-500MB | ✅✅✅ |
| **SQLite via expo-sqlite** | ⚠️ Manuel | ✅ Bon | ✅ Rapide | 500MB+ | ✅✅ (fondation) |
| **PowerSync** | ✅✅ Ultra-sync | ✅✅ Réel-temps | ✅✅ Optimisé | 1GB+ | ⚠️ Payant ($) |
| **RxDB** | ✅ Plugins | ✅ Bon | ⚠️ Lent | 100-200MB | ⚠️ Complexe |
| **MMKV + SQLite** | ⚠️ Manuel | ⚠️ Partiel | ✅✅ Rapide | 50MB | ❌ Pas para sync |

### 1.5 Choix final

**WatermelonDB + SQLite via Capacitor**

```typescript
// src/mobile/db/watermelon.ts
import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite/index';
import schema from './schema';
import migrations from './migrations';

const adapter = new SQLiteAdapter({
  schema,
  migrations,
  // Capacitor SQLite pour iOS/Android
  dbName: 'echango_invoice',
});

export const database = new Database({
  adapter,
  modelClasses: [
    SalesInvoiceModel,
    DeliveryNoteModel,
    CustomerModel,
    // ... autres modèles
  ],
});
```

---

## 2. Architecture de synchronisation "First Write Wins"

### 2.1 Principes fondamentaux

**"First Write Wins"** signifie :
- Le **premier** appareil à envoyer une modification au serveur **gagne**
- Les modifications ultérieures sur le même objet par d'autres appareils sont **écrasées**
- **Pas de fusion** de champs, **pas de resolution dialog** pour l'utilisateur
- **Notification simple** : "Votre modif a été écrasée par une autre"

**Cas d'usage typique :**
1. Agent mobile crée facture FAC-24-001 à 14h00 UTC (offline)
2. Manager web crée aussi facture FAC-24-001 à 14h05 UTC (online)
3. Agent se reconnecte à 15h00
4. Sync voit : serveur `updatedAt=14h05`, local `updatedAt=14h00`
5. **Décision :** Local est plus ancien → **rejeter, notifier agent "Facture mise à jour par manager"**

### 2.2 Rôle du champ `updatedAt` (timestamp)

**EXISTING:** Toutes les entités ont déjà `@UpdateDateColumn()` en UTC (R009)

```typescript
@UpdateDateColumn({ type: 'timestamptz' })
updatedAt: Date;  // Automatiquement mis à jour à chaque save()
```

**Utilisation pour First-Write-Wins :**

```typescript
// Côté mobile (WatermelonDB)
interface SyncableEntity {
  id: string;           // UUID v4 générés côté client
  tenantId: string;     // Obligatoire (R020)
  updatedAt: number;    // Timestamp Unix millisecondes (local first-write)
  version: number;      // Optionnel : incremental counter pour break-ties
  _status: 'pending' | 'synced' | 'conflict';
}

// Côté serveur (TypeORM)
@UpdateDateColumn({ type: 'timestamptz' })
updatedAt: Date;  // Date object, auto-update, milliseconde précision
```

**Comparaison lors du push :**

```typescript
// Backend sync/service.ts
async pushChanges(clientUpdate: SyncPushPayload, tenantId: string) {
  const serverVersion = await this.repo.findOne({
    where: { id: clientUpdate.id, tenantId }
  });

  if (!serverVersion) {
    // Créer (cas nouveau document)
    return this.repo.save(clientUpdate);
  }

  // FIRST-WRITE-WINS : comparer updatedAt
  const clientTime = new Date(clientUpdate.updatedAt).getTime();
  const serverTime = serverVersion.updatedAt.getTime();

  if (clientTime < serverTime) {
    // Client est plus vieux → son modif a été perdue
    // Retourner la version serveur actuelle + signaler conflit
    return {
      conflict: true,
      serverVersion: serverVersion,
      clientVersion: clientUpdate,
    };
  } else if (clientTime > serverTime) {
    // Client est plus récent → il gagne
    return this.repo.save({
      ...serverVersion,
      ...clientUpdate,
      updatedAt: new Date(), // Timestamp serveur
    });
  } else {
    // Même timestamp (cas très rare)
    // Tiebreaker : UUID binaire comparaison (déterministe)
    if (clientUpdate.id > serverVersion.id) {
      return this.repo.save({ ...clientUpdate, updatedAt: new Date() });
    } else {
      return { conflict: true, serverVersion };
    }
  }
}
```

### 2.3 Queue de sync côté mobile (Outbox Pattern)

**Outbox Pattern :** Les modifications locales sont écrites d'abord en DB locale, puis dans une "queue" distincte. Le sync poussera batch-iquement la queue vers le serveur.

```typescript
// src/mobile/db/outbox.model.ts
export interface OutboxRecord {
  id: string;           // UUID v4
  entityId: string;     // ID de l'entité (facture, BL, etc)
  entityType: 'SalesInvoice' | 'DeliveryNote' | 'Customer' | ...;
  operation: 'create' | 'update' | 'delete';
  payload: Record<string, any>; // Data complète
  createdAt: number;    // Timestamp local quand la queue entry a été créée
  attempt: number;      // Nombre de tentatives sync
  lastError: string;    // Dernier erreur (si sync échoué)
  status: 'pending' | 'syncing' | 'synced' | 'failed';
}

// WatermelonDB Model
import { Model, Q } from '@nozbe/watermelondb';

export class OutboxRecord extends Model {
  static table = 'outbox_records';
  
  @field('entityId') entityId: string;
  @field('entityType') entityType: string;
  @field('operation') operation: 'create' | 'update' | 'delete';
  @json('payload') payload: Record<string, any>;
  @field('createdAt') createdAt: number;
  @field('attempt') attempt: number;
  @field('lastError') lastError: string | null;
  @field('status') status: 'pending' | 'syncing' | 'synced' | 'failed';
  @readonly
  @field('createdAt') createdAt: number; // Auto-set on creation
  @readonly
  @field('updatedAt') updatedAt: number;
}
```

**Workflow outbox :**

```
1. User crée facture offline
   ├─ Écrire en WatermelonDB: SalesInvoice (id, items, tenantId, updatedAt)
   └─ Écrire en Outbox: { entityId: id, operation: 'create', payload: {...} }

2. Network devient disponible
   ├─ SyncService.pullChanges() → récupère deltas serveur
   └─ SyncService.pushChanges() → traite outbox en batch

3. Push changes
   ├─ Filtrer: WHERE status = 'pending' LIMIT 50
   ├─ POST /api/v1/sync/push { operations: [...] }
   └─ Si succès : UPDATE outbox SET status='synced', attempt=0
      Si conflit : UPDATE outbox SET status='failed', lastError='...'

4. Conflit détecté
   ├─ Marquer locale comme @conflict
   ├─ Notifier user: "Sync conflict: facture mise à jour par [user]"
   └─ Afficher dialog: [Voir serveur] [Refuser] [Forcer réécriture]
       ↓ (user click)
       ├─ Voir serveur: Afficher version serveur, user peut rejeter
       ├─ Refuser: Ignorer modif locale, accepter serveur
       └─ Forcer: Rejeter version serveur (créer nouveau conflit) → notifier serveur
```

### 2.4 Gestion des deltas : Full sync vs Delta sync

**Full Sync :** Télécharger *toutes* les données depuis `updatedAt=0`

**Delta Sync :** Télécharger uniquement les changements depuis `updatedAt=lastSync`

**Stratégie recommandée :**

```typescript
// src/mobile/services/sync.service.ts

interface SyncState {
  lastSyncAt: Record<string, number>;  // Par entité type
  // e.g. { 'SalesInvoice': 1719086400000, 'Customer': 1719090000000 }
  
  isSyncing: boolean;
  lastSyncError?: string;
}

export class SyncService {
  async pullChanges(tenantId: string) {
    const syncState = await this.getSyncState(tenantId);
    
    // Construire requête delta pour chaque entité
    const entities = [
      'SalesInvoice',
      'DeliveryNote',
      'Customer',
      'Partner',      // Supplier + Customer in one
      'FinishedProduct',
      'Payment',
    ];

    const deltas = {};
    for (const entity of entities) {
      const since = syncState.lastSyncAt[entity] || 0;
      deltas[entity] = await this.fetchDelta(tenantId, entity, since);
    }

    // Merge deltas en DB locale
    await this.mergeDeltas(deltas, tenantId);

    // Maj lastSyncAt
    await this.updateSyncState(tenantId, {
      lastSyncAt: {
        ...syncState.lastSyncAt,
        ...Object.fromEntries(
          entities.map(e => [e, Date.now()])
        )
      },
      isSyncing: false,
    });
  }

  async fetchDelta(tenantId: string, entityType: string, since: number) {
    // GET /api/v1/sync/pull?tenantId=...&entity=SalesInvoice&since=...
    const response = await axios.get(
      `/api/v1/sync/pull`,
      {
        params: {
          entity: entityType,
          since,      // Unix timestamp (ms)
          tenantId,
        },
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
        }
      }
    );
    return response.data.data;
  }
}
```

### 2.5 Structure des endpoints de sync backend

**Voir section 6 ci-dessous** pour les détails complets.

### 2.6 Gestion des entités supprimées (soft delete + sync)

**Pattern :**

```typescript
// Backend : Toutes les entités ont soft delete (R011)
@DeleteDateColumn({ type: 'timestamptz', nullable: true })
deletedAt: Date | null;

// Lors du pull, inclure les supprimés récents
GET /api/v1/sync/pull?entity=SalesInvoice&since=1719086400000

// Response inclut :
{
  "data": {
    "created": [...],
    "updated": [...],
    "deleted": [     // ← Important !
      { "id": "uuid-1", "deletedAt": "2024-06-24T10:00:00Z" },
      { "id": "uuid-2", "deletedAt": "2024-06-24T11:00:00Z" },
    ]
  }
}

// Mobile : appliquer les deletes en local
for (const deleted of response.deleted) {
  await db.batch(
    db.get('sales_invoices').prepareMarkAsDeleted(deleted.id)
  );
}
```

### 2.7 Gestion du tenantId (R020 — sécurité)

**Invariant R020 :** Le tenantId doit **toujours** être présent dans chaque query, jamais depuis l'URL/body falsifiable.

**Côté mobile :**

```typescript
// src/mobile/services/sync.service.ts

export class SyncService {
  private tenantId: string; // Extrait du JWT au login
  
  async pushChanges() {
    const outbox = await this.db
      .get('outbox_records')
      .query(Q.where('status', 'pending'))
      .fetch();

    // IMPORTANT : Tous les payloads incluent tenantId
    const operations = outbox.map(record => ({
      ...record,
      tenantId: this.tenantId,  // ← Injecté côté client
    }));

    return axios.post('/api/v1/sync/push', {
      operations,
      tenantId: this.tenantId,  // ← Double-check au serveur
    });
  }
}

// Côté backend : Valider tenantId depuis JWT
@Post('sync/push')
@UseGuards(JwtGuard)
async pushSync(
  @Body() payload: SyncPushDto,
  @CurrentUser() user: JwtPayload,  // tenantId du JWT
) {
  // R020 : Rejeter si payload.tenantId !== user.tenantId
  if (payload.tenantId !== user.tenantId) {
    throw new ForbiddenException('tenantId mismatch');
  }
  
  // Traiter sync
  return this.syncService.processOperations(
    payload.operations,
    user.tenantId
  );
}
```

---

## 3. Entités à synchroniser

### 3.1 Matrice sync : read-only vs read-write

| Entité | Offline | Read-only? | Critique? | Volumineuse? | Phase |
|--------|---------|-----------|-----------|--------------|-------|
| **SalesInvoice** | ✅ | Non | ✅✅ Critique | Petite | 2 |
| **SalesInvoiceItem** | ✅ | Non | ✅✅ Critique | Petite | 2 |
| **DeliveryNote** | ✅ | Non | ✅✅ Critique | Petite | 2 |
| **DeliveryNoteItem** | ✅ | Non | ✅✅ Critique | Petite | 2 |
| **Quote** | ✅ | Non | ✅ Important | Petite | 3 |
| **QuoteItem** | ✅ | Non | ✅ Important | Petite | 3 |
| **Partner** (Customer/Supplier) | ✅ | Non | ✅✅ Critique | Petite | 2 |
| **FinishedProduct** | ✅ | Oui (readonly) | ✅ Important | Petite-Moy | 2 |
| **RawMaterial** | ✅ | Oui (readonly) | ⚠️ Achat interne | Petite | 4 |
| **StockEntry** | ❌ | Oui (readonly) | ❌ Trop complexe | Grande | - |
| **Payment** | ✅ | Non | ✅✅ Critique | Petite | 2 |
| **Expense** | ✅ | Non | ⚠️ Optionnel | Petite | 4 |
| **InventorySummary** | ❌ | Oui (readonly) | ❌ Volatile | N/A | - |
| **User** | ❌ | Oui (readonly) | ⚠️ Équipe | Petite | - |
| **Tenant** | ❌ | Oui (readonly) | ⚠️ Config | Très petite | - |
| **Setting** | ✅ | Oui (readonly) | ⚠️ Config | Très petite | 2 |
| **PurchaseOrder** | ❌ | Oui (readonly) | ❌ Interne | Petite | - |
| **ReceptionBL** | ❌ | Oui (readonly) | ❌ Achat interne | Petite | - |

### 3.2 Entités critiques (Phase 2)

**Doivent être syncées en priorité** (cas d'usage offline core) :

```typescript
// PHASE 2 : Création de factures offline

// 1. SalesInvoice (lecture + création)
{
  id: "uuid-1",
  tenantId: "tenant-1",
  invoiceNumber: "FAC-24-001",    // Généré offline en UUID
  customerId: "uuid-customer",
  invoiceDate: Date,
  dueDate: Date,
  status: "draft",
  subtotal: 1000.00,
  taxAmount: 190.00,
  totalAmount: 1190.00,
  amountPaid: 0,
  amountDue: 1190.00,
  notes: "...",
  createdBy: "user-1",
  updatedBy: "user-1",
  createdAt: Date,
  updatedAt: Date,
  deletedAt: null,
}

// 2. SalesInvoiceItem (lecture + création)
{
  id: "uuid-2",
  tenantId: "tenant-1",
  salesInvoiceId: "uuid-1",
  finishedProductId: "uuid-product",
  quantity: 5,
  unit: "kg",
  unitPrice: 200.00,
  taxName1: "TVA",
  taxRate1: 19.0,
  taxAmount1: 190.00,
  lineTaxTotal: 190.00,
  lineTotal: 1190.00,
  createdAt: Date,
  updatedAt: Date,
}

// 3. Partner/Customer (lecture + création + mise à jour)
{
  id: "uuid-customer",
  tenantId: "tenant-1",
  isCustomer: true,
  isSupplier: false,
  name: "Client ABC",
  contactPerson: "Ahmed",
  email: "ahmed@abc.dz",
  phone: "+213 555 111111",
  nif: "123456789",
  address: "...",
  isActive: true,
  createdAt: Date,
  updatedAt: Date,
  deletedAt: null,
}

// 4. FinishedProduct (lecture seule)
{
  id: "uuid-product",
  tenantId: "tenant-1",
  type: "product",
  name: "Produit X",
  code: "PX-001",
  unit: "kg",
  defaultSalesPrice: 200.00,
  stockQuantity: 100.00,
  averageCostPerUnit: 150.00,
  isActive: true,
  createdAt: Date,
  updatedAt: Date,
  deletedAt: null,
}

// 5. Payment (lecture + création)
{
  id: "uuid-payment",
  tenantId: "tenant-1",
  salesInvoiceId: "uuid-1",
  amount: 1190.00,
  paymentDate: Date,
  paymentMethod: "cash",
  status: "recorded",
  createdBy: "user-1",
  updatedBy: "user-1",
  createdAt: Date,
  updatedAt: Date,
  deletedAt: null,
}
```

### 3.3 Entités trop volumineuses (exclure de sync)

**StockEntry :** Peut atteindre des millions de lignes (historique FIFO). Surtout utile en backend pour calculs.

**Solution :** Envoyer uniquement les **summaires** via `InventorySummary`:

```typescript
// Mobile ne sync que les sommaires
{
  id: "uuid-summary",
  tenantId: "tenant-1",
  finishedProductId: "uuid-product",
  totalQuantity: 100.00,
  totalValue: 15000.00,
  reservedQuantity: 20.00,
  earliestExpiration: Date,
  updatedAt: Date,
}

// Les details FIFO restent backend-only
// Mobile affiche : "Stock actuel: 100 kg (voir détails)"
```

### 3.4 Audit logs

**Exclure de sync.** Les logs doivent rester **backend-only** pour intégrité audit (R012).

Mobile ne peut pas envoyer d'audit logs (stateless, pas de confiance).

---

## 4. Gestion des conflits "First Write Wins"

### 4.1 Algorithme exact : comparaison updatedAt server vs client

```typescript
// src/sync/sync.service.ts (Backend)

interface SyncConflictResult {
  resolved: boolean;
  action: 'accept' | 'reject' | 'merge';
  serverVersion: any;
  clientVersion: any;
  reason?: string;
}

async resolveConflict(
  entityType: string,
  clientUpdate: any,      // { id, tenantId, updatedAt, ...payload }
  tenantId: string
): Promise<SyncConflictResult> {
  // 1. Fetch server version
  const repo = this.dataSource.getRepository(this.getEntity(entityType));
  const serverVersion = await repo.findOne({
    where: { id: clientUpdate.id, tenantId },
  });

  if (!serverVersion) {
    // Nouveau record → accepter
    return {
      resolved: true,
      action: 'accept',
      clientVersion: clientUpdate,
    };
  }

  // 2. Compare timestamps
  const clientTime = new Date(clientUpdate.updatedAt).getTime();
  const serverTime = serverVersion.updatedAt.getTime();

  if (clientTime < serverTime) {
    // Client est plus vieux → REJECT
    return {
      resolved: true,
      action: 'reject',
      serverVersion,
      reason: `Client version outdated (${new Date(clientTime).toISOString()} < ${serverVersion.updatedAt.toISOString()})`,
    };
  }

  if (clientTime > serverTime) {
    // Client est plus récent → ACCEPT
    return {
      resolved: true,
      action: 'accept',
      clientVersion: clientUpdate,
    };
  }

  // 3. Même timestamp → UUID tiebreaker (déterministe)
  if (clientUpdate.id > serverVersion.id) {
    return {
      resolved: true,
      action: 'accept',
      clientVersion: clientUpdate,
    };
  } else {
    return {
      resolved: true,
      action: 'reject',
      serverVersion,
      reason: 'UUID tiebreaker: server version wins',
    };
  }
}

// Workflow push
async processPushOperation(
  operation: SyncOperation,
  tenantId: string
): Promise<SyncOperationResult> {
  const { id, entityType, operation: op, payload } = operation;

  try {
    const conflict = await this.resolveConflict(
      entityType,
      { id, ...payload, updatedAt: new Date().toISOString() },
      tenantId
    );

    if (!conflict.resolved || conflict.action === 'reject') {
      // Signal conflit à mobile
      return {
        success: false,
        status: 'conflict',
        error: conflict.reason,
        serverVersion: conflict.serverVersion,
      };
    }

    // Accepter et sauvegarder
    const repo = this.dataSource.getRepository(this.getEntity(entityType));
    const saved = await repo.save({
      ...conflict.clientVersion,
      tenantId,
      updatedAt: new Date(),
    });

    return {
      success: true,
      status: 'synced',
      data: saved,
    };
  } catch (error) {
    return {
      success: false,
      status: 'error',
      error: error.message,
    };
  }
}
```

### 4.2 Que faire quand client envoie une modif plus ancienne?

**Réponse serveur (409 Conflict) :**

```json
{
  "statusCode": 409,
  "message": "Sync conflict: your version is outdated",
  "data": {
    "status": "conflict",
    "action": "reject",
    "serverVersion": {
      "id": "invoice-1",
      "invoiceNumber": "FAC-24-001",
      "status": "sent",
      "updatedAt": "2024-06-24T14:05:00Z",
      "updatedBy": "manager@company.dz"
    },
    "clientVersion": {
      "id": "invoice-1",
      "status": "draft",
      "updatedAt": "2024-06-24T14:00:00Z"  // ← Plus vieux
    },
    "reason": "Client timestamp (14:00) < Server timestamp (14:05)"
  }
}
```

**Mobile UI :**

```typescript
// src/mobile/components/SyncConflictDialog.tsx

export const SyncConflictDialog = ({ conflict, onResolve }) => (
  <Dialog open={!!conflict}>
    <DialogHeader>
      <DialogTitle>Conflit de synchronisation</DialogTitle>
    </DialogHeader>

    <DialogContent>
      <Alert type="error">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Votre modification a été écrasée</AlertTitle>
        <AlertDescription>
          Quelqu'un d'autre a modifié ce document. 
          <br />
          Votre version: {formatDate(conflict.clientVersion.updatedAt)}
          <br />
          Version serveur: {formatDate(conflict.serverVersion.updatedAt)}
          <br />
          Modifié par: {conflict.serverVersion.updatedBy}
        </AlertDescription>
      </Alert>

      <Tabs defaultValue="server">
        <TabsList>
          <TabsTrigger value="server">Version serveur</TabsTrigger>
          <TabsTrigger value="yours">Votre version</TabsTrigger>
        </TabsList>

        <TabsContent value="server">
          {/* Afficher version serveur */}
          <InvoicePreview invoice={conflict.serverVersion} readOnly />
        </TabsContent>

        <TabsContent value="yours">
          {/* Afficher votre version */}
          <InvoicePreview invoice={conflict.clientVersion} readOnly />
        </TabsContent>
      </Tabs>
    </DialogContent>

    <DialogFooter>
      <Button
        onClick={() => onResolve('reject')}
        variant="default"
      >
        Accepter la version serveur
      </Button>
      <Button
        onClick={() => onResolve('force')}
        variant="outline"
      >
        Forcer ma version (créera un nouveau conflit)
      </Button>
    </DialogFooter>
  </Dialog>
);
```

### 4.3 Cas particulier : création offline (UUIDs v4 générés côté client)

**Workflow :**

```typescript
// Mobile crée facture offline
1. User tap "Créer facture"
2. Générer : id = uuidv4()  // e.g., "550e8400-e29b-41d4-a716-446655440000"
3. Écrire en DB locale: SalesInvoice { id, tenantId, invoiceNumber, ... }
4. Écrire en Outbox: { entityId: id, operation: 'create', payload: {...} }

// Network OK → Sync lance push
5. POST /api/v1/sync/push
   { 
     operations: [{
       id: "550e8400-e29b-41d4-a716-446655440000",
       entityType: "SalesInvoice",
       operation: "create",
       payload: { invoiceNumber: "FAC-24-001", ... }
     }]
   }

// Serveur : le UUID existe?
6. Backend query: SELECT * FROM sales_invoices WHERE id = "550e8400..." AND tenantId = "..."
   → Pas trouvé → INSERT (new record)

// Conflit serveur "invoiceNumber déjà utilisé"?
7. Si deux appareils créent avec le même invoiceNumber offline:
   Device A: FAC-24-001 (id=uuid-a, createdAt=14:00)
   Device B: FAC-24-001 (id=uuid-b, createdAt=14:01)
   
   Backend: Premier arrivé sur le serveur gagne
   → Device A: INSERT succès
   → Device B: Conflit UNIQUE(invoiceNumber, tenantId) → Return 409
   → Mobile: Regenerate invoiceNumber (ask renumbering logic)
```

**Important :** Invoices numérotées **côté serveur uniquement** en prod, pas côté mobile.

Mobile peut générer des placeholders (e.g., "Facture (à numéroter)"), puis une fois synced, serveur attribue le vrai numéro.

---

## 5. Sécurité et authentification offline

### 5.1 Stockage sécurisé du JWT sur mobile

**Trois niveaux de sécurité :**

```typescript
// Niveau 1: Access Token (1h) — Stockage chiffré
import * as SecureStore from 'expo-secure-store';

export const TokenStorage = {
  saveAccessToken: async (token: string) => {
    await SecureStore.setItemAsync('access_token', token, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  },

  getAccessToken: async (): Promise<string | null> => {
    try {
      return await SecureStore.getItemAsync('access_token');
    } catch (error) {
      return null;
    }
  },

  clearAccessToken: async () => {
    await SecureStore.deleteItemAsync('access_token');
  },
};

// Niveau 2: Refresh Token (7 jours) — Stockage très sécurisé (Keychain/Enclave)
export const refreshTokenStorage = {
  save: async (token: string) => {
    // iOS: Keychain, Android: EncryptedSharedPreferences
    await SecureStore.setItemAsync('refresh_token', token, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  },

  get: async () => {
    return SecureStore.getItemAsync('refresh_token');
  },

  clear: async () => {
    return SecureStore.deleteItemAsync('refresh_token');
  },
};

// Niveau 3: State mobile (Zustand + memory) — JAMAIS sur disk
export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,        // ← Jamais persisté
  refreshToken: null,       // ← Jamais persisté
  user: null,
  
  // Initialiser au démarrage
  hydrate: async () => {
    const token = await TokenStorage.getAccessToken();
    const refresh = await refreshTokenStorage.get();
    if (token && refresh) {
      set({ accessToken: token, refreshToken: refresh });
    }
  },
  
  logout: async () => {
    await TokenStorage.clearAccessToken();
    await refreshTokenStorage.clear();
    set({ accessToken: null, refreshToken: null, user: null });
  },
}));
```

### 5.2 Expiration de l'access token en offline prolongé

**Scenario :**

```
1. User login à 10:00 → accessToken expires à 11:00
2. User devient offline à 10:45
3. User continue à créer factures offline jusqu'à 11:30
4. Network revient à 11:45
5. Sync essaie de push → accessToken expiré (13h30 - 1h = 12h30)
```

**Solution :**

```typescript
// src/mobile/services/sync.service.ts

export class SyncService {
  private tokenExpireTime: number = 0; // En ms

  async performSync() {
    // Vérifier si token expiré
    if (Date.now() > this.tokenExpireTime) {
      // Token expiré → refresh avant de syncer
      try {
        await this.refreshAccessToken();
      } catch (error) {
        // Refresh échoué (offline) → Ne pas syncer encore
        this.logger.warn('Cannot refresh token (offline), postponing sync');
        return {
          success: false,
          reason: 'token_expired_and_offline',
          retryAt: this.tokenExpireTime + 60000, // Retry après expiry
        };
      }
    }

    // Maintenant token est valide → procéder sync
    return this.pushAndPullChanges();
  }

  private async refreshAccessToken() {
    try {
      const refreshToken = await refreshTokenStorage.get();
      if (!refreshToken) throw new Error('No refresh token');

      const response = await axios.post('/api/v1/auth/refresh', {
        refreshToken,
      });

      const { accessToken, expiresIn } = response.data.data;
      await TokenStorage.saveAccessToken(accessToken);
      this.tokenExpireTime = Date.now() + expiresIn * 1000;

      return accessToken;
    } catch (error) {
      this.logger.error('Refresh token failed', error);
      throw new UnauthorizedException('Cannot refresh token');
    }
  }
}
```

### 5.3 Refresh token sans connexion réseau

**Impossible. Refresh token nécessite un appel serveur.**

**Stratégie :**

```typescript
// Si refresh échoue (offline), afficher UI :

UI_OfflineTokenExpired = () => (
  <Alert type="warning">
    <AlertCircle className="h-4 w-4" />
    <AlertTitle>Votre session a expiré</AlertTitle>
    <AlertDescription>
      Vous êtes offline. Reconnectez-vous quand le réseau revient.
      <br />
      En attendant, vous pouvez:
      <ul>
        <li>✅ Visualiser les factures en cache</li>
        <li>✅ Créer des factures (elles seront syncées après reconnexion)</li>
        <li>❌ Accéder aux nouvelles données serveur</li>
      </ul>
    </AlertDescription>
  </Alert>
);

// En background, tentar refresh automatiquement dès que réseau revient
Network.onStateChange((state) => {
  if (state.isConnected) {
    SyncService.attemptRefreshAndSync();
  }
});
```

---

## 6. API de synchronisation backend

### 6.1 Endpoint Pull — GET /api/v1/sync/pull

Retourner les changements depuis un timestamp spécifique.

**Request :**

```http
GET /api/v1/sync/pull?entity=SalesInvoice&since=1719086400000&limit=100 HTTP/1.1
Authorization: Bearer <access_token>
```

| Parameter | Type | Requis? | Description |
|-----------|------|--------|------------|
| `entity` | string | ✅ | Type d'entité (`SalesInvoice`, `DeliveryNote`, etc.) |
| `since` | number | ✅ | Unix timestamp en ms depuis quand on veut les changements |
| `limit` | number | ⚠️ | Nombre max de records (défaut 1000, max 10000) |
| `tenantId` | string | ✅ | Tenant ID (depuis JWT) |

**Response 200:**

```json
{
  "data": {
    "created": [
      {
        "id": "550e8400-e29b-41d4-a716-446655440001",
        "tenantId": "tenant-uuid",
        "invoiceNumber": "FAC-24-001",
        "customerId": "customer-uuid",
        "status": "draft",
        "subtotal": "1000.00",
        "taxAmount": "190.00",
        "totalAmount": "1190.00",
        "amountPaid": "0.00",
        "amountDue": "1190.00",
        "createdAt": "2024-06-24T14:00:00.000Z",
        "updatedAt": "2024-06-24T14:00:00.000Z",
        "deletedAt": null
      }
    ],
    "updated": [
      {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "invoiceNumber": "FAC-24-001",
        "status": "sent",  // ← Changed
        "updatedAt": "2024-06-24T14:05:00.000Z",  // ← New timestamp
        "updatedBy": "manager@company.dz"
      }
    ],
    "deleted": [
      {
        "id": "550e8400-e29b-41d4-a716-446655440099",
        "deletedAt": "2024-06-24T14:10:00.000Z"
      }
    ],
    "hasMore": false  // ← Pagination: plus de records?
  }
}
```

**Backend Implementation :**

```typescript
// src/sync/sync.controller.ts
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtGuard } from '@common/guards/jwt.guard';
import { CurrentUser } from '@common/decorators/current-user.decorator';

@Controller('api/v1/sync')
@UseGuards(JwtGuard)
export class SyncController {
  @Get('pull')
  async pull(
    @Query('entity') entity: string,
    @Query('since') since: string,
    @Query('limit') limit: string = '1000',
    @CurrentUser() user: JwtPayload,
  ) {
    const sinceMs = parseInt(since);
    const limitNum = Math.min(parseInt(limit), 10000);

    const result = await this.syncService.pullChanges(
      user.tenantId,
      entity,
      sinceMs,
      limitNum
    );

    return {
      data: result,
    };
  }
}

// src/sync/sync.service.ts
export class SyncService {
  async pullChanges(
    tenantId: string,
    entityType: string,
    sinceMs: number,
    limit: number
  ) {
    const sinceDate = new Date(sinceMs);
    const repo = this.dataSource.getRepository(
      this.getEntity(entityType)
    );

    // Query: created après since
    const created = await repo
      .createQueryBuilder('e')
      .where('e.tenantId = :tenantId', { tenantId })
      .andWhere('e.createdAt > :since', { since: sinceDate })
      .andWhere('e.deletedAt IS NULL')
      .orderBy('e.createdAt', 'ASC')
      .limit(limit)
      .getMany();

    // Query: updated après since (mais not créé après since)
    const updated = await repo
      .createQueryBuilder('e')
      .where('e.tenantId = :tenantId', { tenantId })
      .andWhere('e.updatedAt > :since', { since: sinceDate })
      .andWhere('e.createdAt <= :since', { since: sinceDate })
      .andWhere('e.deletedAt IS NULL')
      .orderBy('e.updatedAt', 'ASC')
      .limit(limit)
      .getMany();

    // Query: deleted après since
    const deleted = await repo
      .createQueryBuilder('e')
      .where('e.tenantId = :tenantId', { tenantId })
      .andWhere('e.deletedAt > :since', { since: sinceDate })
      .orderBy('e.deletedAt', 'ASC')
      .limit(limit)
      .select(['e.id', 'e.deletedAt'])
      .getMany();

    return {
      created,
      updated,
      deleted,
      hasMore: created.length === limit || 
               updated.length === limit || 
               deleted.length === limit,
    };
  }
}
```

### 6.2 Endpoint Push — POST /api/v1/sync/push

Envoyer un batch d'opérations CRUD pour traiter.

**Request :**

```json
POST /api/v1/sync/push
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "operations": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440001",
      "entityType": "SalesInvoice",
      "operation": "create",
      "payload": {
        "tenantId": "tenant-uuid",
        "invoiceNumber": "FAC-24-001",
        "customerId": "customer-uuid",
        "invoiceDate": "2024-06-24",
        "status": "draft",
        "subtotal": "1000.00",
        "taxAmount": "190.00",
        "totalAmount": "1190.00",
        "amountPaid": "0.00",
        "amountDue": "1190.00",
        "createdBy": "agent@company.dz",
        "updatedAt": "2024-06-24T14:00:00.000Z"
      }
    },
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "entityType": "SalesInvoice",
      "operation": "update",
      "payload": {
        "tenantId": "tenant-uuid",
        "status": "sent",
        "updatedAt": "2024-06-24T14:05:00.000Z"
      }
    },
    {
      "id": "550e8400-e29b-41d4-a716-446655440099",
      "entityType": "SalesInvoice",
      "operation": "delete",
      "payload": {
        "tenantId": "tenant-uuid"
      }
    }
  ]
}
```

**Response 200 — Mixed results :**

```json
{
  "data": {
    "successful": [
      {
        "id": "550e8400-e29b-41d4-a716-446655440001",
        "entityType": "SalesInvoice",
        "operation": "create",
        "status": "synced",
        "result": {
          "id": "550e8400-e29b-41d4-a716-446655440001",
          "invoiceNumber": "FAC-24-001",
          "updatedAt": "2024-06-24T14:00:00.000Z"
        }
      }
    ],
    "conflicts": [
      {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "entityType": "SalesInvoice",
        "operation": "update",
        "status": "conflict",
        "reason": "Client version outdated",
        "serverVersion": {
          "id": "550e8400-e29b-41d4-a716-446655440000",
          "status": "sent",
          "updatedAt": "2024-06-24T14:05:00.000Z",
          "updatedBy": "manager@company.dz"
        }
      }
    ],
    "errors": [
      {
        "id": "550e8400-e29b-41d4-a716-446655440099",
        "entityType": "SalesInvoice",
        "operation": "delete",
        "status": "error",
        "error": "SalesInvoice not found"
      }
    ]
  }
}
```

**Backend Implementation :**

```typescript
// src/sync/sync.controller.ts
@Post('push')
@UseGuards(JwtGuard)
async push(
  @Body() dto: SyncPushDto,
  @CurrentUser() user: JwtPayload,
) {
  // R020 : Valider tenantId
  if (dto.operations.some(op => op.payload?.tenantId !== user.tenantId)) {
    throw new ForbiddenException('tenantId mismatch');
  }

  const result = await this.syncService.processOperations(
    dto.operations,
    user.tenantId,
    user.id
  );

  return { data: result };
}

// src/sync/sync.service.ts
async processOperations(
  operations: SyncOperation[],
  tenantId: string,
  userId: string,
) {
  const successful: any[] = [];
  const conflicts: any[] = [];
  const errors: any[] = [];

  for (const op of operations) {
    try {
      // R005: Transaction pour opérations multi-tables
      const queryRunner = this.dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();

      try {
        let result;

        if (op.operation === 'create') {
          result = await this.createEntity(
            op.entityType,
            op.payload,
            tenantId,
            userId,
            queryRunner
          );
        } else if (op.operation === 'update') {
          result = await this.updateEntity(
            op.entityType,
            op.id,
            op.payload,
            tenantId,
            userId,
            queryRunner
          );
        } else if (op.operation === 'delete') {
          result = await this.deleteEntity(
            op.entityType,
            op.id,
            tenantId,
            queryRunner
          );
        }

        if (result.conflict) {
          conflicts.push(result);
        } else {
          successful.push({
            id: op.id,
            entityType: op.entityType,
            operation: op.operation,
            status: 'synced',
            result: result,
          });
        }

        await queryRunner.commitTransaction();
      } catch (error) {
        await queryRunner.rollbackTransaction();
        throw error;
      } finally {
        await queryRunner.release();
      }
    } catch (error) {
      errors.push({
        id: op.id,
        entityType: op.entityType,
        operation: op.operation,
        status: 'error',
        error: error.message,
      });
    }
  }

  return { successful, conflicts, errors };
}
```

### 6.3 Rate limiting et taille max des batches

**Restrictions pour éviter abuse :**

```typescript
// src/sync/sync.controller.ts
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';

@Controller('api/v1/sync')
@UseGuards(ThrottlerGuard)
export class SyncController {
  // Pull: 100 req/h par user
  @Get('pull')
  @Throttle({ default: { limit: 100, ttl: 60000 * 60 } })
  async pull(...) { }

  // Push: 50 req/h par user (plus coûteux)
  @Post('push')
  @Throttle({ default: { limit: 50, ttl: 60000 * 60 } })
  async push(
    @Body(new ValidationPipe()) dto: SyncPushDto,
    ...
  ) { }
}

// DTOs avec validation
export class SyncPushDto {
  @IsArray()
  @ArrayMaxSize(100)  // Max 100 opérations par batch
  @ValidateNested()
  @Type(() => SyncOperationDto)
  operations: SyncOperationDto[];
}

export class SyncOperationDto {
  @IsUUID()
  id: string;

  @IsEnum(['SalesInvoice', 'DeliveryNote', 'Customer', ...])
  entityType: string;

  @IsEnum(['create', 'update', 'delete'])
  operation: 'create' | 'update' | 'delete';

  @IsObject()
  @MaxSize(10000)  // Max 10KB par payload
  payload: Record<string, any>;
}
```

---

## 7. Impact sur le backend existant

### 7.1 Colonnes nécessaires

**Vérifier que TOUTES les entités ont :**

```typescript
@CreateDateColumn({ type: 'timestamptz' })
createdAt: Date;  // ✅ Existing

@UpdateDateColumn({ type: 'timestamptz' })
updatedAt: Date;  // ✅ Existing

@DeleteDateColumn({ type: 'timestamptz', nullable: true })
deletedAt: Date | null;  // ✅ Existing
```

**Pas de changement requis.** Ces colonnes sont déjà présentes sur toutes les entités.

### 7.2 Nouveau module : `src/sync/`

```
src/sync/
├─ sync.module.ts
├─ sync.controller.ts
├─ sync.service.ts
├─ dto/
│  ├─ sync-push.dto.ts
│  ├─ sync-pull.dto.ts
│  └─ sync-operation.dto.ts
├─ entities/
│  └─ sync-state.entity.ts (optionnel, pour tracking)
└─ strategies/
   └─ conflict-resolver.ts
```

### 7.3 Registrer le module

```typescript
// src/app.module.ts
import { SyncModule } from './sync/sync.module';

@Module({
  imports: [
    // ... autres modules
    SyncModule,  // ← Ajouter
  ],
})
export class AppModule {}
```

### 7.4 Index base de données

Vérifier que les index suivants existent (pour perf sync) :

```sql
-- Toutes les entités
CREATE INDEX IF NOT EXISTS "IDX_entity_tenant_id" ON "entity_table" ("tenantId");
CREATE INDEX IF NOT EXISTS "IDX_entity_created_at" ON "entity_table" ("createdAt");
CREATE INDEX IF NOT EXISTS "IDX_entity_updated_at" ON "entity_table" ("updatedAt");
CREATE INDEX IF NOT EXISTS "IDX_entity_deleted_at" ON "entity_table" ("deletedAt");
CREATE INDEX IF NOT EXISTS "IDX_entity_tenant_updated" ON "entity_table" ("tenantId", "updatedAt");
```

Ces index sont déjà présents sur les entités majeures (R016).

### 7.5 Impact sur les invariants

| Invariant | Impact | Mitigation |
|-----------|--------|-----------|
| **R001** — Types TypeORM explicites | Aucun impact | ✅ N/A |
| **R002** — Migrations obligatoires | Aucun impact (pas nouvelle colonne) | ✅ N/A |
| **R005** — Transactions multi-tables | **CRITIQUE** | ✅ Sync push enveloppe dans queryRunner + transaction |
| **R008** — Calculs financiers backend | **IMPACT** | ⚠️ Mobile calcule TVA localement (offline), backend re-valide |
| **R013** — Auto-numérotation avec lock | **IMPACT** | ⚠️ UUID offline, server attribue vrai numéro après sync |
| **R020** — tenantId obligatoire | **CRITIQUE** | ✅ Sync valide tenantId du JWT vs payload |

### 7.6 Migration (vide — aucune nouvelle colonne)

**Pas de migration requise.** Les timestamps existent déjà.

---

## 8. Fonctionnalités offline vs online-only

### 8.1 Offline possible

```
✅ Créer facture
  ├─ Générer UUID
  ├─ Calculer TVA locale (19%)
  ├─ Sauvegarder en DB locale
  └─ Queue sync (push au serveur une fois online)

✅ Consulter factures locales
  ├─ Lire depuis DB WatermelonDB
  ├─ Filtrer, trier localement
  └─ Pas de requête serveur

✅ Créer bon de livraison
  └─ Même pattern que facture

✅ Consulter clients
  ├─ Lire depuis DB locale (syncée au dernier pull)
  └─ Pas de créer nouveau client offline (conflit numérotation)

✅ Consulter produits
  ├─ Lire liste cached
  └─ Pas de créer produit offline (stock management côté serveur)

✅ Créer paiement
  ├─ Enregistrer paiement local
  ├─ Maj montants facture local
  └─ Push au serveur (impact stock)

✅ Consulter historique
  ├─ Toutes les factures syncées
  ├─ Recherche locale rapide
  └─ Zéro latence réseau
```

### 8.2 Online only

```
❌ Envoyer email PDF facture
  ├─ Nécessite accès SMTP serveur
  ├─ Génération PDF côté serveur
  └─ Error: "Offline — envoyer depuis le web"

❌ Générer rapport détaillé
  ├─ Requête complexe base de données
  ├─ Agrégations (SUM, COUNT)
  └─ Data trop volumineuse (1000+ factures)

❌ Envoyer BL par email/SMS
  └─ Même que facture

❌ Consulter les paiements d'autres utilisateurs
  ├─ Donnesées cross-user
  ├─ Sync ne synchronise que l'user actuel
  └─ Error: "Offline — reconnectez-vous"

❌ Configurer settings tenant
  ├─ TVA, formats numérotation
  └─ Changes affectent tous les users → sync backend-only

❌ Gestion des utilisateurs
  ├─ Inviter, supprimer users
  └─ Impact multi-user
```

### 8.3 UI Indicators

```typescript
// src/mobile/components/SyncStatus.tsx

export const SyncStatus = () => {
  const { connectionState, syncState } = useSyncStore();

  return (
    <div className="p-2 text-sm">
      {connectionState === 'offline' && (
        <Alert type="warning">
          <WifiOff className="h-4 w-4" />
          Vous êtes hors ligne
          <br />
          <small>Les modifications seront syncées au prochain accès réseau</small>
        </Alert>
      )}

      {connectionState === 'online' && syncState.isSyncing && (
        <Alert type="info">
          <Loader className="h-4 w-4 animate-spin" />
          Synchronisation en cours...
        </Alert>
      )}

      {syncState.lastSyncError && (
        <Alert type="error">
          <AlertCircle className="h-4 w-4" />
          Erreur sync: {syncState.lastSyncError}
          <br />
          <Button
            variant="outline"
            size="sm"
            onClick={() => SyncService.retrySync()}
          >
            Réessayer
          </Button>
        </Alert>
      )}
    </div>
  );
};
```

---

## 9. Plan d'implémentation par phases

### Phase 1 (Semaines 1-3) : Infrastructure sync

**Objectif :** Poser la fondation de la synchronisation backend + mobile DB locale.

**Tâches backend :**

1. Créer module `src/sync/`
   - sync.controller.ts (GET /pull, POST /push)
   - sync.service.ts (logic push/pull/resolve)
   - conflict-resolver.ts (FWW algorithm)
   - DTOs + validation

2. Implémenter GET /api/v1/sync/pull
   - Query deltas depuis timestamp
   - Paginer large (1000 records/batch)
   - Test: Vérifier indexes performance

3. Implémenter POST /api/v1/sync/push
   - Valider tenantId (R020)
   - Résoudre conflits (FWW)
   - Transaction (R005)
   - Rate limiting (throttler)

4. Tests (Jest)
   - Test conflict resolution (client plus vieux)
   - Test tenantId validation
   - Test transaction rollback sur erreur
   - Perf test: 10000 records/sec

**Tâches mobile :**

1. Setup React Native/Expo + Capacitor
   - Vite config pour mobile
   - Capacitor iOS/Android config

2. Setup WatermelonDB
   - Schema pour SalesInvoice (Phase 2 entities)
   - Migrations
   - Tests db read/write

3. Setup Zustand stores
   - SyncStore (queue, state, timestamps)
   - AuthStore (JWT storage, tenantId)
   - ConnectionStore (network state)

4. API de sync côté mobile
   - SyncService.pull() (axios GET)
   - SyncService.push() (axios POST)
   - Retry logic (exponential backoff)

**Deliverables :**
- GET /pull, POST /push opérateurs
- Tests backend 100% coverage
- Mobile peut faire pull/push (vide)
- Documentation API (Swagger)

---

### Phase 2 (Semaines 4-6) : Entités critiques

**Objectif :** Synchroniser les entités core pour cas d'usage offline (créer facture).

**Entities to sync :**
- SalesInvoice + SalesInvoiceItem
- DeliveryNote + DeliveryNoteItem
- Partner (Customer/Supplier)
- FinishedProduct
- Payment
- User (read-only)
- Tenant config (read-only)
- Setting (read-only, TVA)

**Tâches :**

1. Backend : Adapter sync.service.ts pour ces entités
   - Générer repo dynamique par entityType
   - Valider contraintes unique (e.g., invoiceNumber per tenant)
   - Soft delete handling

2. Mobile : Schema WatermelonDB pour entities
   ```typescript
   export class SalesInvoiceModel extends Model {
     static table = 'sales_invoices';
     @field('tenantId') tenantId: string;
     @field('invoiceNumber') invoiceNumber: string;
     @json('items') items: SalesInvoiceItem[];
     @field('updatedAt') updatedAt: number;
     // ...
   }
   ```

3. Mobile : Outbox pattern
   - OutboxRecord model
   - Write operations to outbox on create/update/delete
   - Pull → merge deltas
   - Push → flush outbox

4. Mobile : UX
   - Invoice list page (read from WatermelonDB)
   - Create invoice page
   - Sync status indicator
   - Conflict dialog (FWW)

5. Tests
   - Backend: Conflict resolution (multiple scenarios)
   - Mobile: Outbox flush (success, conflict, error)
   - E2E: Create invoice offline → push → verify server

**Deliverables :**
- Full CRUD offline sur invoices
- Conflict resolution working
- E2E test: offline flow
- Mobile app compilable iOS/Android (Xcode/Android Studio)

---

### Phase 3 (Semaines 7-8) : Entités secondaires

**Entities :**
- Quote + QuoteItem
- Expense
- CreditNote
- PurchaseOrder (read-only)
- ReceptionBL (read-only)
- RawMaterial (read-only)

**Tâches :**
- Étendre sync.service.ts support ces entités
- Ajouter à WatermelonDB schema
- Mobile UI (list, create)
- Tests

---

### Phase 4 (Semaines 9+) : UX & Optimization

**Tâches :**
- Performance optimization (index, pagination)
- Offline indicators + UX polish
- Conflict resolution UX enhancements
- Audit logging (mobile → server)
- Analytics: sync success rate, conflict frequency

---

## SUMMARY — Décisions clés

| Décision | Choix | Justification |
|----------|-------|--------------|
| **Framework mobile** | PWA + Capacitor (Phase 1) → RN bare (Phase 2) | Réutiliser React, déploiement rapide |
| **DB locale** | WatermelonDB | Sync-ready, perf, compact |
| **Stratégie conflits** | First-Write-Wins (FWW) | Déterministe, pas de UI complexity |
| **Authen offline** | JWT + expo-secure-store | Standard, sécurisé, offline capable |
| **Entities sync** | Sélection (invoices, partners, products) | Balance offline-utility vs volume |
| **UUIDs générés** | Client (offline) + serveur (numérotation) | Offline independence + audit trail |
| **Architecture sync** | Pull deltas + Push outbox | Standard pattern, proven, scalable |

---

## CHECKLIST — Avant production

```
Backend
[ ] Sync module 100% couvert par tests
[ ] Rate limiting actif (POST /push : 50 req/h)
[ ] tenantId validation sur TOUTES les opérations push
[ ] Transaction wrapping sur multi-entity push
[ ] Conflict resolution algo documenté
[ ] Performance: <500ms pour pull 1000 records
[ ] Audit logging: qui a pousuté quel conflit

Mobile
[ ] WatermelonDB persiste offline
[ ] Outbox queue survit app restart
[ ] Token refresh avant push (si expiré)
[ ] UI indicateurs sync (status, erreurs, conflicts)
[ ] Capable offline: créer facture, visualiser
[ ] App store deployable (Xcode/Android Studio)

Intégration
[ ] E2E: offline create → push → server verified
[ ] Conflict scenario E2E tested
[ ] Multi-device sync tested (2 mobiles + web)
[ ] Large batch push tested (100 operations)
[ ] Performance load test (100 concurrent users)
```

