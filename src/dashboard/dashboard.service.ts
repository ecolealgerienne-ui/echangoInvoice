import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { DashboardQueryDto } from './dto/dashboard-query.dto';
import { evolution, resoudrePeriode } from './periode';

@Injectable()
export class DashboardService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  /**
   * Les trois agrégats comparables d'une période.
   *
   * R029 — appelé pour la période courante ET pour celle de comparaison. Deux
   * requêtes distinctes divergeraient au premier ajustement de règle (une
   * facture annulée exclue d'un côté et pas de l'autre), et l'écart affiché
   * deviendrait faux sans que rien ne le signale.
   */
  private async chiffresPeriode(tenantId: string, dateFrom: string, dateTo: string) {
    const [ventes, achats, depenses, coutVentes] = await Promise.all([
      this.ds.query(
        `SELECT COALESCE(SUM("totalAmount"),0) AS total, COUNT(*) AS nb,
                COALESCE(AVG("totalAmount"),0) AS moyenne
         FROM sales_invoices
         WHERE "tenantId"=$1 AND "invoiceDate" BETWEEN $2 AND $3
           AND status != 'cancelled' AND "deletedAt" IS NULL`,
        [tenantId, dateFrom, dateTo]),
      this.ds.query(
        `SELECT COALESCE(SUM(poi.quantity * poi."unitPrice"),0) AS total,
                COUNT(DISTINCT rbl.id) AS nb
         FROM reception_bls rbl
         JOIN purchase_order_items poi ON poi."purchaseOrderId" = rbl."purchaseOrderId"
         WHERE rbl."tenantId"=$1 AND rbl."receptionDate" BETWEEN $2 AND $3
           AND rbl."deletedAt" IS NULL`,
        [tenantId, dateFrom, dateTo]),
      this.ds.query(
        `SELECT COALESCE(SUM(CASE WHEN "isApproved" THEN amount ELSE 0 END),0) AS approuvees,
                COALESCE(SUM(amount),0) AS total
         FROM expenses
         WHERE "tenantId"=$1 AND "expenseDate" BETWEEN $2 AND $3 AND "deletedAt" IS NULL`,
        [tenantId, dateFrom, dateTo]),
      // Coût des marchandises vendues.
      //
      // `unitCost` est figé sur la ligne à l'émission ; le repli sur le coût
      // moyen de l'article ne sert qu'aux lignes antérieures à cette règle. Un
      // article supprimé du catalogue laisse un coût nul, ce qui surestime la
      // marge — mieux vaut une marge trop belle qu'un chiffre inventé.
      this.ds.query(
        `SELECT COALESCE(SUM(sii.quantity * COALESCE(
                  sii."unitCost",
                  NULLIF(fp."averageCostPerUnit", 0),
                  NULLIF(fp."lastCostPerUnit", 0),
                  0)),0) AS total
         FROM sales_invoice_items sii
         JOIN sales_invoices si ON si.id = sii."salesInvoiceId"
         LEFT JOIN finished_products fp ON fp.id = sii."finishedProductId"
         WHERE si."tenantId"=$1 AND si."invoiceDate" BETWEEN $2 AND $3
           AND si.status != 'cancelled' AND si."deletedAt" IS NULL`,
        [tenantId, dateFrom, dateTo]),
    ]);

    const revenue = parseFloat(ventes[0]?.total ?? 0);
    const purchases = parseFloat(achats[0]?.total ?? 0);
    const expenses = parseFloat(depenses[0]?.approuvees ?? 0);
    const cogs = parseFloat(coutVentes[0]?.total ?? 0);

    return {
      revenue,
      invoiceCount: parseInt(ventes[0]?.nb ?? 0),
      averageInvoice: Math.round(parseFloat(ventes[0]?.moyenne ?? 0) * 100) / 100,
      purchases,
      receptionCount: parseInt(achats[0]?.nb ?? 0),
      expenses,
      totalExpenses: parseFloat(depenses[0]?.total ?? 0),
      cogs,
      // Résultat net = marge brute − charges. La marge brute se calcule sur ce
      // qui a été **vendu**, pas sur ce qui a été **acheté** : un mois écoulé
      // sans réassort affichait autrefois près de 100 % de marge, et un mois de
      // gros approvisionnement l'aurait affichée négative.
      netProfit: Math.round((revenue - cogs - expenses) * 100) / 100,
    };
  }

  async getStats(tenantId: string, demande: DashboardQueryDto = {}) {
    const periode = resoudrePeriode(demande);
    const { dateFrom, dateTo } = periode;
    const [courant, precedent] = await Promise.all([
      this.chiffresPeriode(tenantId, dateFrom, dateTo),
      this.chiffresPeriode(tenantId, periode.comparaison.dateFrom, periode.comparaison.dateTo),
    ]);

    const [salesRows, byStatusRows, topCustomersRows, purchaseRows, stockSummaryRows,
      stockStatusRows, expenseRows, alertInvoiceRows, alertStockRows, alertLowStockRows,
    ] = await Promise.all([
      // Revenus factures (hors cancelled)
      this.ds.query(`
        SELECT COALESCE(SUM("totalAmount"),0) AS revenue, COUNT(*) AS count,
               COALESCE(AVG("totalAmount"),0) AS avg
        FROM sales_invoices
        WHERE "tenantId"=$1 AND "invoiceDate" BETWEEN $2 AND $3
          AND status != 'cancelled' AND "deletedAt" IS NULL`,
        [tenantId, dateFrom, dateTo]),

      // Par statut
      this.ds.query(`
        SELECT status, COUNT(*) AS count
        FROM sales_invoices
        WHERE "tenantId"=$1 AND "invoiceDate" BETWEEN $2 AND $3 AND "deletedAt" IS NULL
        GROUP BY status`,
        [tenantId, dateFrom, dateTo]),

      // Top 5 clients
      this.ds.query(`
        SELECT inv."customerId", c.name, SUM(inv."totalAmount") AS total
        FROM sales_invoices inv
        JOIN partners c ON c.id = inv."customerId"
        WHERE inv."tenantId"=$1 AND inv."invoiceDate" BETWEEN $2 AND $3
          AND inv.status != 'cancelled' AND inv."deletedAt" IS NULL
        GROUP BY inv."customerId", c.name
        ORDER BY total DESC LIMIT 5`,
        [tenantId, dateFrom, dateTo]),

      // Achats (réceptions BL) — coût calculé depuis les items de PO
      this.ds.query(`
        SELECT COALESCE(SUM(poi.quantity * poi."unitPrice"),0) AS cost, COUNT(DISTINCT rbl.id) AS count
        FROM reception_bls rbl
        JOIN purchase_order_items poi ON poi."purchaseOrderId" = rbl."purchaseOrderId"
        WHERE rbl."tenantId"=$1 AND rbl."receptionDate" BETWEEN $2 AND $3
          AND rbl."deletedAt" IS NULL`,
        [tenantId, dateFrom, dateTo]),

      // Valeur stock courant (available + reserved)
      this.ds.query(`
        SELECT COALESCE(SUM(quantity * "costPerUnit"),0) AS value, COUNT(*) AS entries
        FROM stock_entries
        WHERE "tenantId"=$1 AND status IN ('available','reserved')`,
        [tenantId]),

      // Stock par statut
      this.ds.query(`
        SELECT status, COUNT(*) AS count, COALESCE(SUM(quantity * "costPerUnit"),0) AS value
        FROM stock_entries
        WHERE "tenantId"=$1
        GROUP BY status`,
        [tenantId]),

      // Dépenses
      this.ds.query(`
        SELECT COALESCE(SUM(amount),0) AS total,
               COALESCE(SUM(CASE WHEN "isApproved" THEN amount ELSE 0 END),0) AS approved,
               e.category
        FROM expenses e
        WHERE "tenantId"=$1 AND "expenseDate" BETWEEN $2 AND $3 AND "deletedAt" IS NULL
        GROUP BY e.category`,
        [tenantId, dateFrom, dateTo]),

      // Alertes factures
      this.ds.query(`
        SELECT status, COUNT(*) AS count, COALESCE(SUM("amountDue"),0) AS total
        FROM sales_invoices
        WHERE "tenantId"=$1 AND status IN ('sent','partial','overdue') AND "deletedAt" IS NULL
        GROUP BY status`,
        [tenantId]),

      // Stock expirant ≤ 5 jours
      this.ds.query(`
        SELECT COUNT(*) AS count FROM stock_entries
        WHERE "tenantId"=$1 AND status='available' AND "expiresAt" IS NOT NULL
          AND "expiresAt" <= NOW() + INTERVAL '5 days'`,
        [tenantId]),

      this.ds.query(`
        SELECT COUNT(*) AS count FROM finished_products
        WHERE "tenantId"=$1 AND "stockQuantity" <= "alertThreshold" AND "alertThreshold" IS NOT NULL
          AND "deletedAt" IS NULL`,
        [tenantId]),
    ]);

    // Assemble sales
    // Les scalaires comparables viennent tous de chiffresPeriode, pour la
    // période courante comme pour la précédente : une seule règle, un seul
    // endroit où elle peut changer.
    const totalRevenue = courant.revenue;
    const invoiceCount = courant.invoiceCount;
    const avgInvoice = courant.averageInvoice;

    const byStatus: Record<string, number> = { draft: 0, sent: 0, partial: 0, paid: 0, overdue: 0, cancelled: 0 };
    for (const r of byStatusRows) byStatus[r.status] = parseInt(r.count);

    const topCustomers = topCustomersRows.map((r: any) => ({
      customerId: r.customerId, name: r.name,
      total: Math.round(parseFloat(r.total) * 100) / 100,
    }));

    // Purchases
    const totalPurchaseCost = courant.purchases;
    const receptionCount = courant.receptionCount;

    // Stock
    const totalStockValue = Math.round(parseFloat(stockSummaryRows[0]?.value ?? 0) * 100) / 100;
    const stockByStatus: Record<string, { count: number; value: number }> = {
      available: { count: 0, value: 0 }, reserved: { count: 0, value: 0 },
      sold: { count: 0, value: 0 }, adjusted: { count: 0, value: 0 },
    };
    for (const r of stockStatusRows) {
      stockByStatus[r.status] = { count: parseInt(r.count), value: Math.round(parseFloat(r.value) * 100) / 100 };
    }

    // Expenses
    const cats = ['loyer', 'utilities', 'transport', 'rh', 'maintenance', 'other'];
    const byCategory: Record<string, number> = {};
    cats.forEach((c) => (byCategory[c] = 0));
    let totalExpenses = 0, approvedExpenses = 0;
    for (const r of expenseRows) {
      byCategory[r.category] = Math.round(parseFloat(r.total) * 100) / 100;
    }
    totalExpenses = Math.round(courant.totalExpenses * 100) / 100;
    approvedExpenses = Math.round(courant.expenses * 100) / 100;

    // Profit (R008)
    //
    // La marge brute est le chiffre d'affaires moins le **coût des marchandises
    // vendues**. Elle valait auparavant « CA moins achats reçus sur la
    // période », ce qui n'est pas une marge mais une trésorerie : sur un mois
    // à deux réceptions et vingt millions de ventes, elle affichait 93 %.
    const costOfGoodsSold = courant.cogs;
    const grossMargin = Math.round((totalRevenue - costOfGoodsSold) * 100) / 100;
    const netProfit = Math.round((grossMargin - approvedExpenses) * 100) / 100;
    const grossMarginPercent = totalRevenue > 0 ? Math.round((grossMargin / totalRevenue) * 10000) / 100 : 0;
    const netProfitPercent = totalRevenue > 0 ? Math.round((netProfit / totalRevenue) * 10000) / 100 : 0;

    // Alerts
    const alertByStatus: Record<string, any> = {};
    for (const r of alertInvoiceRows) alertByStatus[r.status] = { count: parseInt(r.count), total: parseFloat(r.total) };
    const unpaidCount = (alertByStatus['sent']?.count ?? 0) + (alertByStatus['partial']?.count ?? 0);
    const unpaidTotal = (alertByStatus['sent']?.total ?? 0) + (alertByStatus['partial']?.total ?? 0);

    return {
      data: {
        period: {
          dateFrom, dateTo, jours: periode.jours,
          comparaison: periode.comparaison,
        },
        evolution: {
          revenue: evolution(totalRevenue, precedent.revenue),
          purchases: evolution(totalPurchaseCost, precedent.purchases),
          expenses: evolution(approvedExpenses, precedent.expenses),
          netProfit: evolution(netProfit, precedent.netProfit),
        },
        sales: {
          totalRevenue: Math.round(totalRevenue * 100) / 100,
          invoiceCount,
          byStatus,
          averageInvoiceValue: avgInvoice,
          topCustomers,
        },
        purchases: { totalPurchaseCost: Math.round(totalPurchaseCost * 100) / 100, receptionCount },
        stock: {
          totalStockValue,
          byStatus: stockByStatus,
        },
        expenses: {
          totalExpenses,
          approvedExpenses,
          pendingExpenses: Math.round((totalExpenses - approvedExpenses) * 100) / 100,
          byCategory,
        },
        profit: {
          grossMargin, grossMarginPercent, netProfit, netProfitPercent,
          // Exposé pour que l'écran puisse le montrer : une marge sans son coût
          // ne se vérifie pas.
          costOfGoodsSold: Math.round(costOfGoodsSold * 100) / 100,
        },
        alerts: {
          expiringStockCount: parseInt(alertStockRows[0]?.count ?? 0),
          unpaidInvoicesCount: unpaidCount,
          unpaidInvoicesTotal: Math.round(unpaidTotal * 100) / 100,
          lowStockCount: parseInt(alertLowStockRows[0]?.count ?? 0),
          overdueInvoicesCount: alertByStatus['overdue']?.count ?? 0,
          overdueInvoicesTotal: Math.round((alertByStatus['overdue']?.total ?? 0) * 100) / 100,
        },
      },
    };
  }

  async getSalesChart(tenantId: string, demande: DashboardQueryDto = {}) {
    const { dateFrom, dateTo } = resoudrePeriode(demande);

    const [byDateRows, byCustomerRows, byMethodRows] = await Promise.all([
      this.ds.query(`
        SELECT "invoiceDate"::date AS date,
               COALESCE(SUM("totalAmount"),0) AS revenue, COUNT(*) AS count
        FROM sales_invoices
        WHERE "tenantId"=$1 AND "invoiceDate" BETWEEN $2 AND $3
          AND status != 'cancelled' AND "deletedAt" IS NULL
        GROUP BY "invoiceDate"::date ORDER BY date`,
        [tenantId, dateFrom, dateTo]),

      this.ds.query(`
        SELECT inv."customerId", c.name,
               SUM(inv."totalAmount") AS revenue, COUNT(*) AS count
        FROM sales_invoices inv
        JOIN partners c ON c.id = inv."customerId"
        WHERE inv."tenantId"=$1 AND inv."invoiceDate" BETWEEN $2 AND $3
          AND inv.status != 'cancelled' AND inv."deletedAt" IS NULL
        GROUP BY inv."customerId", c.name ORDER BY revenue DESC`,
        [tenantId, dateFrom, dateTo]),

      this.ds.query(`
        SELECT p."paymentMethod", COALESCE(SUM(p.amount),0) AS total
        FROM payments p
        JOIN sales_invoices inv ON inv.id = p."salesInvoiceId"
        WHERE p."tenantId"=$1 AND p."paymentDate" BETWEEN $2 AND $3 AND p."deletedAt" IS NULL
        GROUP BY p."paymentMethod"`,
        [tenantId, dateFrom, dateTo]),
    ]);

    const totalRevenue = byCustomerRows.reduce((s: number, r: any) => s + parseFloat(r.revenue), 0);
    const byCustomer = byCustomerRows.map((r: any) => {
      const rev = Math.round(parseFloat(r.revenue) * 100) / 100;
      return {
        customerId: r.customerId, name: r.name, revenue: rev,
        invoiceCount: parseInt(r.count),
        percent: totalRevenue > 0 ? Math.round((rev / totalRevenue) * 10000) / 100 : 0,
      };
    });

    const byMethod: Record<string, number> = { cash: 0, bank_transfer: 0, cheque: 0, other: 0 };
    for (const r of byMethodRows) byMethod[r.paymentMethod] = Math.round(parseFloat(r.total) * 100) / 100;

    return {
      data: {
        period: { dateFrom, dateTo },
        byDate: byDateRows.map((r: any) => ({
          date: r.date, revenue: Math.round(parseFloat(r.revenue) * 100) / 100,
          invoiceCount: parseInt(r.count),
        })),
        byCustomer,
        byPaymentMethod: byMethod,
      },
    };
  }

  async getStockChart(tenantId: string) {
    const [byMaterialRows, byStatusRows, expiringRows] = await Promise.all([
      this.ds.query(`
        SELECT se."rawMaterialId", rm.name, rm.unit,
               SUM(CASE WHEN se.status='available' THEN se.quantity ELSE 0 END) AS available,
               SUM(CASE WHEN se.status='reserved'  THEN se.quantity ELSE 0 END) AS reserved,
               SUM(se.quantity) AS total,
               SUM(se.quantity * se."costPerUnit") AS value
        FROM stock_entries se
        JOIN finished_products rm ON rm.id = se."rawMaterialId"
        WHERE se."tenantId"=$1 AND se.status IN ('available','reserved')
        GROUP BY se."rawMaterialId", rm.name, rm.unit`,
        [tenantId]),

      this.ds.query(`
        SELECT status, COUNT(*) AS count, COALESCE(SUM(quantity * "costPerUnit"),0) AS value
        FROM stock_entries WHERE "tenantId"=$1 GROUP BY status`,
        [tenantId]),

      this.ds.query(`
        SELECT se.id, se."rawMaterialId", rm.name, se.quantity, rm.unit, se."expiresAt",
               EXTRACT(DAY FROM se."expiresAt" - NOW())::int AS days,
               se.quantity * se."costPerUnit" AS estimated_value
        FROM stock_entries se
        JOIN finished_products rm ON rm.id = se."rawMaterialId"
        WHERE se."tenantId"=$1 AND se.status='available' AND se."expiresAt" IS NOT NULL
          AND se."expiresAt" <= NOW() + INTERVAL '30 days'
        ORDER BY se."expiresAt" ASC`,
        [tenantId]),
    ]);

    const totalValue = byMaterialRows.reduce((s: number, r: any) => s + parseFloat(r.value ?? 0), 0);

    const byStatus: Record<string, any> = { available: { count: 0, value: 0 }, reserved: { count: 0, value: 0 }, sold: { count: 0, value: 0 }, adjusted: { count: 0, value: 0 } };
    for (const r of byStatusRows) {
      byStatus[r.status] = { count: parseInt(r.count), value: Math.round(parseFloat(r.value) * 100) / 100 };
    }

    return {
      data: {
        generatedAt: new Date().toISOString(),
        totalStockValue: Math.round(totalValue * 100) / 100,
        byRawMaterial: byMaterialRows.map((r: any) => {
          const val = Math.round(parseFloat(r.value ?? 0) * 100) / 100;
          return {
            rawMaterialId: r.rawMaterialId, name: r.name, unit: r.unit,
            availableQuantity: parseFloat(r.available),
            reservedQuantity: parseFloat(r.reserved),
            totalQuantity: parseFloat(r.total),
            stockValue: val,
            percentOfTotal: totalValue > 0 ? Math.round((val / totalValue) * 10000) / 100 : 0,
          };
        }),
        byStatus,
        expiringWithin30Days: expiringRows.map((r: any) => ({
          stockEntryId: r.id, rawMaterialId: r.rawMaterialId, name: r.name,
          quantity: parseFloat(r.quantity), unit: r.unit, expiresAt: r.expiresAt,
          daysUntilExpiry: r.days,
          estimatedValue: Math.round(parseFloat(r.estimated_value) * 100) / 100,
        })),
      },
    };
  }
}
