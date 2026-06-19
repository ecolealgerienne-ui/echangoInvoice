import {
  Injectable, NotFoundException, UnprocessableEntityException, Logger,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, IsNull } from 'typeorm';
import { PurchaseOrder } from './entities/purchase-order.entity';
import { PurchaseOrderItem } from './entities/purchase-order-item.entity';
import { ReceptionBL } from './entities/reception-bl.entity';
import { StockEntry } from '../stock/stock-entry.entity';
import { InventorySummary } from '../stock/inventory-summary.entity';
import { FinishedProduct } from '../products/finished-product.entity';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { ListPurchaseOrdersDto } from './dto/list-purchase-orders.dto';
import { PatchPoStatusDto } from './dto/patch-po-status.dto';
import { CreateReceptionBlDto } from './dto/create-reception-bl.dto';
import { ListReceptionBlsDto } from './dto/list-reception-bls.dto';

const VALID_TRANSITIONS: Record<string, string[]> = {
  draft: ['sent', 'cancelled'],
  sent: ['received', 'cancelled'],
  received: [],
  cancelled: [],
};

@Injectable()
export class PurchasesService {
  private readonly logger = new Logger(PurchasesService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  // ─── Purchase Orders ───────────────────────────────────────────────────────

  async createPurchaseOrder(dto: CreatePurchaseOrderDto, tenantId: string, userId: string) {
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      // Advisory lock per tenant to avoid duplicate PO numbers (R013)
      await qr.query(`SELECT pg_advisory_xact_lock(hashtext('po_number_' || $1))`, [tenantId]);

      const poNumber = await this.generatePoNumber(qr, tenantId);

      // Calculate totals (R008 — backend only)
      const items = dto.items.map((item) => ({
        ...item,
        lineTotal: Number((item.quantity * item.unitPrice).toFixed(2)),
        tenantId,
      }));
      const subtotal = Number(items.reduce((s, i) => s + i.lineTotal, 0).toFixed(2));
      // taxAmount will be managed at settings level; here 0 for PO (no TVA on purchase order itself)
      const taxAmount = 0;
      const total = Number((subtotal + taxAmount).toFixed(2));

      const po = qr.manager.create(PurchaseOrder, {
        tenantId,
        poNumber,
        supplierId: dto.supplierId,
        status: 'draft',
        orderDate: dto.orderDate as unknown as Date,
        expectedDeliveryDate: dto.expectedDeliveryDate as unknown as Date ?? null,
        subtotal,
        taxAmount,
        total,
        notes: dto.notes ?? null,
        createdBy: userId,
        updatedBy: userId,
      });
      await qr.manager.save(PurchaseOrder, po);

      const savedItems = await qr.manager.save(
        PurchaseOrderItem,
        items.map((item) =>
          qr.manager.create(PurchaseOrderItem, { ...item, purchaseOrderId: po.id }),
        ),
      );

      await qr.commitTransaction();
      this.logger.log(`PO created: ${poNumber} for tenant ${tenantId}`);
      return { data: { ...po, items: savedItems } };
    } catch (error) {
      await qr.rollbackTransaction();
      throw error;
    } finally {
      await qr.release();
    }
  }

  async findAllPurchaseOrders(query: ListPurchaseOrdersDto, tenantId: string) {
    const { page, limit, status, supplierId, dateFrom, dateTo } = query;
    const skip = (page - 1) * limit;

    const qb = this.dataSource
      .createQueryBuilder(PurchaseOrder, 'po')
      .where('po.tenantId = :tenantId', { tenantId })
      .andWhere('po.deletedAt IS NULL')
      .orderBy('po.orderDate', 'DESC')
      .skip(skip)
      .take(limit);

    if (status) qb.andWhere('po.status = :status', { status });
    if (supplierId) qb.andWhere('po.supplierId = :supplierId', { supplierId });
    if (dateFrom) qb.andWhere('po.orderDate >= :dateFrom', { dateFrom });
    if (dateTo) qb.andWhere('po.orderDate <= :dateTo', { dateTo });

    const [data, total] = await qb.getManyAndCount();
    return { data, pagination: { total, page, limit } };
  }

  async findOnePurchaseOrder(id: string, tenantId: string) {
    const po = await this.dataSource.manager.findOne(PurchaseOrder, {
      where: { id, tenantId, deletedAt: IsNull() },
    });
    if (!po) throw new NotFoundException('errors.purchase_order_not_found');

    const items = await this.dataSource.manager.find(PurchaseOrderItem, {
      where: { purchaseOrderId: id, tenantId },
      order: { createdAt: 'ASC' },
    });

    const receptions = await this.dataSource.manager.find(ReceptionBL, {
      where: { purchaseOrderId: id, tenantId, deletedAt: IsNull() },
      order: { receptionDate: 'DESC' },
    });

    return { data: { ...po, items, receptions } };
  }

  async patchPoStatus(id: string, dto: PatchPoStatusDto, tenantId: string, userId: string) {
    const po = await this.dataSource.manager.findOne(PurchaseOrder, {
      where: { id, tenantId, deletedAt: IsNull() },
    });
    if (!po) throw new NotFoundException('errors.purchase_order_not_found');

    const allowed = VALID_TRANSITIONS[po.status] ?? [];
    if (!allowed.includes(dto.status)) {
      throw new UnprocessableEntityException(
        `errors.invalid_status_transition`,
      );
    }

    // Cannot cancel if a reception BL already exists
    if (dto.status === 'cancelled') {
      const hasReception = await this.dataSource.manager.findOne(ReceptionBL, {
        where: { purchaseOrderId: id, tenantId, deletedAt: IsNull() },
      });
      if (hasReception) {
        throw new UnprocessableEntityException('errors.po_has_reception');
      }
    }

    po.status = dto.status;
    po.updatedBy = userId;
    await this.dataSource.manager.save(PurchaseOrder, po);
    return { data: po };
  }

  async removePurchaseOrder(id: string, tenantId: string) {
    const po = await this.dataSource.manager.findOne(PurchaseOrder, {
      where: { id, tenantId, deletedAt: IsNull() },
    });
    if (!po) throw new NotFoundException('errors.purchase_order_not_found');
    if (!['draft', 'cancelled'].includes(po.status)) {
      throw new UnprocessableEntityException('errors.po_cannot_delete');
    }
    await this.dataSource.manager.softDelete(PurchaseOrder, id);
  }

  // ─── Reception BLs ─────────────────────────────────────────────────────────

  async createReceptionBl(dto: CreateReceptionBlDto, tenantId: string, userId: string) {
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      // Advisory lock for BL-REC number (R013)
      await qr.query(`SELECT pg_advisory_xact_lock(hashtext('bl_rec_number_' || $1))`, [tenantId]);

      const po = await qr.manager.findOne(PurchaseOrder, {
        where: { id: dto.purchaseOrderId, tenantId, deletedAt: IsNull() },
      });
      if (!po) throw new NotFoundException('errors.purchase_order_not_found');
      if (!['sent', 'draft'].includes(po.status)) {
        throw new UnprocessableEntityException('errors.po_wrong_status_for_reception');
      }

      const blNumber = await this.generateBlRecNumber(qr, tenantId);

      // 1. Create ReceptionBL
      const totalQty = Number(
        dto.items.reduce((s, i) => s + i.quantityReceived, 0).toFixed(2),
      );
      const bl = qr.manager.create(ReceptionBL, {
        tenantId,
        blNumber,
        purchaseOrderId: dto.purchaseOrderId,
        receptionDate: dto.receptionDate as unknown as Date,
        status: 'completed',
        totalQuantityReceived: totalQty,
        notes: dto.notes ?? null,
        createdBy: userId,
        updatedBy: userId,
      });
      await qr.manager.save(ReceptionBL, bl);

      // 2. Create StockEntry per item + update InventorySummary
      const stockEntriesCreated: StockEntry[] = [];
      const inventoryUpdated: { rawMaterialId: string; newTotalQuantity: number }[] = [];

      for (const item of dto.items) {
        const totalCost = Number((item.quantityReceived * item.costPerUnit).toFixed(2));
        const entry = qr.manager.create(StockEntry, {
          tenantId,
          rawMaterialId: item.rawMaterialId,
          receptionBlId: bl.id,
          quantity: item.quantityReceived,
          costPerUnit: item.costPerUnit,
          totalCost,
          batchNumber: item.batchNumber ?? null,
          expiresAt: item.expiresAt ? new Date(item.expiresAt) : null,
          status: 'available',
          enteredAt: new Date(),
          createdBy: userId,
        });
        await qr.manager.save(StockEntry, entry);
        stockEntriesCreated.push(entry);

        // Update InventorySummary (upsert)
        await this.updateInventorySummary(qr, tenantId, item.rawMaterialId);
        const summary = await qr.manager.findOne(InventorySummary, {
          where: { tenantId, rawMaterialId: item.rawMaterialId },
        });
        if (summary) {
          inventoryUpdated.push({
            rawMaterialId: item.rawMaterialId,
            newTotalQuantity: Number(summary.totalQuantity),
          });
        }

        await qr.manager.update(FinishedProduct, { id: item.rawMaterialId, tenantId }, {
          lastCostPerUnit: item.costPerUnit,
        });
      }

      // 3. Update PO status → received (or keep sent if partial)
      po.status = 'received';
      po.updatedBy = userId;
      await qr.manager.save(PurchaseOrder, po);

      await qr.commitTransaction();
      this.logger.log(`ReceptionBL created: ${blNumber} for tenant ${tenantId}`);

      return {
        data: { ...bl, stockEntriesCreated, inventorySummaryUpdated: inventoryUpdated },
      };
    } catch (error) {
      await qr.rollbackTransaction();
      throw error;
    } finally {
      await qr.release();
    }
  }

  async findAllReceptionBls(query: ListReceptionBlsDto, tenantId: string) {
    const { page, limit, status } = query;
    const skip = (page - 1) * limit;

    const qb = this.dataSource
      .createQueryBuilder(ReceptionBL, 'bl')
      .where('bl.tenantId = :tenantId', { tenantId })
      .andWhere('bl.deletedAt IS NULL')
      .orderBy('bl.receptionDate', 'DESC')
      .skip(skip)
      .take(limit);

    if (status) qb.andWhere('bl.status = :status', { status });

    const [data, total] = await qb.getManyAndCount();
    return { data, pagination: { total, page, limit } };
  }

  async findOneReceptionBl(id: string, tenantId: string) {
    const bl = await this.dataSource.manager.findOne(ReceptionBL, {
      where: { id, tenantId, deletedAt: IsNull() },
    });
    if (!bl) throw new NotFoundException('errors.reception_bl_not_found');

    const stockEntries = await this.dataSource.manager.find(StockEntry, {
      where: { receptionBlId: id, tenantId },
      order: { enteredAt: 'ASC' },
    });

    return { data: { ...bl, stockEntries } };
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private async generatePoNumber(
    qr: ReturnType<DataSource['createQueryRunner']>,
    tenantId: string,
  ): Promise<string> {
    const year = new Date().getFullYear();
    const yy = String(year).slice(-2);
    const last = await qr.manager
      .createQueryBuilder(PurchaseOrder, 'po')
      .where('po.tenantId = :tenantId', { tenantId })
      .andWhere(`EXTRACT(YEAR FROM po."createdAt") = :year`, { year })
      .withDeleted()
      .orderBy('po.poNumber', 'DESC')
      .limit(1)
      .getOne();
    const lastSeq = last ? parseInt(last.poNumber.split('-')[2] ?? '0', 10) : 0;
    return `PO-${yy}-${String(lastSeq + 1).padStart(3, '0')}`;
  }

  private async generateBlRecNumber(
    qr: ReturnType<DataSource['createQueryRunner']>,
    tenantId: string,
  ): Promise<string> {
    const year = new Date().getFullYear();
    const yy = String(year).slice(-2);
    const last = await qr.manager
      .createQueryBuilder(ReceptionBL, 'bl')
      .where('bl.tenantId = :tenantId', { tenantId })
      .andWhere(`EXTRACT(YEAR FROM bl."createdAt") = :year`, { year })
      .withDeleted()
      .orderBy('bl.blNumber', 'DESC')
      .limit(1)
      .getOne();
    const lastSeq = last ? parseInt(last.blNumber.split('-')[3] ?? '0', 10) : 0;
    return `BL-REC-${yy}-${String(lastSeq + 1).padStart(3, '0')}`;
  }

  private async updateInventorySummary(
    qr: ReturnType<DataSource['createQueryRunner']>,
    tenantId: string,
    rawMaterialId: string,
  ): Promise<void> {
    // Recalculate from all available stock entries (source of truth)
    const entries = await qr.manager
      .createQueryBuilder(StockEntry, 'se')
      .where('se.tenantId = :tenantId', { tenantId })
      .andWhere('se.rawMaterialId = :rawMaterialId', { rawMaterialId })
      .andWhere('se.status = :status', { status: 'available' })
      .getMany();

    const totalQuantity = entries.reduce((s, e) => s + Number(e.quantity), 0);
    const totalValue = entries.reduce((s, e) => s + Number(e.totalCost), 0);
    const averageCostPerUnit = totalQuantity > 0
      ? Number((totalValue / totalQuantity).toFixed(2))
      : 0;
    const expirations = entries
      .filter((e) => e.expiresAt !== null)
      .map((e) => e.expiresAt as Date)
      .sort((a, b) => a.getTime() - b.getTime());
    const earliestExpirationDate = expirations[0] ?? null;

    const existing = await qr.manager.findOne(InventorySummary, {
      where: { tenantId, rawMaterialId },
    });

    if (existing) {
      await qr.manager.update(InventorySummary, { id: existing.id }, {
        totalQuantity,
        averageCostPerUnit,
        totalValue,
        earliestExpirationDate,
      });
    } else {
      await qr.manager.save(
        InventorySummary,
        qr.manager.create(InventorySummary, {
          tenantId,
          rawMaterialId,
          totalQuantity,
          averageCostPerUnit,
          totalValue,
          earliestExpirationDate,
        }),
      );
    }
  }
}
