import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { StockEntry } from './stock-entry.entity';
import { InventorySummary } from './inventory-summary.entity';
import { ListInventoryDto } from './dto/list-inventory.dto';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { SetThresholdDto } from './dto/set-threshold.dto';

@Injectable()
export class StockService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    @InjectRepository(StockEntry) private readonly entryRepo: Repository<StockEntry>,
    @InjectRepository(InventorySummary) private readonly summaryRepo: Repository<InventorySummary>,
  ) {}

  async getInventory(tenantId: string, dto: ListInventoryDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const offset = (page - 1) * limit;

    let where = `inv."tenantId" = $1`;
    const params: any[] = [tenantId];
    let idx = 2;

    if (dto.materialId) { where += ` AND inv."rawMaterialId" = $${idx++}`; params.push(dto.materialId); }
    if (dto.lowStockOnly) { where += ` AND inv."alertThreshold" IS NOT NULL AND inv."totalQuantity" <= inv."alertThreshold"`; }
    if (dto.expiringSoon) { where += ` AND inv."earliestExpirationDate" IS NOT NULL AND inv."earliestExpirationDate" <= NOW() + INTERVAL '5 days'`; }

    const countRow = await this.ds.query(
      `SELECT COUNT(*) AS total FROM inventory_summary inv WHERE ${where}`,
      params,
    );
    const total = parseInt(countRow[0].total);

    const rows = await this.ds.query(
      `SELECT inv."rawMaterialId", rm.name, rm.unit,
              inv."totalQuantity", inv."averageCostPerUnit", inv."totalValue",
              inv."earliestExpirationDate", inv."alertThreshold", inv."updatedAt"
       FROM inventory_summary inv
       JOIN raw_materials rm ON rm.id = inv."rawMaterialId"
       WHERE ${where}
       ORDER BY rm.name ASC
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, limit, offset],
    );

    const now = new Date();
    const data = rows.map((r: any) => {
      const expiry = r.earliestExpirationDate ? new Date(r.earliestExpirationDate) : null;
      const diffDays = expiry ? Math.ceil((expiry.getTime() - now.getTime()) / 86400000) : null;
      let expiryAlert: 'red' | 'orange' | null = null;
      if (diffDays !== null) {
        if (diffDays <= 2) expiryAlert = 'red';
        else if (diffDays <= 5) expiryAlert = 'orange';
      }
      const threshold = r.alertThreshold ? parseFloat(r.alertThreshold) : null;
      const qty = parseFloat(r.totalQuantity);
      return {
        rawMaterialId: r.rawMaterialId,
        rawMaterialName: r.name,
        unit: r.unit,
        totalQuantity: Math.round(qty * 100) / 100,
        averageCostPerUnit: Math.round(parseFloat(r.averageCostPerUnit) * 100) / 100,
        totalValue: Math.round(parseFloat(r.totalValue) * 100) / 100,
        lastUpdated: r.updatedAt,
        earliestExpirationDate: r.earliestExpirationDate,
        expiryAlert,
        lowStockAlert: threshold !== null && qty <= threshold,
        stockThreshold: threshold,
      };
    });

    return { data, pagination: { total, page, limit } };
  }

  async getAlerts(tenantId: string) {
    const [expiringRows, lowStockRows] = await Promise.all([
      this.ds.query(`
        SELECT se."rawMaterialId", rm.name, se."expiresAt",
               EXTRACT(DAY FROM se."expiresAt" - NOW())::int AS days,
               SUM(se.quantity) AS qty
        FROM stock_entries se
        JOIN raw_materials rm ON rm.id = se."rawMaterialId"
        WHERE se."tenantId"=$1 AND se.status='available'
          AND se."expiresAt" IS NOT NULL
          AND se."expiresAt" <= NOW() + INTERVAL '5 days'
        GROUP BY se."rawMaterialId", rm.name, se."expiresAt"
        ORDER BY se."expiresAt" ASC`,
        [tenantId]),

      this.ds.query(`
        SELECT inv."rawMaterialId", rm.name, rm.unit,
               inv."totalQuantity", inv."alertThreshold"
        FROM inventory_summary inv
        JOIN raw_materials rm ON rm.id = inv."rawMaterialId"
        WHERE inv."tenantId"=$1
          AND inv."alertThreshold" IS NOT NULL
          AND inv."totalQuantity" <= inv."alertThreshold"`,
        [tenantId]),
    ]);

    const expiringSoon = expiringRows.map((r: any) => ({
      rawMaterialId: r.rawMaterialId,
      rawMaterialName: r.name,
      expiresAt: r.expiresAt,
      daysUntilExpiry: r.days,
      quantityAtRisk: Math.round(parseFloat(r.qty) * 100) / 100,
      severity: r.days <= 2 ? 'red' : 'orange',
    }));

    const lowStock = lowStockRows.map((r: any) => ({
      rawMaterialId: r.rawMaterialId,
      rawMaterialName: r.name,
      unit: r.unit,
      totalQuantity: Math.round(parseFloat(r.totalQuantity) * 100) / 100,
      stockThreshold: parseFloat(r.alertThreshold),
    }));

    const criticalCount = expiringSoon.filter((e: any) => e.severity === 'red').length;

    return {
      data: {
        expiringSoon,
        lowStock,
        summary: {
          totalExpiringSoon: expiringSoon.length,
          totalLowStock: lowStock.length,
          criticalCount,
        },
      },
    };
  }

  async adjust(tenantId: string, dto: AdjustStockDto, userId: string) {
    const summary = await this.summaryRepo.findOne({
      where: { tenantId, rawMaterialId: dto.rawMaterialId },
    });

    const qr = this.ds.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const costPerUnit = summary ? parseFloat(summary.averageCostPerUnit as any) : 0;
      const qty = dto.quantityAdjustment;

      const entry = qr.manager.create(StockEntry, {
        tenantId,
        rawMaterialId: dto.rawMaterialId,
        quantity: Math.abs(qty),
        costPerUnit,
        totalCost: Math.abs(qty) * costPerUnit,
        status: 'adjusted',
        enteredAt: new Date(),
        createdBy: userId,
      });
      const saved = await qr.manager.save(StockEntry, entry);

      await qr.manager.query(`
        INSERT INTO stock_adjustments
          ("tenantId","rawMaterialId","stockEntryId","quantityAdjustment","reason","notes","adjustedBy","adjustedAt")
        VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())`,
        [tenantId, dto.rawMaterialId, saved.id, qty, dto.reason, dto.notes ?? null, userId],
      );

      // Recalculate InventorySummary from available entries
      const avail = await qr.manager
        .createQueryBuilder(StockEntry, 'se')
        .where('se.tenantId = :tenantId', { tenantId })
        .andWhere('se.rawMaterialId = :mid', { mid: dto.rawMaterialId })
        .andWhere('se.status = :s', { s: 'available' })
        .getMany();

      const totalQty = avail.reduce((s, e) => s + parseFloat(e.quantity as any), 0);
      const totalVal = avail.reduce((s, e) => s + parseFloat(e.quantity as any) * parseFloat(e.costPerUnit as any), 0);
      const avgCost = totalQty > 0 ? totalVal / totalQty : 0;
      const earliest = avail
        .filter(e => e.expiresAt)
        .sort((a, b) => new Date(a.expiresAt!).getTime() - new Date(b.expiresAt!).getTime())[0]?.expiresAt ?? null;

      if (summary) {
        summary.totalQuantity = totalQty;
        summary.averageCostPerUnit = avgCost;
        summary.totalValue = totalVal;
        summary.earliestExpirationDate = earliest;
        await qr.manager.save(InventorySummary, summary);
      } else {
        await qr.manager.save(InventorySummary, qr.manager.create(InventorySummary, {
          tenantId, rawMaterialId: dto.rawMaterialId,
          totalQuantity: totalQty, averageCostPerUnit: avgCost,
          totalValue: totalVal, earliestExpirationDate: earliest,
        }));
      }

      await qr.commitTransaction();
      return {
        data: {
          rawMaterialId: dto.rawMaterialId,
          quantityAdjustment: qty,
          reason: dto.reason,
          notes: dto.notes ?? null,
          newTotalQuantity: Math.round(totalQty * 100) / 100,
          adjustmentEntryId: saved.id,
          adjustedAt: saved.createdAt,
        },
      };
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  async setThreshold(tenantId: string, rawMaterialId: string, dto: SetThresholdDto) {
    let summary = await this.summaryRepo.findOne({ where: { tenantId, rawMaterialId } });
    if (!summary) throw new NotFoundException('inventory_summary_not_found');
    summary.alertThreshold = dto.alertThreshold;
    await this.summaryRepo.save(summary);
    return { data: { rawMaterialId, alertThreshold: dto.alertThreshold } };
  }

  async listEntries(tenantId: string, rawMaterialId: string, page = 1, limit = 20) {
    const [data, total] = await this.entryRepo.findAndCount({
      where: { tenantId, rawMaterialId },
      order: { enteredAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, pagination: { total, page, limit } };
  }
}
