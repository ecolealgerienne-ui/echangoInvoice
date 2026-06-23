# Mobile Offline-First — Résumé Exécutif

## Décisions clés validées

### 1. Stack technique Phase 1 (MVP)
```
PWA (React web existing) + Capacitor (iOS/Android apps)
└─ WatermelonDB + SQLite (local db)
   └─ Sync: Pull deltas + Push outbox
```

**Justification :** Réutilise 90% code React web, déploiement fast, équipe existante.

### 2. Stratégie conflits : "First Write Wins" (FWW)

```
Timestamp comparison:
├─ client.updatedAt < server.updatedAt → REJECT (client is stale)
├─ client.updatedAt > server.updatedAt → ACCEPT (client wins)
└─ same timestamp → UUID tiebreaker (deterministic)

Result: User notified "Your change was overwritten by [user]"
```

### 3. Architecture synchronisation

```
Mobile                          Server
  ↓                               ↓
[Local WatermelonDB]      ←→  [PostgreSQL + NestJS]
  ├─ SalesInvoice               ├─ Existing entities
  ├─ DeliveryNote              ├─ All 38 entities
  ├─ Partner                    └─ Soft delete support
  ├─ FinishedProduct
  └─ Payment

Sync workflow:
1. User offline: writes to local DB → Outbox queue
2. Network → Pull deltas (GET /sync/pull?since=...)
3. Merge deltas into local DB
4. Push batch (POST /sync/push with operations)
5. Server resolves conflicts (FWW)
6. Mobile merges results, notifies user on conflicts
```

## API Endpoints (Backend)

### GET /api/v1/sync/pull

```bash
curl -X GET "http://api/v1/sync/pull?entity=SalesInvoice&since=1719086400000&limit=1000" \
  -H "Authorization: Bearer <token>"

# Response
{
  "data": {
    "created": [...],      # New records since timestamp
    "updated": [...],      # Modified records
    "deleted": [...],      # Soft-deleted records
    "hasMore": false       # Pagination indicator
  }
}
```

### POST /api/v1/sync/push

```bash
curl -X POST "http://api/v1/sync/push" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "operations": [
      {
        "id": "uuid",
        "entityType": "SalesInvoice",
        "operation": "create|update|delete",
        "payload": { "tenantId": "...", ...fields }
      }
    ]
  }'

# Response: { "data": { "successful": [...], "conflicts": [...], "errors": [...] } }
```

## Entités critiques (Phase 2)

| Entity | Offline | Read-Write | Notes |
|--------|---------|-----------|-------|
| SalesInvoice | ✅ | ✅ | Core: factures offline |
| SalesInvoiceItem | ✅ | ✅ | Lines for invoices |
| DeliveryNote | ✅ | ✅ | Core: BL offline |
| DeliveryNoteItem | ✅ | ✅ | Lines for BL |
| Partner | ✅ | ✅ | Customers + Suppliers |
| FinishedProduct | ✅ | 🔒 Read-only | Catalog |
| Payment | ✅ | ✅ | Payment recording |
| Quote | ✅ (Phase 3) | ✅ | Quotes |
| User | ✅ | 🔒 Read-only | Team info |
| Setting | ✅ | 🔒 Read-only | Config (TVA, etc) |

**Excluded (too complex/volatile):**
- StockEntry (millions of FIFO records) → Use FinishedProduct.stockQuantity only
- InventorySummary (volatile) → Use FinishedProduct summary fields
- PurchaseOrder, ReceptionBL (backend-only flow)

## Security & Auth Offline

```typescript
// Token storage (Capacitor)
├─ Access token (1h) → expo-secure-store (encrypted, device lock)
├─ Refresh token (7d) → Keychain/Enclave (highest security)
└─ User state → Memory only (never persisted)

// Offline token expiry handling:
- If access token expires while offline
  → Postpone sync until network returns
  → Auto-retry refresh when connected
  → Notify user "Session expired, reconnect to continue"

// Security invariant R020 (tenantId validation):
- Mobile injects tenantId from JWT into all operations
- Backend validates: operation.tenantId === request.user.tenantId
- Reject if mismatch (ForbiddenException)
```

## Offline vs Online-Only Features

**Offline-capable ✅**
- Create invoice/BL
- View cached factures
- Create payment
- Quick lookup of products/customers
- Generate PDF locally (with cached data)

**Online-only ❌**
- Send invoice by email (SMTP needed)
- Generate reports (complex aggregations)
- User management (cross-tenant impact)
- Tenant settings changes

## Implementation Phases

| Phase | Duration | Focus | Deliverables |
|-------|----------|-------|---|
| **1** | Weeks 1-3 | Backend sync infra | `/sync/pull`, `/sync/push`, conflict resolver, tests |
| **2** | Weeks 4-6 | Core entities + mobile | WatermelonDB schema, outbox, create invoice offline |
| **3** | Weeks 7-8 | Secondary entities | Quotes, expenses, refinements |
| **4** | Weeks 9+ | UX & optimization | Perf tuning, conflict UX, analytics |

## No Breaking Changes

- ✅ All entities already have `createdAt`, `updatedAt`, `deletedAt`
- ✅ All entities already have proper indexes
- ✅ Timestamps already in UTC (R009)
- ✅ tenantId already mandatory (R020)
- ✅ No schema migration required

**New code:** `src/sync/` module + mobile app (separate repo eventually)

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| Large batch push (>1000 ops) | Rate limit: POST 50 req/h, payload max 100 ops/batch |
| Token expiry offline | Store in secure store, auto-refresh on network return |
| Conflict explosion | First-Write-Wins (FWW) is deterministic, no UI dialogs needed (except notify) |
| Data consistency | Transaction wrapping (R005), soft delete honored, validation (R008) |
| Performance on 1M records | Pagination, indexes, delta-sync (only changed records) |
| Cross-device sync | Pull deltas sync all devices sequentially (consistency) |

## Next Steps

1. **Review** this spec with backend lead
2. **Validate** first-write-wins approach with product
3. **Start Phase 1:** Create `src/sync/` module
4. **Setup mobile:** PWA + Capacitor template
5. **Parallel:** Write integration tests for conflict scenarios

---

**Full spec:** `docs/specs/17-mobile-offline.md` (1800+ lines, very detailed)

Last updated: June 24, 2024
