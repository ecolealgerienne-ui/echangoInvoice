# STATUS.md — Echango Invoice · État de l'implémentation

> ⚠️ **Ce fichier n'est plus fiable.** Dernière mise à jour : 2026-06-22.
> Plusieurs de ses lignes se sont révélées fausses en août 2026 : des routes
> annoncées comme fonctionnelles renvoyaient 500, d'autres n'avaient aucun
> écran. Il a conduit à des conclusions erronées avant qu'on ne vérifie dans le
> code (R031).
>
> Pour l'état réel et la suite du travail : **`docs/REPRISE.md`**.
> Pour le positionnement face au marché : **`docs/BENCHMARK.md`**.
> En cas de doute, la source de vérité reste le code.

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
| POST /auth/invite | ✅ | Token 7j, email envoyé, rôle manager/agent |
| POST /auth/accept-invite | ✅ | Crée user + invalide token |

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
| POST /deliveries/delivery-notes/:id/send-email | ✅ | Nodemailer, PDF en pièce jointe |

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
| POST /invoices/sales-invoices/:id/send-email | ✅ | Nodemailer, PDF en pièce jointe |
| GET /invoices/payments | ✅ | |
| POST /invoices/payments | ✅ | Met à jour amountPaid/Due, status paid si soldé |
| Cron overdue | ✅ | 00:01 quotidien |
| Cron rappels email | ✅ | 08:00 quotidien — J+7/J+14/J+21 sur factures impayées |

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
| GET /quotes/:id/pdf | ✅ | Puppeteer A4, NIF/RC, zones signature, archivage ARCHIVES/DEVIS/ |
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

### Vendor Bills / Factures fournisseurs
| Endpoint | Statut | Notes |
|----------|--------|-------|
| GET /purchases/vendor-bills | ✅ | Pagination + filtres |
| POST /purchases/vendor-bills | ✅ | Numérotation VF-YY-###, lock DB, TVA calculée |
| GET /purchases/vendor-bills/:id | ✅ | |
| PATCH /purchases/vendor-bills/:id/status | ✅ | draft → received → paid |
| DELETE /purchases/vendor-bills/:id | ✅ | Draft uniquement |

### Production
| Endpoint | Statut | Notes |
|----------|--------|-------|
| GET /production/nomenclatures | ✅ | BOM — recette par unité produite |
| POST /production/nomenclatures | ✅ | |
| PUT /production/nomenclatures/:id | ✅ | |
| DELETE /production/nomenclatures/:id | ✅ | |
| GET /production/orders | ✅ | |
| POST /production/orders | ✅ | planned → in_progress (réserve stock) |
| PATCH /production/orders/:id/start | ✅ | planned → in_progress |
| PATCH /production/orders/:id/complete | ✅ | in_progress → completed, décrémente stock MP, incrémente stock PF |
| PATCH /production/orders/:id/cancel | ✅ | Libère le stock réservé |
| POST /production/orders/:id/movements | ✅ | mp_consumption, mp_loss (guidé BOM), rejection |
| GET /production/orders/:id/movements | ✅ | Journal des mouvements |

---

## Frontend

| Page | Statut | Notes |
|------|--------|-------|
| Login | ✅ | |
| Dashboard | ✅ | Stats + graphiques |
| Customers | ✅ | CRUD complet + NIF/RC/AI/NIS + adresse livraison + contacts multiples |
| Suppliers | ✅ | CRUD complet + contacts multiples |
| Raw Materials | ✅ | CRUD complet (fusionné dans Products avec type='material') |
| Products | ✅ | CRUD complet + alertes stock + seuil d'alerte |
| Stock | ✅ | Inventaire + alertes + ajustements + cloche header |
| Delivery Notes | ✅ | Création + liste + annulation + bouton PDF |
| Invoices | ✅ | Création + liste + envoi + annulation + bouton PDF |
| Expenses | ✅ | CRUD complet |
| Reports | ✅ | 5 onglets : Ventes / Achats / Dépenses / Stock / Résumé TVA |
| Settings | ✅ | |
| Credit Notes (Avoirs) | ✅ | Création + liste + émettre + annuler |
| Purchase Orders | ✅ | Création + liste (onglet Achats) |
| Reception BLs | ✅ | Création + liste (onglet Achats) |
| Vendor Bills | ✅ | Création + liste + changer statut (onglet Achats) |
| Quotes | ✅ | Création + liste + PDF + convertir en facture |
| Production — BOM | ✅ | Création + liste nomenclatures |
| Production — Ordres | ✅ | Création + démarrer + clôturer + annuler |
| Production — Mouvements | ✅ | Journal + saisie mp_consumption / mp_loss / rejection |

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
| Transactions multi-tables | ✅ | QueryRunner sur opérations FIFO, payment, credit-notes, production |
| FIFO stock | ✅ | decrementFIFO + releaseFIFO |
| Auto-numérotation avec lock DB | ✅ | pg_advisory_xact_lock — FAC, BL, AV, PO, VF |
| Freemium quota check | ✅ | Sur POST /invoices |
| PDF génération | ✅ | Puppeteer — Factures + BL + Devis, archivage ARCHIVES/YYYY/MM/TYPE/ |
| Email envoi | ✅ | Nodemailer — Factures + BL |
| Migrations | ✅ | 29 migrations (1709980000000 → 1750014000000) |

---

## Gaps restants (prochaines priorités)

### 🟠 Fort
| # | Gap | Notes |
|---|-----|-------|
| — | ~~Type de paiement~~ | ✅ Implémenté (paymentMethod + reference, modal frontend) |
| — | ~~Envoi email~~ | ✅ Implémenté (EmailService nodemailer, facture + BL) |
| — | ~~Rappels email~~ | ✅ Implémenté (cron J+7/J+14/J+21) |
| — | ~~Invitation collaborateurs~~ | ✅ Implémenté (/auth/invite + /auth/accept-invite) |

### 🟡 Restant
| # | Gap | Notes |
|---|-----|-------|
| — | ~~Contacts multiples par client~~ | ✅ Implémenté — table `partner_contacts` (migration 1750003000000) |
| — | ~~Adresse livraison sur client~~ | ✅ Implémenté — champs `shippingAddress`, `shippingCity` (migration 1709981200000) |
| — | ~~Migrations pending~~ | ✅ Toutes les migrations sont présentes (1709980000000 → 1750014000000) |
