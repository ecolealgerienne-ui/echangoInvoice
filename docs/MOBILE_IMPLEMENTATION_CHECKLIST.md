# Mobile Offline-First Implementation Checklist

**Project:** echangoInvoice Mobile  
**Scope:** PWA + Capacitor (MVP) → React Native Bare (Future)  
**Status:** Pre-implementation planning phase

---

## PHASE 1: Backend Sync Infrastructure (Weeks 1-3)

### Module Creation

- [ ] Create `/src/sync/` directory structure
  ```
  src/sync/
  ├─ sync.module.ts
  ├─ sync.controller.ts
  ├─ sync.service.ts
  ├─ conflict-resolver.ts
  ├─ dto/
  │  ├─ sync-push.dto.ts
  │  ├─ sync-pull.dto.ts
  │  ├─ sync-operation.dto.ts
  │  └─ sync-response.dto.ts
  ├─ entities/
  │  └─ sync-state.entity.ts (optional)
  ├─ strategies/
  │  └─ first-write-wins.strategy.ts
  └─ __tests__/
     ├─ sync.service.spec.ts
     ├─ conflict-resolver.spec.ts
     └─ integration.spec.ts
  ```

### GET /api/v1/sync/pull Implementation

- [ ] Implement `GET /sync/pull` endpoint
  - [ ] Query params: `entity`, `since` (unix ms), `limit`, `tenantId`
  - [ ] Validate entity type enum
  - [ ] Fetch created records since timestamp
  - [ ] Fetch updated records since timestamp (exclude creates)
  - [ ] Fetch deleted records since timestamp
  - [ ] Paginate: `hasMore` flag
  - [ ] Filter by tenantId (R020 security)
  - [ ] Index optimization: Verify indexes on `(tenantId, updatedAt)`
  - [ ] Response format: `{ data: { created, updated, deleted, hasMore } }`

- [ ] Unit tests for pull
  - [ ] Test delta creation (new records since T)
  - [ ] Test delta updates (modified records)
  - [ ] Test delta deletes (soft deleted records)
  - [ ] Test pagination (limit exceeded)
  - [ ] Test tenantId isolation (can't see other tenant)
  - [ ] Test performance: <500ms for 1000 records

### POST /api/v1/sync/push Implementation

- [ ] Implement `POST /sync/push` endpoint
  - [ ] Validate request payload (SyncPushDto)
  - [ ] Validate tenantId matches JWT claim (R020 critical)
  - [ ] Rate limiting: 50 req/h per user (Throttler)
  - [ ] Max 100 operations per batch
  - [ ] Parse operations array

- [ ] Implement operation processing loop
  - [ ] For each operation: `{ id, entityType, operation, payload }`
  - [ ] Dispatch to appropriate handler: create/update/delete
  - [ ] Wrap in QueryRunner + Transaction (R005)
  - [ ] Collect: successful, conflicts, errors
  - [ ] Atomic: all succeed or all rollback

### Conflict Resolution (First-Write-Wins)

- [ ] Implement `resolveConflict()` method
  - [ ] Compare client.updatedAt vs server.updatedAt (timestamp)
  - [ ] Decision logic:
    ```
    clientTime < serverTime → REJECT (client stale)
    clientTime > serverTime → ACCEPT (client newer)
    clientTime === serverTime → UUID tiebreaker (deterministic)
    ```
  - [ ] Return: `{ action: 'accept'|'reject', serverVersion?, reason? }`

- [ ] Implement `processPushOperation()` for each operation type
  - [ ] **CREATE:** Check unique constraints (e.g., invoiceNumber + tenantId)
    - [ ] If unique constraint violated: Return conflict/error
    - [ ] Else: INSERT new record
  - [ ] **UPDATE:** Call resolveConflict()
    - [ ] If ACCEPT: UPDATE in DB, return result
    - [ ] If REJECT: Return { conflict: true, serverVersion, reason }
  - [ ] **DELETE:** Soft delete (set deletedAt = now)
    - [ ] Verify record exists
    - [ ] Set deletedAt timestamp
    - [ ] Return success or error

- [ ] Response format: Separate successful/conflicts/errors
  ```json
  {
    "data": {
      "successful": [
        { "id": "...", "entityType": "...", "operation": "...", "result": {...} }
      ],
      "conflicts": [
        { "id": "...", "status": "conflict", "serverVersion": {...}, "reason": "..." }
      ],
      "errors": [
        { "id": "...", "error": "..." }
      ]
    }
  }
  ```

### Testing & Validation

- [ ] Unit tests: ConflictResolver
  - [ ] Test client timestamp < server: REJECT
  - [ ] Test client timestamp > server: ACCEPT
  - [ ] Test same timestamp: UUID tiebreaker
  - [ ] Test concurrent creates (unique constraint)

- [ ] Unit tests: PushOperation handler
  - [ ] Test create new record (success)
  - [ ] Test create duplicate (error)
  - [ ] Test update accepted (newer client)
  - [ ] Test update rejected (stale client)
  - [ ] Test delete (soft delete)

- [ ] Integration tests
  - [ ] Test full push flow: pull → create → push → merge
  - [ ] Test multi-device conflict: 2 devices edit same record
  - [ ] Test transaction rollback on error
  - [ ] Test rate limiting: >50 req/h rejected

- [ ] Performance tests
  - [ ] Benchmark: pull 1000 records (target <500ms)
  - [ ] Benchmark: push 100 operations (target <1s)
  - [ ] Load test: 10 concurrent users syncing

### Documentation

- [ ] Add Swagger decorators to SyncController
  - [ ] `@ApiTags('sync')`
  - [ ] `@ApiOperation(...)` for each endpoint
  - [ ] `@ApiResponse(...)` for success/error cases
  - [ ] Request/response examples

- [ ] Create `docs/SYNC_API.md`
  - [ ] Endpoint reference
  - [ ] Request/response formats
  - [ ] Error codes & handling
  - [ ] Example curl commands

---

## PHASE 2: Mobile App Setup & Core Entities (Weeks 4-6)

### Mobile Project Setup

- [ ] Setup PWA + Capacitor
  - [ ] Create mobile app directory (or monorepo)
  - [ ] Install Capacitor: `npm install @capacitor/core @capacitor/app`
  - [ ] Initialize iOS & Android: `npx cap init`
  - [ ] Configure `capacitor.config.ts`
  - [ ] Vite config for mobile build target

- [ ] Setup Capacitor plugins
  - [ ] `@capacitor/storage` (local key-value)
  - [ ] `@capacitor/network` (network state)
  - [ ] `@capacitor/preferences` (persistent settings)
  - [ ] `expo-secure-store` wrapper (token storage)

### WatermelonDB Setup

- [ ] Install WatermelonDB
  ```bash
  npm install @nozbe/watermelondb
  npm install @nozbe/watermelondb/adapters/sqlite
  ```

- [ ] Create database schema
  - [ ] Define `schema.ts` with all tables
  - [ ] Create initial migration (v1)
  - [ ] Include indexes on: `tenantId`, `updatedAt`, `deletedAt`, filtered columns

- [ ] Define WatermelonDB models
  - [ ] `SalesInvoiceModel`
  - [ ] `SalesInvoiceItemModel`
  - [ ] `DeliveryNoteModel`
  - [ ] `DeliveryNoteItemModel`
  - [ ] `PartnerModel` (Customer/Supplier)
  - [ ] `FinishedProductModel`
  - [ ] `PaymentModel`
  - [ ] `OutboxRecordModel`
  - [ ] `SyncStateModel` (last sync timestamps)

### State Management (Zustand)

- [ ] Create Zustand stores
  - [ ] `useSyncStore()`
    - [ ] `syncState`: { isSyncing, lastSyncAt, lastSyncError, lastConflict }
    - [ ] `push/pop` outbox operations
    - [ ] `updateSyncState()`
  
  - [ ] `useAuthStore()`
    - [ ] `accessToken`, `refreshToken` (memory only, never persisted)
    - [ ] `user` info
    - [ ] `tenantId` from JWT
    - [ ] `hydrate()` on app init (load from secure store)
    - [ ] `logout()` (clear tokens)
  
  - [ ] `useConnectionStore()`
    - [ ] `isConnected` (boolean)
    - [ ] `connectionType` (wifi/mobile/none)
    - [ ] Update on network state change

### API Client & Interceptor

- [ ] Create `src/mobile/services/api.client.ts`
  - [ ] Axios instance with baseURL
  - [ ] Request interceptor: inject JWT header
  - [ ] Response interceptor:
    - [ ] 401: Attempt token refresh
    - [ ] 409: Sync conflict → emit event to store
    - [ ] 429: Rate limit → enqueue retry
    - [ ] 5xx: Log, enqueue retry

- [ ] Create `src/mobile/services/sync.service.ts`
  - [ ] `pullChanges(tenantId)` method
  - [ ] `pushChanges(tenantId)` method
  - [ ] `performSync()` orchestrator (pull → merge → push)
  - [ ] Retry logic with exponential backoff
  - [ ] Error categorization & handling

### Outbox Pattern Implementation

- [ ] Implement outbox queue operations
  - [ ] `addToOutbox(entityType, entityId, operation, payload)`
    - [ ] Generate UUID for outbox record
    - [ ] Insert into DB
    - [ ] Return outbox record ID

  - [ ] `getOutboxPending()`
    - [ ] Query all where status='pending'
    - [ ] Limit to 100
    - [ ] Order by createdAt ASC

  - [ ] `markOutboxSynced(outboxIds)`
    - [ ] Set status='synced'
    - [ ] Clear error/attempt fields

  - [ ] `markOutboxFailed(outboxId, error)`
    - [ ] Set status='failed'
    - [ ] Store lastError & increment attempt
    - [ ] If attempt < 5: Reset to 'pending' for retry

### Entity Operations (Create/Update/Delete)

- [ ] Implement local-first create
  ```typescript
  async createSalesInvoice(data: CreateInvoiceDto) {
    const id = uuidv4();
    
    // Save to DB
    await db.get('sales_invoices').create((record) => {
      record.id = id;
      record.tenantId = useAuthStore.tenantId;
      record.invoiceNumber = data.invoiceNumber;
      record.customerId = data.customerId;
      record.status = 'draft';
      record.subtotal = calculateSubtotal(data.items);
      record.taxAmount = record.subtotal * 0.19;
      record.totalAmount = record.subtotal + record.taxAmount;
      record.updatedAt = Date.now();
      // ... other fields
    });

    // Add to outbox
    await addToOutbox('SalesInvoice', id, 'create', {
      id,
      tenantId,
      invoiceNumber: data.invoiceNumber,
      // ... full payload
    });

    return id;
  }
  ```

- [ ] Implement local-first update
  - [ ] Find record by ID
  - [ ] Update fields
  - [ ] Set updatedAt = now
  - [ ] Add to outbox with operation='update'

- [ ] Implement local soft delete
  - [ ] Find record by ID
  - [ ] Set deletedAt = now
  - [ ] Add to outbox with operation='delete'

### UI Components (Phase 2 Core)

- [ ] Create `src/mobile/pages/Invoices.tsx`
  - [ ] Query WatermelonDB: `db.get('sales_invoices').query(...)`
  - [ ] List invoices with search/filter
  - [ ] Link to create/edit pages

- [ ] Create `src/mobile/pages/CreateInvoice.tsx`
  - [ ] Form: customer, items (product + qty + price)
  - [ ] Auto-calculate: subtotal, tax, total
  - [ ] Save button → calls `createSalesInvoice()`
  - [ ] Show "Invoice saved offline ✅"

- [ ] Create `src/mobile/pages/InvoiceDetail.tsx`
  - [ ] Display invoice (read from DB)
  - [ ] Edit button → form
  - [ ] Show sync status if pending

- [ ] Create sync status indicator component
  - [ ] Show: "Offline" | "Syncing..." | "Synced ✅" | "Error"
  - [ ] Floating badge in app header
  - [ ] Click to retry if error

### Merge deltas into local DB

- [ ] Implement `mergeDeltas()` method in SyncService
  - [ ] For each created record:
    - [ ] INSERT into WatermelonDB (batch operation)
  - [ ] For each updated record:
    - [ ] FIND local record by ID
    - [ ] UPDATE fields
    - [ ] Detect conflicts? (compare local.updatedAt vs server.updatedAt)
  - [ ] For each deleted record:
    - [ ] Find local record
    - [ ] SET deletedAt

- [ ] Conflict detection on merge
  - [ ] If local has unsyncedchanges (in outbox):
    - [ ] Mark as "conflict" in app state
    - [ ] DO NOT overwrite local
    - [ ] Show warning badge
  - [ ] If local is synced:
    - [ ] Safe to overwrite with server

### Testing

- [ ] Unit tests: Outbox operations
  - [ ] addToOutbox() → verify DB insert
  - [ ] getOutboxPending() → verify query
  - [ ] markOutboxSynced() → verify status update

- [ ] Unit tests: Entity create/update/delete
  - [ ] Create invoice offline → verify DB + outbox
  - [ ] Update invoice locally → verify update + outbox
  - [ ] Delete invoice locally → verify soft delete + outbox

- [ ] Integration tests: Sync flow
  - [ ] Create invoice offline → pull server deltas → push outbox → verify result
  - [ ] Simulate conflict: two creates of same number → push → expect error

---

## PHASE 3: Secondary Entities & Refinements (Weeks 7-8)

### Additional WatermelonDB Models

- [ ] Quote + QuoteItem
- [ ] Expense
- [ ] CreditNote (if in scope)
- [ ] User (read-only)
- [ ] Setting (read-only)

### Additional UI Pages

- [ ] Quotes list + create
- [ ] Expenses list + create
- [ ] Dashboard (read-only, from cached data)
- [ ] Settings (view only, sync indicator)

### Enhanced Sync

- [ ] Rate limiting info display
  - [ ] Show "Rate limited, retrying in 30s" if 429
  - [ ] Exponential backoff display

- [ ] Conflict dialog enhancement
  - [ ] Tabs: Server vs Local version
  - [ ] Highlight differences
  - [ ] [Accept server] [Force mine] buttons

- [ ] Sync state persistence
  - [ ] `lastSyncAt` per entity type
  - [ ] Stored in AsyncStorage (survives app restart)
  - [ ] Display: "Last synced: 2 hours ago"

---

## PHASE 4: UX, Optimization & Polish (Weeks 9+)

### Performance

- [ ] Database indexing audit
  - [ ] Verify all important queries have indexes
  - [ ] Measure query times

- [ ] Pagination for large lists
  - [ ] Infinite scroll: load 50 at a time
  - [ ] Search: debounce + query

- [ ] Network bandwidth optimization
  - [ ] Compress JSON in transit (gzip)
  - [ ] Only send changed fields on update (delta payloads)
  - [ ] Batch pull requests (combine multiple entity types)

### UX Polish

- [ ] Skeleton loaders while syncing
- [ ] Animations for conflict resolution
- [ ] Toast notifications for sync events
  - [ ] "Invoice synced ✅"
  - [ ] "Sync conflict detected ⚠️"
  - [ ] "Connection lost 📡"

- [ ] Offline banner
  - [ ] Persistent at top when offline
  - [ ] Auto-hide when online

- [ ] Sync activity log
  - [ ] Optional: Show sync history for debugging
  - [ ] Last 10 sync operations

### Documentation

- [ ] Create mobile development guide
  - [ ] Setup: Dependencies, tooling, IDE
  - [ ] Building for iOS: Xcode steps
  - [ ] Building for Android: Android Studio steps
  - [ ] Local testing: Capacitor Live Reload

- [ ] Create troubleshooting guide
  - [ ] "Token expired while offline"
  - [ ] "Sync conflicts keep happening"
  - [ ] "App crashed during sync"
  - [ ] "Large batch push slow"

### Testing & QA

- [ ] End-to-end (E2E) tests
  - [ ] Offline create invoice → network returns → verify synced
  - [ ] Multi-device conflict → both devices push → verify FWW resolution
  - [ ] Large batch (100 ops) → verify all processed
  - [ ] Network dropout mid-sync → verify recovery

- [ ] Load testing
  - [ ] 10 users creating invoices simultaneously
  - [ ] Measure conflict rate
  - [ ] Measure sync duration

- [ ] Manual QA checklist
  - [ ] Create invoice (offline)
  - [ ] Search/filter (offline cache)
  - [ ] Network returns → auto-sync
  - [ ] Conflict dialog appears (manual conflict setup)
  - [ ] Accept server / Force mine
  - [ ] Large list (100+ records) → scroll performance
  - [ ] Token refresh while offline → retry on connection
  - [ ] Kill app mid-sync → reopen → resume (Outbox not lost)

---

## Deployment & DevOps

### Mobile App Deployment

- [ ] iOS App Store
  - [ ] Build with Xcode
  - [ ] Provisioning profiles
  - [ ] TestFlight upload
  - [ ] App Store Connect submission

- [ ] Google Play
  - [ ] Build APK/AAB with Android Studio
  - [ ] Signing configuration
  - [ ] Google Play Console
  - [ ] Internal testing track first

### Backend Deployment (Sync Endpoints)

- [ ] Staging deployment
  - [ ] Merge `/src/sync` module
  - [ ] Run migrations (none needed)
  - [ ] Deploy to staging server
  - [ ] Test sync endpoints manually

- [ ] Monitoring
  - [ ] API endpoints: response time, error rate
  - [ ] Conflict rate: % of push operations with conflicts
  - [ ] Sync success rate: successful syncs / total attempts

---

## Launch Checklist

Before releasing to App Store / Google Play:

- [ ] Beta testers have access (TestFlight / internal track)
- [ ] Sync endpoints live in production
- [ ] Documentation complete + published
- [ ] Error handling & retry logic tested
- [ ] Offline functionality validated
- [ ] Conflict scenarios tested
- [ ] Performance benchmarks met (<500ms pull, <1s push)
- [ ] Security review: token storage, tenantId validation
- [ ] Analytics tracking: sync events, errors, conflicts
- [ ] Support documentation: FAQ, troubleshooting
- [ ] Customer comms: "Mobile app now available"

---

## Post-Launch (Weeks 10+)

- [ ] Monitor crash reports (Sentry/Firebase)
- [ ] Monitor API metrics (rate limiting, error rates)
- [ ] Collect user feedback (sync UX, conflicts)
- [ ] Iterate: Fix bugs, optimize perf
- [ ] Phase 2: React Native bare migration (if product-market fit confirmed)

---

## Repository Structure (When Separate)

Eventually mobile may become a separate repo:

```
echango-invoice-mobile/
├─ public/
│  └─ index.html
├─ src/
│  ├─ main.tsx
│  ├─ App.tsx
│  ├─ pages/
│  │  ├─ Invoices.tsx
│  │  ├─ CreateInvoice.tsx
│  │  ├─ DeliveryNotes.tsx
│  │  └─ ...
│  ├─ components/
│  │  ├─ SyncStatus.tsx
│  │  ├─ ConflictDialog.tsx
│  │  └─ ...
│  ├─ services/
│  │  ├─ api.client.ts
│  │  ├─ sync.service.ts
│  │  └─ storage.service.ts
│  ├─ db/
│  │  ├─ schema.ts
│  │  ├─ migrations/
│  │  └─ models/
│  ├─ stores/
│  │  ├─ auth.store.ts
│  │  ├─ sync.store.ts
│  │  └─ connection.store.ts
│  └─ styles/
│     └─ globals.css
├─ capacitor.config.ts
├─ vite.config.ts
├─ tsconfig.json
├─ package.json
└─ README.md
```

---

**Last Updated:** June 24, 2024  
**Next Review:** Start of Phase 1 implementation
