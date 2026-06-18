import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ReportQueryDto, ExpenseReportQueryDto } from './dto/report-query.dto';

@Injectable()
export class ReportsService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async getSalesReport(tenantId: string, dto: ReportQueryDto) {
    const { dateFrom, dateTo, page = 1, limit = 20 } = dto;
    const offset = (page - 1) * limit;

    const [summaryRows, byStatusRows, byCustomerRows, byMethodRows, detailRows, countRow] =
      await Promise.all([
        this.ds.query(`
          SELECT
            COALESCE(SUM("totalAmount"),0)  AS revenue,
            COALESCE(SUM("taxAmount"),0)     AS tax,
            COALESCE(SUM("subtotal"),0)      AS ht,
            COUNT(*)                         AS count,
            COUNT(*) FILTER (WHERE status='paid') AS paid_count,
            COALESCE(SUM("amountPaid"),0)    AS amount_paid,
            COALESCE(SUM("amountDue"),0)     AS amount_due,
            COALESCE(AVG("totalAmount"),0)   AS avg_val
          FROM sales_invoices
          WHERE "tenantId"=$1 AND "invoiceDate" BETWEEN $2 AND $3
            AND status != 'cancelled' AND "deletedAt" IS NULL`,
          [tenantId, dateFrom, dateTo]),

        this.ds.query(`
          SELECT status, COUNT(*) AS count, COALESCE(SUM("totalAmount"),0) AS total
          FROM sales_invoices
          WHERE "tenantId"=$1 AND "invoiceDate" BETWEEN $2 AND $3 AND "deletedAt" IS NULL
          GROUP BY status`,
          [tenantId, dateFrom, dateTo]),

        this.ds.query(`
          SELECT inv."customerId", c.name,
                 COUNT(*) AS inv_count,
                 COALESCE(SUM(inv."totalAmount"),0) AS revenue,
                 COALESCE(SUM(inv."amountPaid"),0)  AS paid,
                 COALESCE(SUM(inv."amountDue"),0)   AS due
          FROM sales_invoices inv
          JOIN customers c ON c.id = inv."customerId"
          WHERE inv."tenantId"=$1 AND inv."invoiceDate" BETWEEN $2 AND $3
            AND inv.status != 'cancelled' AND inv."deletedAt" IS NULL
          GROUP BY inv."customerId", c.name ORDER BY revenue DESC`,
          [tenantId, dateFrom, dateTo]),

        this.ds.query(`
          SELECT p."paymentMethod", COALESCE(SUM(p.amount),0) AS total
          FROM payments p
          WHERE p."tenantId"=$1 AND p."paymentDate" BETWEEN $2 AND $3 AND p."deletedAt" IS NULL
          GROUP BY p."paymentMethod"`,
          [tenantId, dateFrom, dateTo]),

        this.ds.query(`
          SELECT inv.id, inv."invoiceNumber", c.name AS customer_name,
                 inv."invoiceDate", inv."dueDate", inv.status,
                 inv."totalAmount", inv."amountPaid", inv."amountDue"
          FROM sales_invoices inv
          JOIN customers c ON c.id = inv."customerId"
          WHERE inv."tenantId"=$1 AND inv."invoiceDate" BETWEEN $2 AND $3
            AND inv."deletedAt" IS NULL
          ORDER BY inv."invoiceDate" DESC
          LIMIT $4 OFFSET $5`,
          [tenantId, dateFrom, dateTo, limit, offset]),

        this.ds.query(`
          SELECT COUNT(*) AS total FROM sales_invoices
          WHERE "tenantId"=$1 AND "invoiceDate" BETWEEN $2 AND $3 AND "deletedAt" IS NULL`,
          [tenantId, dateFrom, dateTo]),
      ]);

    const s = summaryRows[0];
    const totalCount = parseInt(s.count);
    const paidCount = parseInt(s.paid_count);

    const byStatus: Record<string, any> = { draft: { count: 0, total: 0 }, sent: { count: 0, total: 0 }, partial: { count: 0, total: 0 }, paid: { count: 0, total: 0 }, overdue: { count: 0, total: 0 }, cancelled: { count: 0, total: 0 } };
    for (const r of byStatusRows) byStatus[r.status] = { count: parseInt(r.count), total: Math.round(parseFloat(r.total) * 100) / 100 };

    const byMethod: Record<string, number> = { cash: 0, bank_transfer: 0, cheque: 0, other: 0 };
    for (const r of byMethodRows) byMethod[r.paymentMethod] = Math.round(parseFloat(r.total) * 100) / 100;

    return {
      data: {
        period: { dateFrom, dateTo },
        summary: {
          totalRevenue: Math.round(parseFloat(s.revenue) * 100) / 100,
          totalTax: Math.round(parseFloat(s.tax) * 100) / 100,
          totalHT: Math.round(parseFloat(s.ht) * 100) / 100,
          invoiceCount: totalCount,
          paidCount,
          unpaidCount: totalCount - paidCount,
          averageInvoiceValue: Math.round(parseFloat(s.avg_val) * 100) / 100,
          totalAmountPaid: Math.round(parseFloat(s.amount_paid) * 100) / 100,
          totalAmountDue: Math.round(parseFloat(s.amount_due) * 100) / 100,
        },
        byStatus,
        byCustomer: byCustomerRows.map((r: any) => ({
          customerId: r.customerId,
          name: r.name,
          invoiceCount: parseInt(r.inv_count),
          totalRevenue: Math.round(parseFloat(r.revenue) * 100) / 100,
          amountPaid: Math.round(parseFloat(r.paid) * 100) / 100,
          amountDue: Math.round(parseFloat(r.due) * 100) / 100,
        })),
        byPaymentMethod: byMethod,
        details: detailRows.map((r: any) => ({
          id: r.id,
          invoiceNumber: r.invoiceNumber,
          customerName: r.customer_name,
          invoiceDate: r.invoiceDate,
          dueDate: r.dueDate,
          status: r.status,
          totalAmount: Math.round(parseFloat(r.totalAmount) * 100) / 100,
          amountPaid: Math.round(parseFloat(r.amountPaid) * 100) / 100,
          amountDue: Math.round(parseFloat(r.amountDue) * 100) / 100,
        })),
      },
      pagination: { total: parseInt(countRow[0].total), page, limit },
    };
  }

  async getPurchasesReport(tenantId: string, dto: ReportQueryDto) {
    const { dateFrom, dateTo, page = 1, limit = 20 } = dto;
    const offset = (page - 1) * limit;

    const [summaryRows, bySupplierRows, byMaterialRows, detailRows, countRow] = await Promise.all([
      this.ds.query(`
        SELECT COALESCE(SUM("totalAmount"),0) AS cost, COUNT(*) AS count
        FROM reception_bls
        WHERE "tenantId"=$1 AND "receptionDate" BETWEEN $2 AND $3 AND "deletedAt" IS NULL`,
        [tenantId, dateFrom, dateTo]),

      this.ds.query(`
        SELECT bl."supplierId", s.name,
               COUNT(*) AS order_count,
               COALESCE(SUM(bl."totalAmount"),0) AS total
        FROM reception_bls bl
        JOIN suppliers s ON s.id = bl."supplierId"
        WHERE bl."tenantId"=$1 AND bl."receptionDate" BETWEEN $2 AND $3 AND bl."deletedAt" IS NULL
        GROUP BY bl."supplierId", s.name ORDER BY total DESC`,
        [tenantId, dateFrom, dateTo]),

      this.ds.query(`
        SELECT se."rawMaterialId", rm.name, rm.unit,
               SUM(se.quantity) AS total_qty,
               SUM(se."totalCost") AS total_cost
        FROM stock_entries se
        JOIN raw_materials rm ON rm.id = se."rawMaterialId"
        JOIN reception_bls bl ON bl.id = se."receptionBlId"
        WHERE se."tenantId"=$1 AND bl."receptionDate" BETWEEN $2 AND $3
          AND se."deletedAt" IS NULL
        GROUP BY se."rawMaterialId", rm.name, rm.unit ORDER BY total_cost DESC`,
        [tenantId, dateFrom, dateTo]),

      this.ds.query(`
        SELECT bl.id, bl."blNumber", s.name AS supplier_name,
               bl."receptionDate", bl."totalAmount", bl.status
        FROM reception_bls bl
        JOIN suppliers s ON s.id = bl."supplierId"
        WHERE bl."tenantId"=$1 AND bl."receptionDate" BETWEEN $2 AND $3 AND bl."deletedAt" IS NULL
        ORDER BY bl."receptionDate" DESC
        LIMIT $4 OFFSET $5`,
        [tenantId, dateFrom, dateTo, limit, offset]),

      this.ds.query(`
        SELECT COUNT(*) AS total FROM reception_bls
        WHERE "tenantId"=$1 AND "receptionDate" BETWEEN $2 AND $3 AND "deletedAt" IS NULL`,
        [tenantId, dateFrom, dateTo]),
    ]);

    const totalCost = parseFloat(summaryRows[0].cost);
    const receptionCount = parseInt(summaryRows[0].count);

    return {
      data: {
        period: { dateFrom, dateTo },
        summary: {
          totalPurchaseCost: Math.round(totalCost * 100) / 100,
          receptionCount,
          averageOrderValue: receptionCount > 0 ? Math.round((totalCost / receptionCount) * 100) / 100 : 0,
        },
        bySupplier: bySupplierRows.map((r: any) => ({
          supplierId: r.supplierId,
          name: r.name,
          orderCount: parseInt(r.order_count),
          totalAmount: Math.round(parseFloat(r.total) * 100) / 100,
        })),
        byRawMaterial: byMaterialRows.map((r: any) => {
          const qty = parseFloat(r.total_qty);
          const cost = parseFloat(r.total_cost);
          return {
            rawMaterialId: r.rawMaterialId,
            name: r.name,
            unit: r.unit,
            totalQuantityReceived: Math.round(qty * 100) / 100,
            totalCost: Math.round(cost * 100) / 100,
            averageCostPerUnit: qty > 0 ? Math.round((cost / qty) * 100) / 100 : 0,
          };
        }),
        details: detailRows.map((r: any) => ({
          id: r.id,
          blNumber: r.blNumber,
          supplierName: r.supplier_name,
          receptionDate: r.receptionDate,
          totalAmount: Math.round(parseFloat(r.totalAmount) * 100) / 100,
          status: r.status,
        })),
      },
      pagination: { total: parseInt(countRow[0].total), page, limit },
    };
  }

  async getExpensesReport(tenantId: string, dto: ExpenseReportQueryDto) {
    const { dateFrom, dateTo, page = 1, limit = 20, category } = dto;
    const offset = (page - 1) * limit;

    let where = `"tenantId"=$1 AND "expenseDate" BETWEEN $2 AND $3 AND "deletedAt" IS NULL`;
    const params: any[] = [tenantId, dateFrom, dateTo];
    if (category) { where += ` AND category=$4`; params.push(category); }

    const [byCategoryRows, detailRows, aggregateRow] = await Promise.all([
      this.ds.query(
        `SELECT category, COALESCE(SUM(amount),0) AS total, COUNT(*) AS count
         FROM expenses WHERE ${where} GROUP BY category`,
        params),

      this.ds.query(
        `SELECT id, "expenseDate", description, category, amount, "isApproved", "approvedBy"
         FROM expenses WHERE ${where}
         ORDER BY "expenseDate" DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset]),

      this.ds.query(
        `SELECT COUNT(*) AS total, COALESCE(SUM(amount),0) AS sum,
                COALESCE(SUM(CASE WHEN "isApproved" THEN amount ELSE 0 END),0) AS approved_sum,
                COUNT(*) FILTER (WHERE "isApproved") AS approved_count
         FROM expenses WHERE ${where}`,
        params),
    ]);

    const cats = ['loyer', 'utilities', 'transport', 'rh', 'maintenance', 'other'];
    const byCategory: Record<string, any> = {};
    cats.forEach(c => (byCategory[c] = { total: 0, count: 0 }));
    for (const r of byCategoryRows) {
      byCategory[r.category] = { total: Math.round(parseFloat(r.total) * 100) / 100, count: parseInt(r.count) };
    }

    const cr = aggregateRow[0];
    const totalExpenses = parseFloat(cr.sum);
    const approvedExpenses = parseFloat(cr.approved_sum);
    const totalCount = parseInt(cr.total);
    const approvedCount = parseInt(cr.approved_count);

    return {
      data: {
        period: { dateFrom, dateTo },
        summary: {
          totalExpenses: Math.round(totalExpenses * 100) / 100,
          approvedExpenses: Math.round(approvedExpenses * 100) / 100,
          pendingExpenses: Math.round((totalExpenses - approvedExpenses) * 100) / 100,
          expenseCount: totalCount,
          approvedCount,
          pendingCount: totalCount - approvedCount,
          averageExpense: totalCount > 0 ? Math.round((totalExpenses / totalCount) * 100) / 100 : 0,
        },
        byCategory,
        details: detailRows.map((r: any) => ({
          id: r.id,
          expenseDate: r.expenseDate,
          description: r.description,
          category: r.category,
          amount: Math.round(parseFloat(r.amount) * 100) / 100,
          isApproved: r.isApproved,
          approvedBy: r.approvedBy,
        })),
      },
      pagination: { total: totalCount, page, limit },
    };
  }

  async getStockReport(tenantId: string) {
    const [smRows, dtRows, expRows, lowRows] = await Promise.all([
      this.ds.query(`
        SELECT
          COALESCE(SUM(CASE WHEN status='available' THEN quantity*"costPerUnit" ELSE 0 END),0) AS stock_value,
          COALESCE(SUM(CASE WHEN status='available' THEN quantity ELSE 0 END),0)              AS avail_qty,
          COUNT(*) FILTER (WHERE status='available') AS avail_entries,
          COUNT(*) FILTER (WHERE status='reserved')  AS reserved_entries,
          COUNT(*) FILTER (WHERE status='sold')      AS sold_entries,
          COUNT(*) FILTER (WHERE status='adjusted')  AS adjusted_entries
        FROM stock_entries WHERE "tenantId"=$1 AND "deletedAt" IS NULL`,
        [tenantId]),

      this.ds.query(`
        SELECT inv."rawMaterialId", rm.name, rm.unit,
               inv."totalQuantity" AS avail_qty,
               inv."totalValue"    AS stock_value,
               inv."averageCostPerUnit" AS avg_cost,
               inv."alertThreshold",
               inv."earliestExpirationDate",
               (SELECT MIN(se2."enteredAt") FROM stock_entries se2
                WHERE se2."rawMaterialId"=inv."rawMaterialId" AND se2."tenantId"=inv."tenantId"
                  AND se2.status='available' AND se2."deletedAt" IS NULL) AS oldest_entry,
               (SELECT COALESCE(SUM(se3.quantity),0) FROM stock_entries se3
                WHERE se3."rawMaterialId"=inv."rawMaterialId" AND se3."tenantId"=inv."tenantId"
                  AND se3.status='reserved' AND se3."deletedAt" IS NULL) AS reserved_qty
        FROM inventory_summary inv
        JOIN raw_materials rm ON rm.id = inv."rawMaterialId"
        WHERE inv."tenantId"=$1 ORDER BY rm.name ASC`,
        [tenantId]),

      this.ds.query(`
        SELECT COUNT(*) AS count FROM stock_entries
        WHERE "tenantId"=$1 AND status='available'
          AND "expiresAt" IS NOT NULL AND "expiresAt" <= NOW() + INTERVAL '5 days'
          AND "deletedAt" IS NULL`,
        [tenantId]),

      this.ds.query(`
        SELECT COUNT(*) AS count FROM inventory_summary
        WHERE "tenantId"=$1 AND "alertThreshold" IS NOT NULL
          AND "totalQuantity" <= "alertThreshold"`,
        [tenantId]),
    ]);

    const sm = smRows[0];
    return {
      data: {
        generatedAt: new Date().toISOString(),
        summary: {
          totalStockValue: Math.round(parseFloat(sm.stock_value) * 100) / 100,
          totalAvailableQuantity: Math.round(parseFloat(sm.avail_qty) * 100) / 100,
          availableEntries: parseInt(sm.avail_entries),
          reservedEntries: parseInt(sm.reserved_entries),
          soldEntries: parseInt(sm.sold_entries),
          adjustedEntries: parseInt(sm.adjusted_entries),
          expiringSoon: parseInt(expRows[0].count),
          lowStockItems: parseInt(lowRows[0].count),
        },
        details: dtRows.map((r: any) => {
          const availQty = parseFloat(r.avail_qty);
          const reservedQty = parseFloat(r.reserved_qty);
          const threshold = r.alertThreshold ? parseFloat(r.alertThreshold) : null;
          return {
            rawMaterialId: r.rawMaterialId,
            name: r.name,
            unit: r.unit,
            availableQuantity: Math.round(availQty * 100) / 100,
            reservedQuantity: Math.round(reservedQty * 100) / 100,
            totalQuantity: Math.round((availQty + reservedQty) * 100) / 100,
            stockValue: Math.round(parseFloat(r.stock_value) * 100) / 100,
            averageCostPerUnit: Math.round(parseFloat(r.avg_cost) * 100) / 100,
            alertThreshold: threshold,
            isLowStock: threshold !== null && availQty <= threshold,
            oldestEntryDate: r.oldest_entry,
            nearestExpiryDate: r.earliestExpirationDate,
          };
        }),
      },
    };
  }
}
