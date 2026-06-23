# Mobile Offline-First Implementation — Complete Documentation

Cette section contient l'étude exhaustive et les spécifications pour l'implémentation d'une application mobile iOS/Android **offline-first** avec synchronisation **"First Write Wins"** pour echangoInvoice.

## Documents générés

### 1. **17-mobile-offline.md** (Spécification complète — 51KB, 1821 lignes)
   
   Le document maître : spécification exhaustive couvrant tous les aspects.
   
   **Sections :**
   - 1. Choix technologique mobile (PWA + Capacitor vs alternatives)
   - 2. Architecture de synchronisation "First Write Wins"
   - 3. Entités à synchroniser (matrice, volume, criticité)
   - 4. Gestion des conflits (algorithme FWW exact)
   - 5. Sécurité et authentification offline
   - 6. API de synchronisation backend (GET/POST endpoints)
   - 7. Impact sur le backend existant
   - 8. Fonctionnalités offline vs online-only
   - 9. Plan d'implémentation par phases

   **À lire en priorité pour :** Architectes, tech leads, product managers

---

### 2. **MOBILE_OFFLINE_SUMMARY.md** (Résumé exécutif — 6KB)
   
   Vue d'ensemble concise : décisions clés, architecture, endpoints API.
   
   **Idéal pour :** Explication rapide aux stakeholders, réunions

---

### 3. **MOBILE_ARCHITECTURE_DIAGRAMS.md** (Diagrammes — 23KB)
   
   Visualisations détaillées des flux de synchronisation.
   
   **Contient :**
   - System architecture (3-tier)
   - Sync flow: create offline → network → sync
   - Conflict scenario (multi-device timeline)
   - First-Write-Wins algorithm flowchart
   - WatermelonDB schema
   - Network state management
   - Error handling & retry logic
   - Conflict UI mock-up
   - Data flow summary

   **À lire pour :** Comprendre les flux visuellement

---

### 4. **MOBILE_IMPLEMENTATION_CHECKLIST.md** (Checklist détaillée — 17KB)
   
   Guide de mise en œuvre phase par phase avec tâches granulaires.
   
   **Par phase :**
   - Phase 1 (Weeks 1-3): Backend sync infrastructure
   - Phase 2 (Weeks 4-6): Mobile app + core entities
   - Phase 3 (Weeks 7-8): Secondary entities
   - Phase 4 (Weeks 9+): UX & optimization
   
   **Sections :**
   - Module creation
   - Endpoint implementation (GET /pull, POST /push)
   - Conflict resolution code
   - Testing & validation
   - WatermelonDB setup
   - State management (Zustand)
   - UI components
   - E2E tests
   - Deployment checklist

   **À utiliser :** Planning, task breakdown, progress tracking

---

## Quick Start Guide

### Pour commencer (ordre recommandé) :

1. **Lire :** MOBILE_OFFLINE_SUMMARY.md (5 min)
   → Comprendre décisions clés + architecture globale

2. **Lire :** MOBILE_ARCHITECTURE_DIAGRAMS.md (15 min)
   → Visualiser les flux de sync et conflits

3. **Lire :** docs/specs/17-mobile-offline.md — Sections clés (30 min)
   - Section 2: Architecture synchronisation
   - Section 4: Gestion des conflits (algorithme exact)
   - Section 6: API endpoints

4. **Référence :** MOBILE_IMPLEMENTATION_CHECKLIST.md
   → Pour planifier Phase 1, Phase 2, etc.

---

## Key Architectural Decisions

| Décision | Choix | Justification |
|----------|-------|--------------|
| **Framework** | PWA + Capacitor (Phase 1) | Réutilise React web existant, déploiement rapide |
| **DB locale** | WatermelonDB + SQLite | Sync-ready, performant, compact |
| **Conflits** | First-Write-Wins (FWW) | Déterministe, zéro UI complexe |
| **Auth offline** | JWT + expo-secure-store | Standard, sécurisé |
| **Sync pattern** | Pull deltas + Push outbox | Proven pattern, scalable |
| **Entities** | SalesInvoice, DeliveryNote, Partner, Payment... | 10-15 core entities, rest read-only |

---

## Implementation Timeline

| Phase | Duration | Focus | Output |
|-------|----------|-------|--------|
| **1** | Weeks 1-3 | Backend sync infra | `/sync/pull`, `/sync/push` endpoints + tests |
| **2** | Weeks 4-6 | Mobile app + core entities | WatermelonDB, offline invoice creation |
| **3** | Weeks 7-8 | Secondary entities | Quotes, expenses, refinements |
| **4** | Weeks 9+ | UX & optimization | Performance tuning, conflict UX, launch |

---

## No Breaking Changes

✅ **No schema migrations needed** — All entities already have:
- `createdAt`, `updatedAt`, `deletedAt` (TimestampZ)
- Proper indexes
- tenantId mandatory
- Soft delete support

**New code only:** `src/sync/` backend module + separate mobile app

---

## Security Guarantees

✅ **R020 (tenantId validation):** All sync operations validate JWT tenantId  
✅ **Offline tokens:** SecureStore (encrypted, device lock)  
✅ **Transaction safety:** R005 (QueryRunner + rollback)  
✅ **First-Write-Wins:** Deterministic, no data loss, just notification  
✅ **Audit trail:** `updatedAt`, `updatedBy`, `createdBy` preserved  

---

## Critical Success Factors

1. **FWW Algorithm correctness** → Must be deterministic (UUID tiebreaker for same timestamp)
2. **Transaction safety** → All multi-entity operations must use QueryRunner (R005)
3. **tenantId validation** → Every sync operation must validate JWT tenantId (R020)
4. **Token refresh offline** → Auto-refresh on network return, postpone sync if expired
5. **Conflict UX** → Simple dialog, not complex merge tool
6. **Performance** → Pull 1000 records <500ms, push 100 ops <1s

---

## Testing Strategy

| Layer | Tests | Target Coverage |
|-------|-------|-----------------|
| **Backend** | Conflict resolution, transaction rollback, tenantId validation | 100% |
| **Mobile** | Outbox operations, delta merge, sync flow | 80%+ |
| **E2E** | Offline create → network → sync → verify, multi-device conflict | All scenarios |
| **Load** | 10 concurrent users, measure conflict rate | <5% false conflicts |

---

## Monitoring & Metrics (Post-Launch)

- API response times: Pull, push (< p95 500ms)
- Conflict rate: % of push operations with conflicts (target <5%)
- Sync success rate: successful syncs / total attempts (target >95%)
- Error rates by type: 401, 409, 429, 5xx
- User retention: Track mobile app adoption

---

## References

- **Inspiration:** Invoice Ninja V5 (sync patterns)
- **WatermelonDB:** https://watermelondb.com/ (sync-ready local DB)
- **Capacitor:** https://capacitorjs.com/ (iOS/Android wrapper)
- **First-Write-Wins:** CRDT-like conflict resolution (simpler than OT/CRDT)

---

## Next Steps

### For Immediate Action:

1. **Review** this spec with backend lead + product
2. **Validate** First-Write-Wins approach fits business needs
3. **Schedule** Phase 1 kickoff meeting
4. **Create** JIRA epic: "Mobile Offline-First MVP"
5. **Assign** Phase 1 backend engineer (3 weeks)

### Phase 1 Deliverables:

- [ ] `GET /api/v1/sync/pull` endpoint working
- [ ] `POST /api/v1/sync/push` endpoint with FWW conflict resolution
- [ ] 100+ unit + integration tests
- [ ] Swagger documentation
- [ ] Performance benchmark: <500ms pull 1000 records

---

## Questions & Clarifications

**Q: Why First-Write-Wins and not 3-way merge?**  
A: FWW is deterministic, needs no UI dialogs, simpler. Multi-user editing scenarios are rare for invoicing (mostly serial edits).

**Q: Can we use PowerSync instead of WatermelonDB?**  
A: Yes, but it's a paid SaaS ($). WatermelonDB is open-source, sufficient for MVP.

**Q: What if two devices create invoices with same number offline?**  
A: Backend rejects on unique constraint violation. Mobile must handle renumbering or wait for server numérotation.

**Q: Do we need to sync StockEntry (FIFO entries)?**  
A: No, too volumineuse (millions of records). Only sync summaries via FinishedProduct.stockQuantity.

**Q: Token expires while user is offline. What happens?**  
A: Postpone sync. Auto-retry refresh when network returns. User notified "Session expired, reconnect to continue".

---

## Document Change Log

| Date | Version | Changes |
|------|---------|---------|
| 2024-06-24 | 1.0 | Initial comprehensive spec + diagrams + checklist |

---

**Status:** Pre-implementation (Planning phase)  
**Last updated:** June 24, 2024  
**Author:** Ecosystem Team (echangoInvoice)

For questions or clarifications, reach out to the backend architecture team.
