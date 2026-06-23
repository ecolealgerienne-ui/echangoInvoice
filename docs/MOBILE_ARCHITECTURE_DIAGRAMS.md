# Mobile Offline-First — Architecture Diagrams & Flows

## 1. System Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                     echangoInvoice SaaS                        │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  WEB UI (React)          MOBILE (PWA + Capacitor)             │
│  ├─ Dashboard            ├─ Same React codebase               │
│  ├─ Invoices list        ├─ WatermelonDB (local)              │
│  ├─ Create invoice       └─ Works OFFLINE                     │
│  └─ Reports                                                   │
│       ↓ HTTP REST API (JWT)          ↓ HTTP REST API (JWT)    │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │           NestJS Backend (api/v1)                         │ │
│  │                                                           │ │
│  │  Existing Modules (invoices, deliveries, customers, ...) │ │
│  │  + NEW: src/sync/                                         │ │
│  │         ├─ GET  /sync/pull   (delta sync)                │ │
│  │         └─ POST /sync/push   (conflict resolution)       │ │
│  │                                                           │ │
│  │  ┌─────────────────────────────────────────────────────┐ │ │
│  │  │ PostgreSQL (single shared DB, multi-tenant)         │ │ │
│  │  │ ├─ All entities (38 tables)                         │ │ │
│  │  │ ├─ tenantId on every row (R020)                     │ │ │
│  │  │ ├─ updatedAt, deletedAt on every entity (soft del)  │ │ │
│  │  │ └─ Indexes for sync queries (perf)                 │ │ │
│  │  └─────────────────────────────────────────────────────┘ │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

---

## 2. Sync Flow (Detailed)

### 2.1 User Creates Invoice Offline

```
┌─────────────────────────────────────────────────┐
│           User Action (Mobile Offline)          │
│                                                  │
│  User taps "Create Invoice"                      │
│           ↓                                      │
│  1. Generate ID: uuid4 (e.g., uuid-1)          │
│  2. Collect data: { invoiceNumber, customerId, │
│           items, subtotal, taxAmount, ... }   │
│  3. Calculate: TVA = subtotal * 0.19 (local) │
│  4. Save to DB:                               │
│           ↓                                     │
│  ┌──────────────────────────────────────────┐ │
│  │   WatermelonDB (SQLite - Local)          │ │
│  │                                          │ │
│  │   Table: sales_invoices                 │ │
│  │   ├─ id: uuid-1                         │ │
│  │   ├─ tenantId: tenant-1                 │ │
│  │   ├─ invoiceNumber: "FAC-24-001"        │ │
│  │   ├─ status: "draft"                    │ │
│  │   ├─ subtotal: 1000.00                  │ │
│  │   ├─ taxAmount: 190.00                  │ │
│  │   ├─ updatedAt: 1719086400000 (now)     │ │
│  │   └─ deletedAt: null                    │ │
│  │                                          │ │
│  │   Table: sales_invoice_items            │ │
│  │   ├─ id: uuid-item-1                    │ │
│  │   ├─ salesInvoiceId: uuid-1             │ │
│  │   ├─ quantity: 5, unitPrice: 200        │ │
│  │   └─ ...                                │ │
│  │                                          │ │
│  │   Table: outbox_records                 │ │
│  │   ├─ id: outbox-uuid                    │ │
│  │   ├─ entityId: uuid-1                   │ │
│  │   ├─ entityType: "SalesInvoice"         │ │
│  │   ├─ operation: "create"                │ │
│  │   ├─ payload: { full invoice data }     │ │
│  │   ├─ status: "pending"                  │ │
│  │   └─ createdAt: now                     │ │
│  └──────────────────────────────────────────┘ │
│           ↓                                     │
│  5. Update UI: Show "Invoice saved (offline)" │
│                                                │
│  ✅ OFFLINE — No network needed                │
│                                                │
└─────────────────────────────────────────────────┘
```

### 2.2 Network Becomes Available → Sync

```
┌─────────────────────────────────────────────────┐
│      Network Available → Sync Triggered          │
│                                                  │
│  1. Auto-detect: Network.onStateChange()        │
│           ↓                                      │
│  2. Check Access Token:                         │
│     ├─ Is it expired?                          │
│     │  └─ YES: Refresh token endpoint          │
│     │     POST /api/v1/auth/refresh            │
│     │     + Get new token + save in SecureStore│
│     └─ NO: Proceed to sync                     │
│           ↓                                      │
│  3. PULL PHASE (Fetch server changes)          │
│     ├─ Get lastSyncAt: { SalesInvoice: t1,... }│
│     ├─ For each entity type:                   │
│     │  GET /api/v1/sync/pull                   │
│     │    ?entity=SalesInvoice                  │
│     │    &since=1719086400000                  │
│     │    &limit=1000                           │
│     │           ↓                               │
│     │  ┌─────────────────────────────────────┐│
│     │  │ Server Response                     ││
│     │  │ {                                   ││
│     │  │   created: [ {...}, ... ]          ││
│     │  │   updated: [ {...}, ... ]          ││
│     │  │   deleted: [ {...}, ... ]          ││
│     │  │   hasMore: false                    ││
│     │  │ }                                   ││
│     │  └─────────────────────────────────────┘│
│     │           ↓                               │
│     └─ Merge into WatermelonDB (batch)        │
│        └─ Update lastSyncAt                    │
│           ↓                                     │
│  4. PUSH PHASE (Send local changes)            │
│     ├─ Read Outbox: WHERE status='pending'    │
│     │  ↓                                       │
│     │  ┌──────────────────────────────────┐  │
│     │  │ Outbox Contents (from step 2.1) │  │
│     │  │ {                                │  │
│     │  │   id: outbox-uuid                │  │
│     │  │   entityType: "SalesInvoice"     │  │
│     │  │   operation: "create"            │  │
│     │  │   payload: {                     │  │
│     │  │     id: uuid-1                   │  │
│     │  │     tenantId: tenant-1           │  │
│     │  │     invoiceNumber: "FAC-24-001"  │  │
│     │  │     status: "draft"              │  │
│     │  │     subtotal: 1000.00            │  │
│     │  │     taxAmount: 190.00            │  │
│     │  │     updatedAt: 1719086400000     │  │
│     │  │   }                              │  │
│     │  │ }                                │  │
│     │  └──────────────────────────────────┘  │
│     │           ↓                              │
│     ├─ Batch into 100 op max                  │
│     ├─ POST /api/v1/sync/push                 │
│     │           ↓                              │
│     │  ┌──────────────────────────────────┐  │
│     │  │ Server Processes (FWW)           │  │
│     │  │ - Conflict resolution            │  │
│     │  │ - Atomic save (R005 transaction) │  │
│     │  └──────────────────────────────────┘  │
│     │           ↓                              │
│     │  ┌──────────────────────────────────┐  │
│     │  │ Response 200                     │  │
│     │  │ {                                │  │
│     │  │   successful: [                  │  │
│     │  │     { id: uuid-1, status: ... }  │  │
│     │  │   ],                             │  │
│     │  │   conflicts: [],                 │  │
│     │  │   errors: []                     │  │
│     │  │ }                                │  │
│     │  └──────────────────────────────────┘  │
│     │           ↓                              │
│     └─ Update Outbox: SET status='synced'     │
│           ↓                                    │
│  5. DONE: Show "All changes synced" ✅        │
│                                                │
└─────────────────────────────────────────────────┘
```

### 2.3 Conflict Scenario (Multi-device)

```
Timeline:

14:00 — Device A (Mobile Agent)          Device B (Web Manager)
        ├─ Create FAC-24-001 (draft)     (offline)
        ├─ Save local WatermelonDB
        ├─ Status: pending in Outbox
        
14:05   (still offline)                  ├─ Create/Edit FAC-24-001
                                         ├─ Change status → "sent"
                                         ├─ POST /invoices/{id}
                                         ├─ Server updates: updatedAt=14:05
                                         
14:10   ├─ Network returns                
        ├─ Sync attempts PUSH            
        ├─ POST /sync/push                
        │   {                             
        │     entityId: uuid-1            
        │     updatedAt: 14:00 (STALE)   
        │   }                             
        
14:11   — Server Conflict Resolution (FWW Algorithm)
        ├─ Fetch server version: updatedAt=14:05
        ├─ Compare: 14:00 < 14:05 → CLIENT LOSES
        ├─ Response 409:
        │  {
        │    status: "conflict"
        │    action: "reject"
        │    reason: "Client timestamp (14:00) < Server (14:05)"
        │    serverVersion: { id, status: "sent", updatedAt: 14:05 }
        │  }
        
14:12   — Mobile UI Notifies User
        ├─ Alert: "Sync conflict: FAC-24-001"
        ├─ "Your version (14:00): status=draft"
        ├─ "Server version (14:05): status=sent (updated by manager@company.dz)"
        ├─ Options:
        │  ├─ [Accept server version]
        │  └─ [Force my version (will create new conflict)]
        
        User clicks "Accept server version"
        ├─ Merge server version into local DB
        ├─ Remove from Outbox (mark conflict resolved)
        ├─ Update UI: Show "draft → sent (updated by manager)"
        ├─ ✅ Sync complete
```

---

## 3. First-Write-Wins Algorithm

```
┌──────────────────────────────────────────────────────────────┐
│  Backend: processPushOperation()                             │
│  Input: { entityId, entityType, operation, payload }         │
└──────────────────────────────────────────────────────────────┘
           ↓
    1. Is this NEW (entityId not in DB)?
       YES → INSERT payload ✅ (FWW doesn't apply to creates)
       NO → Continue to step 2
           ↓
    2. Fetch server version: entity.updatedAt
           ↓
    3. Compare timestamps:
       
       clientTime = new Date(payload.updatedAt).getTime()
       serverTime = serverVersion.updatedAt.getTime()
       
           ↓
    4. Decision Tree:
    
       clientTime < serverTime
       ├─ Client is STALE
       ├─ Action: REJECT ❌
       ├─ Return: { conflict: true, serverVersion, reason: "client outdated" }
       └─ Mobile: Show dialog, user accepts server OR tries to force
       
       clientTime > serverTime
       ├─ Client is NEWER (won the race)
       ├─ Action: ACCEPT ✅
       ├─ UPDATE database with clientVersion
       └─ Mobile: Merge result, continue
       
       clientTime === serverTime (rare edge case)
       ├─ Same timestamp (concurrent edit)
       ├─ Tiebreaker: UUID binary comparison (deterministic)
       ├─ if clientId > serverId: ACCEPT ✅
       ├─ else: REJECT ❌
       └─ Mobile: Handled same as above

┌──────────────────────────────────────────────────────────────┐
│  Result: Deterministic, no UI dialogs on server             │
│  (Mobile handles conflicts & notifies user)                  │
└──────────────────────────────────────────────────────────────┘
```

---

## 4. WatermelonDB Schema (Mobile)

```typescript
// src/mobile/db/schema.ts

const schema = appSchema({
  version: 1,
  tables: [
    // Core transactions
    tableSchema({
      name: 'sales_invoices',
      columns: [
        { name: 'id', type: 'string', isIndexed: true },
        { name: 'tenant_id', type: 'string', isIndexed: true },
        { name: 'invoice_number', type: 'string' },
        { name: 'customer_id', type: 'string', isIndexed: true },
        { name: 'status', type: 'string', isIndexed: true },
        { name: 'subtotal', type: 'number' },
        { name: 'tax_amount', type: 'number' },
        { name: 'total_amount', type: 'number' },
        { name: 'amount_paid', type: 'number' },
        { name: 'amount_due', type: 'number' },
        { name: 'created_at', type: 'number', isIndexed: true },
        { name: 'updated_at', type: 'number', isIndexed: true },
        { name: 'deleted_at', type: 'number', isIndexed: true },
      ],
    }),
    
    tableSchema({
      name: 'sales_invoice_items',
      columns: [
        { name: 'id', type: 'string', isIndexed: true },
        { name: 'tenant_id', type: 'string', isIndexed: true },
        { name: 'sales_invoice_id', type: 'string', isIndexed: true },
        { name: 'finished_product_id', type: 'string', isIndexed: true },
        { name: 'quantity', type: 'number' },
        { name: 'unit', type: 'string' },
        { name: 'unit_price', type: 'number' },
        { name: 'line_total', type: 'number' },
        { name: 'created_at', type: 'number', isIndexed: true },
        { name: 'updated_at', type: 'number', isIndexed: true },
      ],
    }),
    
    // ... DeliveryNote, Partner, FinishedProduct, Payment schemas ...
    
    // Sync metadata
    tableSchema({
      name: 'outbox_records',
      columns: [
        { name: 'id', type: 'string', isIndexed: true },
        { name: 'entity_id', type: 'string', isIndexed: true },
        { name: 'entity_type', type: 'string' },
        { name: 'operation', type: 'string' }, // 'create', 'update', 'delete'
        { name: 'payload', type: 'string' }, // JSON stringified
        { name: 'status', type: 'string', isIndexed: true }, // 'pending', 'syncing', 'synced', 'failed'
        { name: 'attempt', type: 'number' },
        { name: 'last_error', type: 'string' },
        { name: 'created_at', type: 'number', isIndexed: true },
      ],
    }),
  ],
});
```

---

## 5. Network State Management

```
┌─────────────────────────────────────────┐
│   Network Listener (Capacitor)          │
└─────────────────────────────────────────┘
           ↓
    Network.onStateChange((state) => {
      if (state.isConnected) {
        // 🟢 Connected
        
        1. Check token expiry
           ├─ If expired: Refresh
           └─ If valid: Continue
        
        2. Attempt Sync
           ├─ Pull deltas
           ├─ Merge into DB
           ├─ Push outbox
           └─ Report results
        
        3. Update UI
           └─ "Synced ✅" or "Sync failed: ..."
      } else {
        // 🔴 Offline
        
        1. Update UI
           └─ "Offline mode — changes saved locally"
        
        2. Disable online-only features
           ├─ Send email PDF → disabled
           ├─ Generate reports → disabled
           └─ Manage users → disabled
        
        3. Enable offline features
           └─ Create invoice, view cache, etc
      }
    });
```

---

## 6. Error Handling & Retry Logic

```
┌──────────────────────────┐
│   Sync Operation Fails   │
└──────────────────────────┘
           ↓
    Error Analysis:
    
    401 Unauthorized?
    ├─ Token invalid/expired
    ├─ Attempt refresh: POST /auth/refresh
    ├─ Retry sync
    └─ If refresh fails: Logout user
    
    409 Conflict?
    ├─ FWW resolved against client
    ├─ Show conflict dialog
    └─ Wait for user decision
    
    429 Rate Limited?
    ├─ Update Outbox: lastError = "rate_limited"
    ├─ Wait exponential backoff (1s, 2s, 4s, 8s, ...)
    ├─ Retry automatically
    └─ Max 5 retries
    
    Network Error (ENOTFOUND)?
    ├─ Device is offline (fallback)
    ├─ Mark outbox as "pending"
    ├─ Retry on next network available event
    └─ User notified "Will sync when online"
    
    5xx Server Error?
    ├─ Retry after 30s
    ├─ Max 3 retries
    └─ If persistent: Alert user "Server issue, try later"
```

---

## 7. Conflict UI Example

```
╔════════════════════════════════════════════╗
║   ⚠️  Sync Conflict                        ║
╠════════════════════════════════════════════╣
║                                            ║
║  Your modification was overwritten        ║
║                                            ║
║  Document: FAC-24-001                     ║
║  Your version: Draft (created 14:00)      ║
║  Server version: Sent (updated 14:05)     ║
║  Updated by: manager@company.dz           ║
║                                            ║
║  ┌─ Tab Group ──────────────────────────┐ ║
║  | Server Version    | Your Version     | ║
║  ├───────────────────────────────────────┤ ║
║  | FAC-24-001                            ║ │
║  | Status: SENT ← [Changed]              │ │
║  | Amount: 1190 DA                       │ │
║  | ...                                   │ │
║  └─────────────────────────────────────┘ ║
║                                            ║
║  [Accept server] [Force my version]      ║
║                                            ║
╚════════════════════════════════════════════╝

Option 1: Accept server
└─ Mobile downloads server version
   ├─ Overwrites local with server data
   ├─ Removes from Outbox
   └─ Sync completes ✅

Option 2: Force my version
└─ Sends clientVersion back to server
   ├─ Creates NEW sync batch with clientVersion
   ├─ Server re-evaluates FWW
   ├─ Will likely conflict again (same situation)
   └─ Results in conflict loop (bad UX)
   → Not recommended for end users
```

---

## Summary: Data Flow Mermaid

```
Offline User (Mobile)
        ↓
    [Create Invoice]
        ↓
    [Save WatermelonDB + Outbox]
        ↓
        ↓ (No network)
        ↓
    [User can view cached data] ✅ OFFLINE WORKS
        ↓
    [Network comes back]
        ↓
    [Check token: refresh if needed]
        ↓
    [Pull: GET /sync/pull → merge deltas]
        ↓
    [Push: POST /sync/push → FWW resolution]
        ↓
    [Conflict detected?]
    ├─ YES: [Show dialog → User decides]
    └─ NO: [Mark outbox synced → Done]
        ↓
    [UI Update: "All synced ✅"]
```

