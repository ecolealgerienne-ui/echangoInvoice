# 12 — Dashboard

> **Invariants concernés :** R007, R008, R010, R018, R019

---

## Principes

- Toutes les données sont scopées par `tenantId` extrait du JWT
- Tous les calculs sont effectués **côté backend uniquement** (R008)
- Les montants financiers utilisent `decimal(12, 2)` — jamais de `parseFloat` intermédiaire
- Les dates retournées sont en UTC ; l'affichage en `Africa/Algiers` est géré par le frontend (R009)

---

## Endpoints

### GET /api/v1/dashboard/stats

Retourne les KPIs complets pour le mois demandé.

**Query params :** `month` (format `YYYY-MM`, optionnel — défaut : mois courant)

**Formules de calcul :**
```
grossMargin        = totalRevenue(TTC) - purchaseCost
netProfit          = grossMargin - totalExpenses(approved only)
grossMarginPercent = (grossMargin / totalRevenue) × 100  ← 0 si totalRevenue = 0
```

**Response 200 :**
```json
{
  "data": {
    "period": {
      "month": "2024-06",
      "dateFrom": "2024-06-01",
      "dateTo": "2024-06-30"
    },
    "sales": {
      "totalRevenue": 485000.00,
      "invoiceCount": 38,
      "byStatus": {
        "draft": 3,
        "sent": 8,
        "partial": 5,
        "paid": 20,
        "overdue": 2,
        "cancelled": 0
      },
      "averageInvoiceValue": 12763.16,
      "topCustomers": [
        { "customerId": "uuid-1", "name": "Client A SARL", "total": 95000.00 },
        { "customerId": "uuid-2", "name": "Client B EURL", "total": 72000.00 }
      ]
    },
    "purchases": {
      "totalPurchaseCost": 210000.00,
      "receptionCount": 12,
      "bySupplier": [
        { "supplierId": "sup-uuid-1", "name": "Fournisseur X", "total": 130000.00 },
        { "supplierId": "sup-uuid-2", "name": "Fournisseur Y", "total": 80000.00 }
      ]
    },
    "stock": {
      "totalStockValue": 320000.00,
      "totalEntries": 145,
      "availableEntries": 112,
      "reservedEntries": 28,
      "soldEntries": 5,
      "lowStockItems": [
        {
          "rawMaterialId": "mat-uuid-1",
          "name": "Matière première A",
          "availableQuantity": 50.00,
          "unit": "kg",
          "alertThreshold": 100.00
        }
      ],
      "expiringItems": [
        {
          "stockEntryId": "entry-uuid-1",
          "rawMaterialId": "mat-uuid-2",
          "name": "Matière première B",
          "quantity": 200.00,
          "unit": "kg",
          "expiresAt": "2024-06-23",
          "daysUntilExpiry": 5
        }
      ]
    },
    "expenses": {
      "totalExpenses": 98500.00,
      "approvedExpenses": 75000.00,
      "pendingExpenses": 23500.00,
      "byCategory": {
        "loyer": 45000.00,
        "utilities": 12000.00,
        "transport": 15000.00,
        "rh": 20000.00,
        "maintenance": 6500.00,
        "other": 0.00
      }
    },
    "profit": {
      "grossMargin": 275000.00,
      "grossMarginPercent": 56.70,
      "netProfit": 200000.00,
      "netProfitPercent": 41.24
    },
    "alerts": {
      "expiringStockCount": 3,
      "unpaidInvoicesCount": 10,
      "unpaidInvoicesTotal": 185000.00,
      "lowStockCount": 2,
      "overdueInvoicesCount": 2,
      "overdueInvoicesTotal": 34000.00
    }
  }
}
```

---

### GET /api/v1/dashboard/charts/sales

Données formatées pour les graphiques de ventes.

**Query params :** `month` (format `YYYY-MM`, optionnel — défaut : mois courant)

**Response 200 :**
```json
{
  "data": {
    "period": {
      "month": "2024-06",
      "dateFrom": "2024-06-01",
      "dateTo": "2024-06-30"
    },
    "byDate": [
      { "date": "2024-06-01", "revenue": 12000.00, "invoiceCount": 2 },
      { "date": "2024-06-02", "revenue": 0.00, "invoiceCount": 0 },
      { "date": "2024-06-03", "revenue": 28500.00, "invoiceCount": 3 },
      { "date": "2024-06-04", "revenue": 15000.00, "invoiceCount": 1 },
      "..."
    ],
    "byCustomer": [
      {
        "customerId": "uuid-1",
        "name": "Client A SARL",
        "revenue": 95000.00,
        "invoiceCount": 8,
        "percent": 19.59
      },
      {
        "customerId": "uuid-2",
        "name": "Client B EURL",
        "revenue": 72000.00,
        "invoiceCount": 5,
        "percent": 14.85
      }
    ],
    "byPaymentMethod": {
      "cash": 120000.00,
      "bank_transfer": 280000.00,
      "cheque": 85000.00,
      "other": 0.00
    }
  }
}
```

---

### GET /api/v1/dashboard/charts/stock

Répartition de l'inventaire, toutes périodes confondues (état actuel).

**Response 200 :**
```json
{
  "data": {
    "generatedAt": "2024-06-18T10:00:00Z",
    "totalStockValue": 320000.00,
    "totalQuantity": 4850.00,
    "byRawMaterial": [
      {
        "rawMaterialId": "mat-uuid-1",
        "name": "Matière première A",
        "unit": "kg",
        "availableQuantity": 2000.00,
        "reservedQuantity": 500.00,
        "totalQuantity": 2500.00,
        "stockValue": 175000.00,
        "averageCostPerUnit": 70.00,
        "percentOfTotal": 54.69
      },
      {
        "rawMaterialId": "mat-uuid-2",
        "name": "Matière première B",
        "unit": "kg",
        "availableQuantity": 1800.00,
        "reservedQuantity": 550.00,
        "totalQuantity": 2350.00,
        "stockValue": 145000.00,
        "averageCostPerUnit": 61.70,
        "percentOfTotal": 45.31
      }
    ],
    "byStatus": {
      "available": { "count": 112, "value": 240000.00 },
      "reserved": { "count": 28, "value": 70000.00 },
      "sold": { "count": 5, "value": 10000.00 },
      "adjusted": { "count": 0, "value": 0.00 }
    },
    "expiringWithin30Days": [
      {
        "stockEntryId": "entry-uuid-1",
        "rawMaterialId": "mat-uuid-2",
        "name": "Matière première B",
        "quantity": 200.00,
        "unit": "kg",
        "expiresAt": "2024-06-23",
        "daysUntilExpiry": 5,
        "estimatedValue": 12340.00
      }
    ]
  }
}
```

---

## Logique d'implémentation (service)

```typescript
// DashboardService.getStats()
async getStats(tenantId: string, month: string): Promise<DashboardStats> {
  const [year, monthNum] = month.split('-').map(Number);
  const dateFrom = new Date(year, monthNum - 1, 1);
  const dateTo = new Date(year, monthNum, 0, 23, 59, 59);

  // Exécuter les requêtes en parallèle
  const [salesData, purchaseData, stockData, expensesData] = await Promise.all([
    this.getSalesData(tenantId, dateFrom, dateTo),
    this.getPurchaseData(tenantId, dateFrom, dateTo),
    this.getStockData(tenantId),
    this.getExpensesData(tenantId, dateFrom, dateTo),
  ]);

  // Calculs financiers backend uniquement (R008)
  const grossMargin = salesData.totalRevenue - purchaseData.totalPurchaseCost;
  const netProfit = grossMargin - expensesData.approvedExpenses;
  const grossMarginPercent = salesData.totalRevenue > 0
    ? Math.round((grossMargin / salesData.totalRevenue) * 10000) / 100
    : 0;
  const netProfitPercent = salesData.totalRevenue > 0
    ? Math.round((netProfit / salesData.totalRevenue) * 10000) / 100
    : 0;

  // Alertes
  const alerts = await this.getAlerts(tenantId);

  return {
    period: { month, dateFrom: dateFrom.toISOString().split('T')[0], dateTo: dateTo.toISOString().split('T')[0] },
    sales: salesData,
    purchases: purchaseData,
    stock: stockData,
    expenses: expensesData,
    profit: { grossMargin, grossMarginPercent, netProfit, netProfitPercent },
    alerts,
  };
}
```

---

## KPIs définis

| KPI | Formule | Périmètre |
|-----|---------|-----------|
| `totalRevenue` | SUM(totalAmount) des factures du mois | Toutes sauf `cancelled` |
| `purchaseCost` | SUM(totalAmount) des BL réception du mois | Toutes |
| `totalExpenses` | SUM(amount) des dépenses approuvées du mois | `isApproved = true` uniquement |
| `grossMargin` | totalRevenue − purchaseCost | Période |
| `netProfit` | grossMargin − totalExpenses | Période |
| `stockValue` | SUM(quantity × costPerUnit) des StockEntry `available` + `reserved` | État courant |

---

## Alertes

| Alerte | Seuil | Source |
|--------|-------|--------|
| Stock expirant | `expiresAt ≤ TODAY + 5 jours` | StockEntry `status = available` |
| Factures impayées | `status IN (sent, partial)` | SalesInvoice |
| Factures en retard | `status = overdue` | SalesInvoice |
| Stock bas | `availableQuantity ≤ alertThreshold` | InventorySummary |

---

## Sécurité & Multi-tenancy

- Toutes les queries filtrent `tenantId` depuis le JWT
- Guards : `@UseGuards(JwtGuard, RolesGuard)` sur tous les endpoints
- Roles : OWNER, MANAGER → accès complet ; AGENT → accès refusé (`403`)
