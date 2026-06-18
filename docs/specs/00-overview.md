# 00 — Project Overview

## Project Name

**echangoInvoice** — Invoicing SaaS for the Algerian market, inspired by Invoice Ninja V5.

---

## Business Model

### Freemium (default on registration)

| Limit | Value |
|-------|-------|
| Invoices per month | 10 |
| Users per tenant | 5 |
| Price | Free |

### Pro

| Limit | Value |
|-------|-------|
| Invoices per month | Unlimited |
| Users per tenant | Unlimited |
| Price | 500 DZD / month |

Upgrade is triggered manually (payment flow TBD). Plan enforcement is handled by `FreemiumGuard` on the API layer — see `docs/specs/01-multi-tenancy.md`.

---

## Target Market

- **Country:** Algeria
- **Currency:** DZD (Algerian Dinar)
- **Language:** French (FR) — i18n structure in place for Arabic
- **Tax:** TVA 19% (configurable in settings)
- **Date display timezone:** `Africa/Algiers`

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | NestJS 10, TypeScript, TypeORM |
| Database | PostgreSQL 15 |
| Frontend | React 18, TypeScript, Tailwind CSS |
| Auth | JWT (access 1h, refresh 7d with rotation) |
| PDF | Puppeteer or pdf-lib (TBD) |
| Email | Nodemailer (SMTP) |
| Container | Docker + Docker Compose |
| Hosting | VPS (OVH / Hetzner) |

---

## 3-Tier Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      FRONTEND                           │
│  React 18 + TypeScript + Tailwind CSS                   │
│  Axios interceptor (auth, errors) · i18n (fr.json)      │
│  React Error Boundary · React Query for data fetching   │
└───────────────────────┬─────────────────────────────────┘
                        │ HTTPS / REST JSON
                        │ /api/v1/...
┌───────────────────────▼─────────────────────────────────┐
│                      BACKEND                            │
│  NestJS 10 · GlobalPrefix /api/v1                       │
│  Helmet · CORS · ValidationPipe · Throttler             │
│  JwtGuard · TenantGuard · RolesGuard · FreemiumGuard    │
│  AllExceptionsFilter (global) · AuditInterceptor        │
│                                                         │
│  19+ entities across 12+ modules                        │
│  Every entity carries tenantId (multi-tenant shared DB) │
└───────────────────────┬─────────────────────────────────┘
                        │ TypeORM
┌───────────────────────▼─────────────────────────────────┐
│                   POSTGRESQL 15                         │
│  Shared schema · tenantId column on every table         │
│  Migrations only (synchronize: false in production)     │
│  FIFO stock entries · Advisory locks for sequences      │
└─────────────────────────────────────────────────────────┘
```

---

## Entity Count — Evolution Note

The original specs described **15 entities**. The current design has **19+ entities** due to the addition of multi-tenancy and quoting features:

| Added Entity | Reason |
|--------------|--------|
| `Tenant` | Multi-tenant SaaS — each company is a tenant |
| `Subscription` | Freemium / Pro plan tracking per tenant |
| `Quote` | Pre-invoice quoting workflow |
| `QuoteItem` | Line items for quotes (mirrors SalesInvoiceItem) |

All 19+ entities carry `tenantId` as a mandatory foreign key.

---

## NestJS Module Structure

```
src/
├─ main.ts                        ← Helmet, CORS, ValidationPipe, GlobalPrefix /api/v1
├─ app.module.ts
│
├─ auth/                          ← Register, login, refresh, logout, invite
├─ tenants/                       ← Tenant CRUD (admin), onboarding logic
├─ subscriptions/                 ← Freemium/Pro plan, limit enforcement
├─ users/                         ← User CRUD within a tenant
│
├─ suppliers/                     ← Supplier + RawMaterial
├─ raw-materials/
│
├─ purchases/
│  ├─ purchase-orders/            ← PO with advisory lock numbering
│  ├─ purchase-order-items/
│  └─ reception-bls/              ← Reception BL → creates StockEntry
│
├─ stock/                         ← FIFO logic, StockEntry, InventorySummary, alerts
│
├─ customers/                     ← Customer CRUD
│
├─ quotes/                        ← Quote + QuoteItem (new)
│  ├─ quotes/
│  └─ quote-items/
│
├─ deliveries/
│  ├─ delivery-notes/             ← BL vente → decrements stock FIFO
│  ├─ delivery-note-items/
│  └─ pdf.service.ts
│
├─ invoices/
│  ├─ sales-invoices/             ← Auto-calculates TVA, advisory lock numbering
│  ├─ sales-invoice-items/
│  ├─ payments/                   ← Updates amountPaid/Due, transitions stock
│  ├─ pdf.service.ts
│  └─ email.service.ts
│
├─ expenses/
├─ dashboard/
├─ reports/
├─ settings/                      ← TVA rate, number formats, logo, etc.
│
├─ common/
│  ├─ constants.ts                ← TVA_RATE, DATE_FORMAT, etc.
│  ├─ decorators/
│  │  ├─ current-user.decorator.ts
│  │  └─ roles.decorator.ts
│  ├─ filters/
│  │  └─ exception.filter.ts      ← AllExceptionsFilter global
│  ├─ guards/
│  │  ├─ jwt.guard.ts
│  │  ├─ tenant.guard.ts          ← Injects tenantId from JWT into request
│  │  ├─ roles.guard.ts
│  │  └─ freemium.guard.ts        ← Checks subscription limits
│  ├─ interceptors/
│  │  └─ audit.interceptor.ts     ← createdBy/updatedBy auto
│  └─ pipes/
│     └─ validation.pipe.ts
│
├─ database/
│  ├─ migrations/                 ← One migration per schema change (R002)
│  └─ seeds/
│
└─ config/
   ├─ database.config.ts          ← requireEnv() (R003)
   ├─ jwt.config.ts
   ├─ storage.config.ts
   └─ email.config.ts
```

---

## Deployment Target

```
VPS (OVH / Hetzner)
└── Docker Compose
    ├── app (NestJS — node:20-alpine, non-root user)
    ├── db  (PostgreSQL 15)
    └── nginx (reverse proxy, TLS termination)
```

**Pre-start checklist:**
- `.env` absent from git (`.gitignore`)
- Migrations run before app start (`npm run migration:run`)
- `synchronize: false` in TypeORM production config
- No secrets in logs
- DB backup configured

---

## Key Architectural Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| Multi-tenancy | Shared DB + tenantId column | Simpler ops, acceptable for current scale |
| Stock | FIFO with status transitions | Accurate COGS, auditability |
| Numbering | Advisory lock + sequential | No duplicates under concurrent load |
| PDF archiving | `ARCHIVES/YYYY/MM/TYPE/` | Structured, predictable, easy backup |
| Auth | JWT + refresh rotation | Stateless, secure, standard |
| Freemium enforcement | Server-side guard | Cannot be bypassed by client |
