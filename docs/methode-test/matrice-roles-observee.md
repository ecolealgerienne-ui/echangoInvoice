# Matrice des rôles — **observée**, au 2026-08-09

> Produit par `python3 scripts/banc-matrice-roles.py --matrice`.
>
> ⚠️ **Ceci n'est pas la politique du produit.** C'est ce que le code
> fait, relevé route par route. La politique écrite — le tableau de
> `docs/specs/02-auth.md` — en diverge sur **68 cases**, et ne connaît
> que trois rôles sur cinq.
>
> Ce document existe pour qu'on puisse **arbitrer** : pour chaque écart,
> est-ce le code qui déborde, ou la politique qui n'a jamais été mise à
> jour ? Une fois tranché, il devient la politique — et le banc, un
> détecteur de régression.

« oui » = le garde de rôle laisse passer. Il ne dit pas que le geste
aboutit : l'édition d'une facture, par exemple, reste refusée en aval dès
qu'elle n'est plus au brouillon.

---

## `/admin/audit-logs`

| Route | owner | manager | agent | accountant | superadmin |
|---|---|---|---|---|---|
| `GET /admin/audit-logs` | — | — | — | — | oui |

## `/admin/plans`

| Route | owner | manager | agent | accountant | superadmin |
|---|---|---|---|---|---|
| `GET /admin/plans` | — | — | — | — | oui |
| `PUT /admin/plans/:id` | — | — | — | — | oui |

## `/admin/saas-payments`

| Route | owner | manager | agent | accountant | superadmin |
|---|---|---|---|---|---|
| `GET /admin/saas-payments` | — | — | — | — | oui |
| `GET /admin/saas-payments/summary` | — | — | — | — | oui |
| `POST /admin/saas-payments` | — | — | — | — | oui |

## `/admin/stats`

| Route | owner | manager | agent | accountant | superadmin |
|---|---|---|---|---|---|
| `GET /admin/stats` | — | — | — | — | oui |

## `/admin/subscriptions`

| Route | owner | manager | agent | accountant | superadmin |
|---|---|---|---|---|---|
| `PATCH /admin/subscriptions/:id` | — | — | — | — | oui |

## `/admin/tenants`

| Route | owner | manager | agent | accountant | superadmin |
|---|---|---|---|---|---|
| `DELETE /admin/tenants/:id` | — | — | — | — | oui |
| `GET /admin/tenants` | — | — | — | — | oui |
| `GET /admin/tenants/:id` | — | — | — | — | oui |
| `PATCH /admin/tenants/:id/status` | — | — | — | — | oui |

## `/auth`

| Route | owner | manager | agent | accountant | superadmin |
|---|---|---|---|---|---|
| `POST /auth/invite` | oui | oui | — | — | — |

## `/customers`

| Route | owner | manager | agent | accountant | superadmin |
|---|---|---|---|---|---|
| `DELETE /customers/:id` | oui | — | — | — | — |
| `DELETE /customers/:id/contacts/:contactId` | oui | oui | — | — | — |
| `GET /customers` | oui | oui | oui | oui | — |
| `GET /customers/:id` | oui | oui | oui | oui | — |
| `GET /customers/:id/contacts` | oui | oui | oui | oui | — |
| `GET /customers/cities` | oui | oui | oui | oui | — |
| `POST /customers` | oui | oui | — | — | — |
| `POST /customers/:id/contacts` | oui | oui | — | — | — |
| `PUT /customers/:id` | oui | oui | — | — | — |
| `PUT /customers/:id/contacts/:contactId` | oui | oui | — | — | — |

## `/dashboard`

| Route | owner | manager | agent | accountant | superadmin |
|---|---|---|---|---|---|
| `GET /dashboard/charts/sales` | oui | oui | — | oui | — |
| `GET /dashboard/charts/stock` | oui | oui | — | oui | — |
| `GET /dashboard/stats` | oui | oui | — | oui | — |

## `/deliveries/delivery-notes`

| Route | owner | manager | agent | accountant | superadmin |
|---|---|---|---|---|---|
| `DELETE /deliveries/delivery-notes/:id` | oui | — | — | — | — |
| `GET /deliveries/delivery-notes` | oui | oui | oui | oui | — |
| `GET /deliveries/delivery-notes/:id` | oui | oui | oui | oui | — |
| `GET /deliveries/delivery-notes/:id/pdf` | oui | oui | oui | oui | — |
| `PATCH /deliveries/delivery-notes/:id/signature` | oui | oui | oui | — | — |
| `PATCH /deliveries/delivery-notes/:id/status` | oui | oui | — | — | — |
| `POST /deliveries/delivery-notes` | oui | oui | oui | — | — |
| `POST /deliveries/delivery-notes/:id/create-invoice` | oui | oui | — | — | — |
| `POST /deliveries/delivery-notes/:id/send-email` | oui | oui | — | — | — |
| `PUT /deliveries/delivery-notes/:id` | oui | oui | oui | — | — |

## `/expenses`

| Route | owner | manager | agent | accountant | superadmin |
|---|---|---|---|---|---|
| `DELETE /expenses/:id` | oui | oui | — | — | — |
| `GET /expenses` | oui | oui | oui | oui | — |
| `GET /expenses/:id` | oui | oui | oui | oui | — |
| `GET /expenses/summary` | oui | oui | — | oui | — |
| `PATCH /expenses/:id/approve` | oui | oui | — | — | — |
| `POST /expenses` | oui | oui | oui | — | — |
| `PUT /expenses/:id` | oui | oui | oui | — | — |

## `/export`

| Route | owner | manager | agent | accountant | superadmin |
|---|---|---|---|---|---|
| `GET /export` | oui | oui | — | oui | — |
| `GET /export/:dataset` | oui | oui | — | oui | — |

## `/invoices/credit-notes`

| Route | owner | manager | agent | accountant | superadmin |
|---|---|---|---|---|---|
| `DELETE /invoices/credit-notes/:id` | oui | — | — | — | — |
| `GET /invoices/credit-notes` | oui | oui | oui | oui | — |
| `GET /invoices/credit-notes/:id` | oui | oui | oui | oui | — |
| `GET /invoices/credit-notes/:id/pdf` | oui | oui | oui | oui | — |
| `PATCH /invoices/credit-notes/:id/cancel` | oui | oui | — | — | — |
| `PATCH /invoices/credit-notes/:id/issue` | oui | oui | — | — | — |
| `POST /invoices/credit-notes` | oui | oui | — | — | — |

## `/invoices/payments`

| Route | owner | manager | agent | accountant | superadmin |
|---|---|---|---|---|---|
| `DELETE /invoices/payments/:id` | oui | oui | — | — | — |
| `GET /invoices/payments` | oui | oui | oui | oui | — |
| `GET /invoices/payments/:id` | oui | oui | oui | oui | — |
| `POST /invoices/payments` | oui | oui | — | — | — |

## `/invoices/recurring`

| Route | owner | manager | agent | accountant | superadmin |
|---|---|---|---|---|---|
| `DELETE /invoices/recurring/:id` | oui | — | — | — | — |
| `GET /invoices/recurring` | oui | oui | oui | oui | — |
| `PATCH /invoices/recurring/:id/toggle` | oui | oui | — | — | — |
| `POST /invoices/recurring` | oui | oui | — | — | — |
| `POST /invoices/recurring/:id/generate` | oui | oui | — | — | — |

## `/invoices/sales-invoices`

| Route | owner | manager | agent | accountant | superadmin |
|---|---|---|---|---|---|
| `DELETE /invoices/sales-invoices/:id` | oui | — | — | — | — |
| `GET /invoices/sales-invoices` | oui | oui | oui | oui | — |
| `GET /invoices/sales-invoices/:id` | oui | oui | oui | oui | — |
| `GET /invoices/sales-invoices/:id/pdf` | oui | oui | oui | oui | — |
| `PATCH /invoices/sales-invoices/:id/status` | oui | oui | — | — | — |
| `POST /invoices/sales-invoices` | oui | oui | oui | — | — |
| `POST /invoices/sales-invoices/:id/send-email` | oui | oui | — | — | — |
| `PUT /invoices/sales-invoices/:id` | oui | oui | oui | — | — |

## `/price-lists`

| Route | owner | manager | agent | accountant | superadmin |
|---|---|---|---|---|---|
| `DELETE /price-lists/:id` | oui | oui | — | — | — |
| `GET /price-lists` | oui | oui | oui | oui | — |
| `GET /price-lists/:id` | oui | oui | oui | oui | — |
| `GET /price-lists/for-customer/:customerId` | oui | oui | oui | oui | — |
| `POST /price-lists` | oui | oui | — | — | — |
| `PUT /price-lists/:id` | oui | oui | — | — | — |
| `PUT /price-lists/:id/items` | oui | oui | — | — | — |

## `/production/dashboard`

| Route | owner | manager | agent | accountant | superadmin |
|---|---|---|---|---|---|
| `GET /production/dashboard` | oui | oui | — | oui | — |

## `/production/nomenclatures`

| Route | owner | manager | agent | accountant | superadmin |
|---|---|---|---|---|---|
| `DELETE /production/nomenclatures/:id` | oui | oui | — | — | — |
| `GET /production/nomenclatures` | oui | oui | oui | oui | — |
| `GET /production/nomenclatures/:id` | oui | oui | oui | oui | — |
| `PATCH /production/nomenclatures/:id` | oui | oui | — | — | — |
| `POST /production/nomenclatures` | oui | oui | — | — | — |

## `/production/orders`

| Route | owner | manager | agent | accountant | superadmin |
|---|---|---|---|---|---|
| `GET /production/orders` | oui | oui | oui | oui | — |
| `GET /production/orders/:id` | oui | oui | oui | oui | — |
| `GET /production/orders/:id/movements` | oui | oui | oui | oui | — |
| `PATCH /production/orders/:id/cancel` | oui | oui | — | — | — |
| `PATCH /production/orders/:id/complete` | oui | oui | — | — | — |
| `PATCH /production/orders/:id/start` | oui | oui | — | — | — |
| `POST /production/orders` | oui | oui | — | — | — |
| `POST /production/orders/:id/movements` | oui | oui | oui | — | — |
| `POST /production/orders/:id/movements/batch` | oui | oui | oui | — | — |

## `/products`

| Route | owner | manager | agent | accountant | superadmin |
|---|---|---|---|---|---|
| `DELETE /products/:id` | oui | — | — | — | — |
| `DELETE /products/barcodes/:barcodeId` | oui | oui | — | — | — |
| `DELETE /products/suppliers/:linkId` | oui | oui | — | — | — |
| `GET /products` | oui | oui | oui | oui | — |
| `GET /products/:id` | oui | oui | oui | oui | — |
| `GET /products/:id/barcodes` | oui | oui | oui | oui | — |
| `GET /products/:id/suppliers` | oui | oui | oui | oui | — |
| `GET /products/by-barcode/:code` | oui | oui | oui | oui | — |
| `POST /products` | oui | oui | — | — | — |
| `POST /products/:id/barcodes` | oui | oui | — | — | — |
| `POST /products/:id/suppliers` | oui | oui | — | — | — |
| `PUT /products/:id` | oui | oui | — | — | — |

## `/purchases/purchase-orders`

| Route | owner | manager | agent | accountant | superadmin |
|---|---|---|---|---|---|
| `DELETE /purchases/purchase-orders/:id` | oui | — | — | — | — |
| `GET /purchases/purchase-orders` | oui | oui | oui | oui | — |
| `GET /purchases/purchase-orders/:id` | oui | oui | oui | oui | — |
| `GET /purchases/purchase-orders/:id/pdf` | oui | oui | oui | oui | — |
| `PATCH /purchases/purchase-orders/:id` | oui | oui | — | — | — |
| `PATCH /purchases/purchase-orders/:id/status` | oui | oui | — | — | — |
| `POST /purchases/purchase-orders` | oui | oui | — | — | — |

## `/purchases/reception-bls`

| Route | owner | manager | agent | accountant | superadmin |
|---|---|---|---|---|---|
| `GET /purchases/reception-bls` | oui | oui | oui | oui | — |
| `GET /purchases/reception-bls/:id` | oui | oui | oui | oui | — |
| `GET /purchases/reception-bls/:id/pdf` | oui | oui | oui | oui | — |
| `POST /purchases/reception-bls` | oui | oui | — | — | — |

## `/purchases/vendor-bills`

| Route | owner | manager | agent | accountant | superadmin |
|---|---|---|---|---|---|
| `DELETE /purchases/vendor-bills/:id` | oui | — | — | — | — |
| `GET /purchases/vendor-bills` | oui | oui | oui | oui | — |
| `GET /purchases/vendor-bills/:id` | oui | oui | oui | oui | — |
| `GET /purchases/vendor-bills/:id/pdf` | oui | oui | oui | oui | — |
| `PATCH /purchases/vendor-bills/:id/status` | oui | oui | — | — | — |
| `POST /purchases/vendor-bills` | oui | oui | — | — | — |
| `POST /purchases/vendor-bills/:id/payments` | oui | oui | — | — | — |
| `PUT /purchases/vendor-bills/:id` | oui | oui | — | — | — |

## `/quotes`

| Route | owner | manager | agent | accountant | superadmin |
|---|---|---|---|---|---|
| `DELETE /quotes/:id` | oui | — | — | — | — |
| `GET /quotes` | oui | oui | oui | oui | — |
| `GET /quotes/:id` | oui | oui | oui | oui | — |
| `GET /quotes/:id/pdf` | oui | oui | oui | oui | — |
| `PATCH /quotes/:id/status` | oui | oui | — | — | — |
| `POST /quotes` | oui | oui | oui | — | — |
| `POST /quotes/:id/convert` | oui | oui | — | — | — |
| `POST /quotes/:id/create-bl` | oui | oui | — | — | — |
| `PUT /quotes/:id` | oui | oui | — | — | — |

## `/reports`

| Route | owner | manager | agent | accountant | superadmin |
|---|---|---|---|---|---|
| `GET /reports/aged-balance` | oui | oui | — | oui | — |
| `GET /reports/expenses` | oui | oui | — | oui | — |
| `GET /reports/purchases` | oui | oui | — | oui | — |
| `GET /reports/sales` | oui | oui | — | oui | — |
| `GET /reports/stock` | oui | oui | — | oui | — |
| `GET /reports/tax-summary` | oui | oui | — | oui | — |

## `/search`

| Route | owner | manager | agent | accountant | superadmin |
|---|---|---|---|---|---|
| `GET /search` | oui | oui | oui | oui | — |

## `/settings`

| Route | owner | manager | agent | accountant | superadmin |
|---|---|---|---|---|---|
| `GET /settings` | oui | oui | oui | oui | — |
| `PUT /settings` | oui | — | — | — | — |

## `/stock`

| Route | owner | manager | agent | accountant | superadmin |
|---|---|---|---|---|---|
| `GET /stock/alerts` | oui | oui | oui | oui | — |
| `GET /stock/entries/:rawMaterialId` | oui | oui | oui | oui | — |
| `GET /stock/inventory` | oui | oui | oui | oui | — |
| `PATCH /stock/inventory/:rawMaterialId/threshold` | oui | oui | — | — | — |
| `POST /stock/adjust` | oui | oui | — | — | — |

## `/suppliers`

| Route | owner | manager | agent | accountant | superadmin |
|---|---|---|---|---|---|
| `DELETE /suppliers/:id` | oui | — | — | — | — |
| `DELETE /suppliers/:id/contacts/:contactId` | oui | oui | — | — | — |
| `GET /suppliers` | oui | oui | oui | oui | — |
| `GET /suppliers/:id` | oui | oui | oui | oui | — |
| `GET /suppliers/:id/contacts` | oui | oui | oui | oui | — |
| `POST /suppliers` | oui | oui | — | — | — |
| `POST /suppliers/:id/contacts` | oui | oui | — | — | — |
| `PUT /suppliers/:id` | oui | oui | — | — | — |
| `PUT /suppliers/:id/contacts/:contactId` | oui | oui | — | — | — |

## `/users`

| Route | owner | manager | agent | accountant | superadmin |
|---|---|---|---|---|---|
| `DELETE /users/invitations/:id` | oui | oui | — | — | — |
| `GET /users` | oui | oui | — | oui | — |
| `GET /users/invitations` | oui | oui | — | oui | — |
| `GET /users/quota` | oui | oui | — | oui | — |
| `PATCH /users/:id` | oui | — | — | — | — |

---

## Total, décomposé

| Persona | routes ouvertes | sur |
|---|---|---|
| owner | 147 | 159 |
| manager | 135 | 159 |
| agent | 61 | 159 |
| accountant | 67 | 159 |
| superadmin | 12 | 159 |

Dix routes sont hors matrice : les huit publiques de R023, plus
`GET /auth/me` et `POST /auth/logout` — des routes de session, qu'aucune
politique de rôle ne borne.
