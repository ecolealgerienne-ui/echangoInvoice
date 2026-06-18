# STATUS V0 — Echango Invoice

> Dernière mise à jour : 2026-06-18
> Branche active : `claude/trusting-meitner-0el8xk`

---

## Légende

| Symbole | Signification |
|---------|--------------|
| ✅ | Terminé, poussé |
| 🔄 | En cours |
| ⏳ | À faire |
| ❌ | Bloqué |

---

## Backend — Modules API

| # | Module | Entités | Endpoints | Migration | Statut |
|---|--------|---------|-----------|-----------|--------|
| 00 | Scaffolding | — | main.ts, app.module, config, guards, filters | — | ✅ |
| 01 | Auth | User, Tenant, Subscription, RefreshToken | POST /auth/register, login, refresh, logout | ✅ 1709980000000 | ✅ |
| 02 | Suppliers | Supplier, RawMaterial | CRUD /suppliers + /raw-materials | ✅ 1709980100000 | ✅ |
| 03 | Customers | Customer, FinishedProduct | CRUD /customers + /products | ✅ 1709980200000 | ✅ |
| 04 | Purchases | PurchaseOrder, PurchaseOrderItem, ReceptionBL | CRUD /purchases + /reception-bls | ✅ 1709980300000 | ✅ |
| 05 | Stock | StockEntry, InventorySummary | /stock/inventory, /stock/alerts, /stock/adjust | ✅ (dans 04) | ⏳ endpoints |
| 06 | Quotes | Quote, QuoteItem | CRUD /quotes + POST /quotes/:id/convert | ⏳ | ⏳ |
| 07 | Deliveries | DeliveryNote, DeliveryNoteItem | CRUD /deliveries + PDF | ⏳ | ⏳ |
| 08 | Invoices | SalesInvoice, SalesInvoiceItem | CRUD /invoices + send-email | ⏳ | ⏳ |
| 09 | Payments | Payment | POST /payments + cancel | ⏳ | ⏳ |
| 10 | Expenses | Expense | CRUD /expenses + approve | ⏳ | ⏳ |
| 11 | Dashboard | — | GET /dashboard/stats, /charts/* | ⏳ | ⏳ |
| 12 | Reports | — | GET /reports/* + export CSV/PDF | ⏳ | ⏳ |
| 13 | Settings | Settings, TaxRateConfig | GET/PUT /settings | ⏳ | ⏳ |

---

## Infrastructure

| Élément | Statut | Notes |
|---------|--------|-------|
| package.json / tsconfig / nest-cli | ✅ | NestJS 10, TypeORM 0.3, PG 14+ |
| Helmet + CORS + ValidationPipe | ✅ | main.ts |
| AllExceptionsFilter global | ✅ | PG 23505→409, 23503→422 |
| JWT access (1h) + refresh (7j) rotation | ✅ | |
| JwtGuard + RolesGuard + @CurrentUser | ✅ | |
| AuditInterceptor (createdBy/updatedBy) | ✅ | |
| i18n/fr.json (toutes les clés d'erreur) | ✅ en cours | À compléter au fil des modules |
| Swagger /api/docs | ✅ | |
| Migration InitialSchema | ✅ | tenants, subscriptions, users, refresh_tokens |
| Docker / docker-compose | ⏳ | |
| .env.example | ✅ | |

---

## Frontend

| Élément | Statut |
|---------|--------|
| Projet React 19 + Vite | ⏳ |
| i18n (react-i18next) | ⏳ |
| Axios interceptor (401 → refresh → retry) | ⏳ |
| React Error Boundary | ⏳ |
| Charte graphique Echango (Tailwind tokens) | ⏳ En attente des fichiers Echango |

---

## Side Effects implémentés

| Trigger | Side effect | Statut |
|---------|-------------|--------|
| POST /auth/register | Tenant + Subscription + User en transaction | ✅ |
| POST /purchases/reception-bls | StockEntry + InventorySummary | ✅ |
| POST /deliveries/delivery-notes | Décrémente stock FIFO + entries → reserved | ⏳ |
| POST /invoices/sales-invoices/:id/send-email | PDF + email + status → sent | ⏳ |
| POST /invoices/payments | amountPaid/Due + status paid + entries → sold | ⏳ |
| POST /quotes/:id/convert-to-invoice | SalesInvoice + quota freemium check | ⏳ |

---

## Prochaine étape

⏳ **Module Devis** (Quote + QuoteItem + convert-to-invoice)
