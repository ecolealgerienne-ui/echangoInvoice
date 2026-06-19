# STATUS.md — Echango Invoice · État de l'implémentation

> Dernière mise à jour : 2026-06-19

## Légende

- ✅ Implémenté et fonctionnel
- ⚠️ Partiel / workaround actif
- ❌ Non implémenté
- 🚧 En cours

---

## Backend

### Auth (spec 01)
| Endpoint | Statut | Notes |
|----------|--------|-------|
| POST /auth/login | ✅ | JWT + refresh token |
| POST /auth/refresh | ✅ | Rotation refresh token |
| POST /auth/logout | ✅ | Invalide refresh token |
| GET /auth/me | ✅ | Retourne profil user depuis JWT |
| POST /auth/invite | ❌ | Non implémenté |
| POST /auth/accept-invite | ❌ | Non implémenté |

### Customers (spec 02)
| Endpoint | Statut | Notes |
|----------|--------|-------|
| GET /customers | ✅ | Pagination + search |
| POST /customers | ✅ | Champs NIF / RC / AI / NIS inclus |
| GET /customers/:id | ✅ | |
| PUT /customers/:id | ✅ | |
| DELETE /customers/:id | ✅ | Soft delete |
| Champs légaux (NIF/RC/AI/NIS) | ✅ | Migration 1709980900000 |

### Suppliers (spec 03)
| Endpoint | Statut | Notes |
|----------|--------|-------|
| GET /suppliers | ✅ | Pagination + search |
| POST /suppliers | ✅ | |
| GET /suppliers/:id | ✅ | |
| PUT /suppliers/:id | ✅ | |
| DELETE /suppliers/:id | ✅ | Soft delete |

### Raw Materials (spec 04)
| Endpoint | Statut | Notes |
|----------|--------|-------|
| GET /raw-materials | ✅ | Pagination + search |
| POST /raw-materials | ✅ | |
| GET /raw-materials/:id | ✅ | |
| PUT /raw-materials/:id | ✅ | |
| DELETE /raw-materials/:id | ✅ | Soft delete |

### Products / Produits finis (spec 05)
| Endpoint | Statut | Notes |
|----------|--------|-------|
| GET /products | ✅ | |
| POST /products | ✅ | |
| PUT /products/:id | ✅ | |
| DELETE /products/:id | ✅ | Soft delete |

### Stock (spec 06)
| Endpoint | Statut | Notes |
|----------|--------|-------|
| GET /stock/inventory | ✅ | |
| GET /stock/alerts | ✅ | |
| POST /stock/adjust | ✅ | |
| PATCH /stock/inventory/:id/threshold | ✅ | |
| `stock_entries.deletedAt` column | ⚠️ | Migration non appliquée — requêtes SQL omettent ce filtre en attendant |

### Purchases (spec 07)
| Endpoint | Statut | Notes |
|----------|--------|-------|
| GET /purchases/orders | ✅ | |
| POST /purchases/orders | ✅ | |
| GET /purchases/orders/:id | ✅ | |
| PATCH /purchases/orders/:id/status | ✅ | |
| DELETE /purchases/orders/:id | ✅ | |
| GET /purchases/reception-bls | ✅ | |
| POST /purchases/reception-bls | ✅ | Crée StockEntry + met à jour InventorySummary |
| GET /purchases/reception-bls/:id | ✅ | |

### Deliveries / BL Vente (spec 08)
| Endpoint | Statut | Notes |
|----------|--------|-------|
| GET /deliveries/delivery-notes | ✅ | |
| POST /deliveries/delivery-notes | ✅ | Décrémente stock FIFO, status → reserved |
| GET /deliveries/delivery-notes/:id | ✅ | |
| PUT /deliveries/delivery-notes/:id | ✅ | Draft uniquement, libère + recalcule FIFO |
| PATCH /deliveries/delivery-notes/:id/status | ✅ | Transitions draft→sent→signed→delivered |
| PATCH /deliveries/delivery-notes/:id/signature | ✅ | |
| DELETE /deliveries/delivery-notes/:id | ✅ | Draft uniquement, libère stock |
| GET /deliveries/delivery-notes/:id/pdf | ✅ | Puppeteer A4, NIF/RC, zones signature, archivage ARCHIVES/ |
| POST /deliveries/delivery-notes/:id/send-email | ❌ | Email non implémenté |

### Invoices (spec 09)
| Endpoint | Statut | Notes |
|----------|--------|-------|
| GET /invoices/sales-invoices | ✅ | |
| POST /invoices/sales-invoices | ✅ | Auto-calcule TVA, quota freemium |
| GET /invoices/sales-invoices/:id | ✅ | |
| PUT /invoices/sales-invoices/:id | ✅ | Draft uniquement |
| PATCH /invoices/sales-invoices/:id/status | ✅ | |
| DELETE /invoices/sales-invoices/:id | ✅ | Draft uniquement |
| GET /invoices/sales-invoices/:id/pdf | ✅ | Puppeteer A4, NIF/RC client+société, totaux HT/TVA/TTC, archivage |
| POST /invoices/sales-invoices/:id/send-email | ❌ | Email non implémenté |
| GET /invoices/payments | ✅ | |
| POST /invoices/payments | ✅ | Met à jour amountPaid/Due, status paid si soldé |
| Cron overdue | ✅ | 00:01 quotidien |

### Credit Notes / Avoirs (nouveau)
| Endpoint | Statut | Notes |
|----------|--------|-------|
| GET /invoices/credit-notes | ✅ | Pagination |
| POST /invoices/credit-notes | ✅ | Numérotation AV-YY-###, lock DB, TVA calculée |
| GET /invoices/credit-notes/:id | ✅ | |
| PATCH /invoices/credit-notes/:id/issue | ✅ | draft → issued |
| PATCH /invoices/credit-notes/:id/cancel | ✅ | |
| DELETE /invoices/credit-notes/:id | ✅ | Draft uniquement |

### Quotes / Devis (spec 10)
| Endpoint | Statut | Notes |
|----------|--------|-------|
| GET /quotes | ✅ | |
| POST /quotes | ✅ | |
| GET /quotes/:id | ✅ | |
| PUT /quotes/:id | ✅ | |
| PATCH /quotes/:id/status | ✅ | |
| DELETE /quotes/:id | ✅ | |
| POST /quotes/:id/convert-to-invoice | ✅ | |
| GET /quotes/:id/pdf | ❌ | PDF non implémenté (service PDF disponible, template à créer) |
| POST /quotes/:id/send-email | ❌ | Email non implémenté |
| Cron expired | ✅ | 00:05 quotidien |

### Expenses (spec 11)
| Endpoint | Statut | Notes |
|----------|--------|-------|
| GET /expenses | ✅ | |
| POST /expenses | ✅ | |
| GET /expenses/:id | ✅ | |
| PUT /expenses/:id | ✅ | |
| PATCH /expenses/:id/approve | ✅ | |
| DELETE /expenses/:id | ✅ | |
| GET /expenses/summary | ✅ | |

### Dashboard (spec 12)
| Endpoint | Statut | Notes |
|----------|--------|-------|
| GET /dashboard/stats | ✅ | |
| GET /dashboard/charts/sales | ✅ | |
| GET /dashboard/charts/stock | ✅ | |

### Reports (spec 13)
| Endpoint | Statut | Notes |
|----------|--------|-------|
| GET /reports/sales | ✅ | |
| GET /reports/purchases | ✅ | |
| GET /reports/expenses | ✅ | |
| GET /reports/stock | ✅ | |
| GET /reports/tax-summary | ✅ | TVA collectée par taux + par mois (déclaration DGI) |

### Settings (spec 14)
| Endpoint | Statut | Notes |
|----------|--------|-------|
| GET /settings | ✅ | |
| PUT /settings | ✅ | |

---

## Frontend

| Page | Statut | Notes |
|------|--------|-------|
| Login | ✅ | |
| Dashboard | ✅ | Stats + graphiques |
| Customers | ✅ | CRUD complet + champs NIF/RC/AI/NIS |
| Suppliers | ✅ | CRUD complet |
| Raw Materials | ✅ | CRUD complet |
| Products | ✅ | CRUD complet |
| Stock | ✅ | Inventaire + alertes + ajustements |
| Delivery Notes | ✅ | Création + liste + annulation + bouton PDF |
| Invoices | ✅ | Création + liste + envoi + annulation + bouton PDF |
| Expenses | ✅ | CRUD complet |
| Reports | ✅ | 5 onglets : Ventes / Achats / Dépenses / Stock / Résumé TVA |
| Settings | ✅ | |
| Credit Notes (Avoirs) | ❌ | Backend prêt, page frontend manquante |
| Purchase Orders | ❌ | Manquant — nécessaire pour remplir le stock |
| Reception BLs | ❌ | Manquant — nécessaire pour remplir le stock |
| Quotes | ❌ | Manquant |

---

## Infrastructure

| Composant | Statut | Notes |
|-----------|--------|-------|
| Multi-tenancy (R020) | ✅ | tenantId dans chaque query |
| Auth JWT + refresh | ✅ | Rotation à chaque usage |
| AllExceptionsFilter Fastify | ✅ | Format { statusCode, message } |
| Audit trail createdBy/updatedBy | ✅ | Via AuditInterceptor |
| ValidationPipe whitelist | ✅ | |
| Helmet + CORS | ✅ | |
| Rate limiting /auth | ✅ | @nestjs/throttler |
| Soft delete filtré | ✅ | deletedAt IS NULL sur toutes les queries |
| Transactions multi-tables | ✅ | QueryRunner sur opérations FIFO, payment, credit-notes |
| FIFO stock | ✅ | decrementFIFO + releaseFIFO |
| Auto-numérotation avec lock DB | ✅ | pg_advisory_xact_lock — FAC, BL, AV, PO |
| Freemium quota check | ✅ | Sur POST /invoices |
| PDF génération | ✅ | Puppeteer — Factures + BL, archivage ARCHIVES/YYYY/MM/TYPE/ |
| PDF Devis | ❌ | Service disponible, template à créer |
| Email envoi | ❌ | |
| Migrations pending | ⚠️ | Exécuter `npm run migration:run` (stock_entries.deletedAt + NIF/RC + credit_notes) |

---

## Gaps restants (prochaines priorités)

### 🟠 Fort
| # | Gap | Notes |
|---|-----|-------|
| 1 | **Page frontend Avoirs** | Backend 100% prêt, juste la page React à créer |
| 2 | **Type de paiement** (virement/chèque/espèces) | Champ `paymentType` + `reference` sur Payment |
| 3 | **Envoi email** | SMTP configuré, templates + service à créer |
| 4 | **Rappels email automatiques** | Cron J+7/J+14/J+21 sur factures impayées |

### 🟡 Moyen
| # | Gap | Notes |
|---|-----|-------|
| 5 | **Pages frontend Achats** | Purchase Orders + Reception BL — pour alimenter le stock |
| 6 | **Page frontend Devis** | Quotes — backend prêt |
| 7 | **PDF Devis** | `InvoicePdfService.generateQuotePdf()` à ajouter |
| 8 | **Invitation collaborateurs** | POST /auth/invite + POST /auth/accept-invite |
| 9 | **Contacts multiples par client** | Ajouter table `customer_contacts` |
| 10 | **Adresse livraison sur client** | Champs `shippingAddress`, `shippingCity` |
| 11 | **Migrations pending** | `npm run migration:run` à lancer en environnement avec DB |
