import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { StockEntry } from './stock-entry.entity';
import { FinishedProduct } from '../products/finished-product.entity';
import { ListInventoryDto } from './dto/list-inventory.dto';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { SetThresholdDto } from './dto/set-threshold.dto';
import { consumeStockFifo, recomputeProductStock } from './recompute-product-stock';

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
    if (!dto.newQuantity && dto.newQuantity !== 0) {
      throw new BadRequestException('newQuantity is required');
    }

    const product = await this.productRepo.findOne({
      where: { id: dto.rawMaterialId, tenantId },
    });

    const currentQty = product ? parseFloat(product.stockQuantity as any) : 0;
    const newQty = Math.round(dto.newQuantity * 100) / 100;
    const delta = Math.round((newQty - currentQty) * 100) / 100;
    const avgCost = product ? (parseFloat(product.averageCostPerUnit as any) || 0) : 0;
    const lastCost = product ? (parseFloat(product.lastCostPerUnit as any) || 0) : 0;
    const costPerUnit = avgCost > 0 ? avgCost : lastCost;

    const qr = this.ds.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      // Un ajustement POSITIF crée un lot disponible, que le FIFO consommera.
      // Un ajustement NÉGATIF doit au contraire *retirer* des lots existants :
      // se contenter d'écrire un lot 'adjusted' laissait les lots d'origine
      // intacts, et le recalcul depuis les lots effaçait la baisse à la
      // prochaine réception — même défaut que celui des livraisons (R015).
      const entry = qr.manager.create(StockEntry, {
        tenantId,
        rawMaterialId: dto.rawMaterialId,
        finishedProductId: dto.rawMaterialId,
        quantity: Math.abs(delta),
        costPerUnit,
        totalCost: Math.abs(delta) * costPerUnit,
        status: delta > 0 ? 'available' : 'adjusted',
        enteredAt: new Date(),
        createdBy: userId,
      });
      const saved = await qr.manager.save(StockEntry, entry);

      if (delta < 0) {
        await consumeStockFifo(
          qr, tenantId, dto.rawMaterialId, Math.abs(delta), 'adjusted',
        );
      }

      await qr.manager.query(`
        INSERT INTO stock_adjustments
          ("tenantId","rawMaterialId","stockEntryId","quantityAdjustment","reason","notes","adjustedBy","adjustedAt")
        VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())`,
        [tenantId, dto.rawMaterialId, saved.id, delta, dto.reason, dto.notes ?? null, userId],
      );

      // L'agrégat se recalcule depuis les lots, il ne s'écrit pas (R015) :
      // l'écriture directe qui existait ici était écrasée à la réception
      // suivante.
      await recomputeProductStock(qr, tenantId, dto.rawMaterialId);

      await qr.commitTransaction();
      return {
        data: {
          rawMaterialId: dto.rawMaterialId,
          quantityAdjustment: delta,
          newTotalQuantity: newQty,
          reason: dto.reason,
          notes: dto.notes ?? null,
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
