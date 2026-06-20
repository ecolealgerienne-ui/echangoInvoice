import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { StockEntry } from './stock-entry.entity';
import { FinishedProduct } from '../products/finished-product.entity';
import { ListInventoryDto } from './dto/list-inventory.dto';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { SetThresholdDto } from './dto/set-threshold.dto';

@Injectable()
export class StockService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    @InjectRepository(StockEntry) private readonly entryRepo: Repository<StockEntry>,
    @InjectRepository(FinishedProduct) private readonly productRepo: Repository<FinishedProduct>,
  ) {}

  async getInventory(tenantId: string, dto: ListInventoryDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const offset = (page - 1) * limit;

    let where = `"tenantId" = $1 AND "deletedAt" IS NULL`;
    const params: any[] = [tenantId];
    let idx = 2;

    if (dto.materialId) { where += ` AND id = $${idx++}`; params.push(dto.materialId); }
    if (dto.lowStockOnly) { where += ` AND "alertThreshold" IS NOT NULL AND "stockQuantity" <= "alertThreshold"`; }
    if (dto.expiringSoon) { where += ` AND "earliestExpirationDate" IS NOT NULL AND "earliestExpirationDate" <= NOW() + INTERVAL '5 days'`; }

    const countRow = await this.ds.query(
      `SELECT COUNT(*) AS total FROM finished_products WHERE ${where}`,
      params,
    );
    const total = parseInt(countRow[0].total);

    const rows = await this.ds.query(
      `SELECT id AS "rawMaterialId", name, unit,
              "stockQuantity"          AS "totalQuantity",
              "averageCostPerUnit",
              "totalStockValue"        AS "totalValue",
              "earliestExpirationDate",
              "alertThreshold",
              "updatedAt"
       FROM finished_products
       WHERE ${where}
       ORDER BY name ASC
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
        SELECT se."finishedProductId", rm.name, se."expiresAt",
               EXTRACT(DAY FROM se."expiresAt" - NOW())::int AS days,
               SUM(se.quantity) AS qty
        FROM stock_entries se
        JOIN finished_products rm ON rm.id = se."finishedProductId"
        WHERE se."tenantId"=$1 AND se.status='available'
          AND se."expiresAt" IS NOT NULL
          AND se."expiresAt" <= NOW() + INTERVAL '5 days'
        GROUP BY se."finishedProductId", rm.name, se."expiresAt"
        ORDER BY se."expiresAt" ASC`,
        [tenantId]),

      this.ds.query(`
        SELECT id AS "rawMaterialId", name, unit,
               "stockQuantity" AS "totalQuantity", "alertThreshold"
        FROM finished_products
        WHERE "tenantId"=$1
          AND "alertThreshold" IS NOT NULL
          AND "stockQuantity" <= "alertThreshold"
          AND "deletedAt" IS NULL`,
        [tenantId]),
    ]);

    const expiringSoon = expiringRows.map((r: any) => ({
      rawMaterialId: r.finishedProductId,
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
    const product = await this.productRepo.findOne({
      where: { id: dto.rawMaterialId, tenantId },
    });

    const qr = this.ds.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const costPerUnit = product ? parseFloat(product.averageCostPerUnit as any) : 0;
      const qty = dto.quantityAdjustment;

      const entry = qr.manager.create(StockEntry, {
        tenantId,
        rawMaterialId: dto.rawMaterialId,
        finishedProductId: dto.rawMaterialId,
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

      // Recalculate from available entries
      const avail = await qr.manager
        .createQueryBuilder(StockEntry, 'se')
        .where('se.tenantId = :tenantId', { tenantId })
        .andWhere('se.finishedProductId = :mid', { mid: dto.rawMaterialId })
        .andWhere('se.status = :s', { s: 'available' })
        .getMany();

      const totalQty = avail.reduce((s, e) => s + parseFloat(e.quantity as any), 0);
      const totalVal = avail.reduce((s, e) => s + parseFloat(e.quantity as any) * parseFloat(e.costPerUnit as any), 0);
      const avgCost = totalQty > 0 ? totalVal / totalQty : 0;
      const earliest = avail
        .filter(e => e.expiresAt)
        .sort((a, b) => new Date(a.expiresAt!).getTime() - new Date(b.expiresAt!).getTime())[0]?.expiresAt ?? null;

      await qr.manager.query(`
        UPDATE finished_products
        SET "stockQuantity"          = $1,
            "averageCostPerUnit"     = $2,
            "totalStockValue"        = $3,
            "earliestExpirationDate" = $4,
            "updatedAt"              = NOW()
        WHERE id = $5 AND "tenantId" = $6`,
        [totalQty, avgCost, totalVal, earliest, dto.rawMaterialId, tenantId],
      );

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
    const product = await this.productRepo.findOne({ where: { id: rawMaterialId, tenantId } });
    if (!product) throw new NotFoundException('product_not_found');
    await this.productRepo.update({ id: rawMaterialId, tenantId }, { alertThreshold: dto.alertThreshold });
    return { data: { rawMaterialId, alertThreshold: dto.alertThreshold } };
  }

  async listEntries(tenantId: string, rawMaterialId: string, page = 1, limit = 20) {
    const [data, total] = await this.entryRepo.findAndCount({
      where: { tenantId, finishedProductId: rawMaterialId },
      order: { enteredAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, pagination: { total, page, limit } };
  }
}
