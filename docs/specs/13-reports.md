# 13 — Reports (Rapports)

> **Invariants concernés :** R007, R008, R010, R014, R018, R019

---

## Principes

- Tous les rapports sont scopés par `tenantId` extrait du JWT
- Tous les calculs sont effectués **côté backend uniquement** (R008)
- Les exports PDF sont archivés au chemin imposé (R014)
- Les exports CSV utilisent l'encodage UTF-8 BOM pour la compatibilité Excel (locale française)
- `dateFrom` et `dateTo` sont inclusifs, formatés `YYYY-MM-DD`

---

## Endpoints

### GET /api/v1/reports/sales

Rapport de ventes sur une période.

**Query params :** `dateFrom` (requis), `dateTo` (requis)

**Response 200 :**
```json
{
  "data": {
    "period": {
      "dateFrom": "2024-06-01",
      "dateTo": "2024-06-30"
    },
    "summary": {
      "totalRevenue": 485000.00,
      "totalTax": 92150.00,
      "totalHT": 392850.00,
      "invoiceCount": 38,
      "paidCount": 20,
      "unpaidCount": 18,
      "averageInvoiceValue": 12763.16,
      "totalAmountPaid": 350000.00,
      "totalAmountDue": 135000.00
    },
    "byStatus": {
      "draft": { "count": 3, "total": 35000.00 },
      "sent": { "count": 8, "total": 82000.00 },
      "partial": { "count": 5, "total": 65000.00 },
      "paid": { "count": 20, "total": 268000.00 },
      "overdue": { "count": 2, "total": 35000.00 },
      "cancelled": { "count": 0, "total": 0.00 }
    },
    "byCustomer": [
      {
        "customerId": "uuid-1",
        "name": "Client A SARL",
        "invoiceCount": 8,
        "totalRevenue": 95000.00,
        "amountPaid": 95000.00,
        "amountDue": 0.00
      }
    ],
    "byPaymentMethod": {
      "cash": 120000.00,
      "bank_transfer": 280000.00,
      "cheque": 85000.00,
      "other": 0.00
    },
    "details": [
      {
        "id": "inv-uuid-1",
        "invoiceNumber": "FAC-24-001",
        "customerName": "Client A SARL",
        "invoiceDate": "2024-06-01",
        "dueDate": "2024-07-01",
        "status": "paid",
        "totalAmount": 12500.00,
        "amountPaid": 12500.00,
        "amountDue": 0.00
      }
    ]
  },
  "pagination": {
    "total": 38,
    "page": 1,
    "limit": 20
  }
}
```

---

### GET /api/v1/reports/purchases

Rapport des achats sur une période.

**Query params :** `dateFrom` (requis), `dateTo` (requis)

**Response 200 :**
```json
{
  "data": {
    "period": {
      "dateFrom": "2024-06-01",
      "dateTo": "2024-06-30"
    },
    "summary": {
      "totalPurchaseCost": 210000.00,
      "receptionCount": 12,
      "purchaseOrderCount": 10,
      "averageOrderValue": 21000.00
    },
    "bySupplier": [
      {
        "supplierId": "sup-uuid-1",
        "name": "Fournisseur X",
        "orderCount": 7,
        "totalAmount": 130000.00
      },
      {
        "supplierId": "sup-uuid-2",
        "name": "Fournisseur Y",
        "orderCount": 3,
        "totalAmount": 80000.00
      }
    ],
    "byRawMaterial": [
      {
        "rawMaterialId": "mat-uuid-1",
        "name": "Matière première A",
        "unit": "kg",
        "totalQuantityReceived": 3000.00,
        "totalCost": 130000.00,
        "averageCostPerUnit": 43.33
      }
    ],
    "details": [
      {
        "id": "rec-uuid-1",
        "blNumber": "BL-REC-24-001",
        "supplierName": "Fournisseur X",
        "receptionDate": "2024-06-03",
        "totalAmount": 45000.00,
        "status": "completed"
      }
    ]
  },
  "pagination": {
    "total": 12,
    "page": 1,
    "limit": 20
  }
}
```

---

### GET /api/v1/reports/expenses

Rapport des dépenses sur une période, avec filtre optionnel par catégorie.

**Query params :** `dateFrom` (requis), `dateTo` (requis), `category` (optionnel)

**Response 200 :**
```json
{
  "data": {
    "period": {
      "dateFrom": "2024-06-01",
      "dateTo": "2024-06-30"
    },
    "summary": {
      "totalExpenses": 98500.00,
      "approvedExpenses": 75000.00,
      "pendingExpenses": 23500.00,
      "expenseCount": 23,
      "approvedCount": 17,
      "pendingCount": 6,
      "averageExpense": 4282.61
    },
    "byCategory": {
      "loyer": { "total": 45000.00, "count": 1 },
      "utilities": { "total": 12000.00, "count": 3 },
      "transport": { "total": 15000.00, "count": 8 },
      "rh": { "total": 20000.00, "count": 4 },
      "maintenance": { "total": 6500.00, "count": 7 },
      "other": { "total": 0.00, "count": 0 }
    },
    "details": [
      {
        "id": "exp-uuid-1",
        "expenseDate": "2024-06-10",
        "description": "Loyer local commercial Juin 2024",
        "category": "loyer",
        "amount": 45000.00,
        "isApproved": true,
        "approvedBy": "manager-uuid"
      }
    ]
  },
  "pagination": {
    "total": 23,
    "page": 1,
    "limit": 20
  }
}
```

---

### GET /api/v1/reports/stock

Inventaire courant — état actuel du stock, pas de filtre par période.

**Response 200 :**
```json
{
  "data": {
    "generatedAt": "2024-06-18T10:00:00Z",
    "summary": {
      "totalStockValue": 320000.00,
      "totalAvailableQuantity": 4850.00,
      "availableEntries": 112,
      "reservedEntries": 28,
      "soldEntries": 5,
      "adjustedEntries": 2,
      "expiringSoon": 3,
      "lowStockItems": 2
    },
    "details": [
      {
        "rawMaterialId": "mat-uuid-1",
        "name": "Matière première A",
        "unit": "kg",
        "availableQuantity": 2000.00,
        "reservedQuantity": 500.00,
        "totalQuantity": 2500.00,
        "stockValue": 175000.00,
        "averageCostPerUnit": 70.00,
        "alertThreshold": 100.00,
        "isLowStock": false,
        "oldestEntryDate": "2024-03-01",
        "nearestExpiryDate": "2024-08-15"
      },
      {
        "rawMaterialId": "mat-uuid-2",
        "name": "Matière première B",
        "unit": "kg",
        "availableQuantity": 80.00,
        "reservedQuantity": 50.00,
        "totalQuantity": 130.00,
        "stockValue": 8020.00,
        "averageCostPerUnit": 61.69,
        "alertThreshold": 100.00,
        "isLowStock": true,
        "oldestEntryDate": "2024-05-15",
        "nearestExpiryDate": "2024-06-23"
      }
    ]
  }
}
```

---

### GET /api/v1/reports/export

Export binaire (PDF ou CSV) d'un rapport.

**Query params :**
- `type` : `sales` | `purchases` | `expenses` (requis)
- `format` : `pdf` | `csv` (requis)
- `dateFrom` : `YYYY-MM-DD` (requis)
- `dateTo` : `YYYY-MM-DD` (requis)

**Response :**
```
HTTP 200
Content-Type: application/pdf              (si format=pdf)
Content-Type: text/csv; charset=utf-8     (si format=csv)
Content-Disposition: attachment; filename="rapport-sales-2024-06-01-2024-06-30.pdf"
<binary stream>
```

---

## Archivage PDF (R014)

```typescript
// Chemin d'archivage imposé
const path = `ARCHIVES/${year}/${month}/RAPPORTS/report-${dateFrom}-${dateTo}.pdf`;

// Exemples :
// ARCHIVES/2024/06/RAPPORTS/report-2024-06-01-2024-06-30.pdf
// ARCHIVES/2024/06/RAPPORTS/report-purchases-2024-06-01-2024-06-30.pdf
// ARCHIVES/2024/06/RAPPORTS/report-expenses-2024-06-01-2024-06-30.pdf
```

---

## Export CSV — spécifications

```typescript
// UTF-8 BOM pour compatibilité Excel (locale française)
const BOM = '﻿';
const csvContent = BOM + headers.join(';') + '\n' + rows.map(r => r.join(';')).join('\n');

// Séparateur : point-virgule (;) — standard FR Excel
// Format date : DD/MM/YYYY
// Format montant : 1234,56 (virgule décimale, pas de séparateur milliers)
// Encodage : UTF-8 avec BOM
```

**Colonnes export ventes (CSV) :**
```
N° Facture;Client;Date;Échéance;Statut;Montant HT;TVA;Montant TTC;Payé;Solde dû
FAC-24-001;Client A SARL;15/06/2024;15/07/2024;Payée;392850,00;92150,00;485000,00;485000,00;0,00
```

**Colonnes export achats (CSV) :**
```
N° BL Réception;Fournisseur;Date;Matière;Quantité;Unité;Prix unit.;Total
BL-REC-24-001;Fournisseur X;03/06/2024;Matière A;3000,00;kg;43,33;130000,00
```

**Colonnes export dépenses (CSV) :**
```
Date;Description;Catégorie;Montant;Approuvée;Approuvée par
10/06/2024;Loyer local commercial Juin 2024;Loyer;45000,00;Oui;M. Manager
```

---

## Sécurité & Multi-tenancy

- Toutes les queries filtrent `tenantId` depuis le JWT
- Guards : `@UseGuards(JwtGuard, RolesGuard)` sur tous les endpoints
- Roles : OWNER, MANAGER → accès complet ; AGENT → accès refusé (`403`)
- Les fichiers exportés ne sont jamais accessibles sans authentification
