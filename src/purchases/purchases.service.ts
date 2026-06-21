import {
  Injectable, NotFoundException, UnprocessableEntityException, Logger,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, IsNull } from 'typeorm';
import { PurchaseOrder } from './entities/purchase-order.entity';
import { PurchaseOrderItem } from './entities/purchase-order-item.entity';
import { ReceptionBL } from './entities/reception-bl.entity';
import { StockEntry } from '../stock/stock-entry.entity';
import { FinishedProduct } from '../products/finished-product.entity';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { ListPurchaseOrdersDto } from './dto/list-purchase-orders.dto';
import { PatchPoStatusDto } from './dto/patch-po-status.dto';
import { CreateReceptionBlDto } from './dto/create-reception-bl.dto';
import { ListReceptionBlsDto } from './dto/list-reception-bls.dto';
import { UpdatePurchaseOrderDto } from './dto/update-purchase-order.dto';
import { CreateVendorBillDto } from './dto/create-vendor-bill.dto';
import { ListVendorBillsDto } from './dto/list-vendor-bills.dto';
import { RecordVendorPaymentDto } from './dto/record-vendor-payment.dto';

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
      const taxRate = dto.taxRate ?? 0;
      const taxAmount = Number((subtotal * taxRate / 100).toFixed(2));
      const total = Number((subtotal + taxAmount).toFixed(2));

      const po = qr.manager.create(PurchaseOrder, {
        tenantId,
        poNumber,
        supplierId: dto.supplierId,
        status: 'draft',
        orderDate: dto.orderDate as unknown as Date,
        expectedDeliveryDate: dto.expectedDeliveryDate as unknown as Date ?? null,
        taxRate,
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

  async updatePurchaseOrder(id: string, dto: UpdatePurchaseOrderDto, tenantId: string, userId: string) {
    const po = await this.dataSource.manager.findOne(PurchaseOrder, {
      where: { id, tenantId, deletedAt: IsNull() },
    });
    if (!po) throw new NotFoundException('errors.purchase_order_not_found');
    if (po.status !== 'draft') {
      throw new UnprocessableEntityException('errors.po_cannot_edit_non_draft');
    }

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      if (dto.supplierId !== undefined) po.supplierId = dto.supplierId;
      if (dto.orderDate !== undefined) po.orderDate = dto.orderDate as unknown as Date;
      if (dto.expectedDeliveryDate !== undefined) po.expectedDeliveryDate = dto.expectedDeliveryDate as unknown as Date ?? null;
      if (dto.notes !== undefined) po.notes = dto.notes ?? null;
      po.updatedBy = userId;

      if (dto.items && dto.items.length > 0) {
        await qr.manager.delete(PurchaseOrderItem, { purchaseOrderId: id, tenantId });
        const items = dto.items.map((item) => ({
          ...item,
          lineTotal: Number((item.quantity * item.unitPrice).toFixed(2)),
          tenantId,
          purchaseOrderId: id,
        }));
        po.subtotal = Number(items.reduce((s, i) => s + i.lineTotal, 0).toFixed(2));
        po.taxRate = dto.taxRate ?? po.taxRate ?? 0;
        po.taxAmount = Number((po.subtotal * po.taxRate / 100).toFixed(2));
        po.total = Number((po.subtotal + po.taxAmount).toFixed(2));
        await qr.manager.save(PurchaseOrder, po);
        await qr.manager.save(PurchaseOrderItem, items.map(i => qr.manager.create(PurchaseOrderItem, i)));
      } else {
        await qr.manager.save(PurchaseOrder, po);
      }

      await qr.commitTransaction();
      return { data: po };
    } catch (error) {
      await qr.rollbackTransaction();
      throw error;
    } finally {
      await qr.release();
    }
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
          finishedProductId: item.rawMaterialId,
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

        // Update product stock fields
        await this.updateProductStock(qr, tenantId, item.rawMaterialId);
        const updatedProduct = await qr.manager.findOne(FinishedProduct, {
          where: { id: item.rawMaterialId, tenantId },
        });
        if (updatedProduct) {
          inventoryUpdated.push({
            rawMaterialId: item.rawMaterialId,
            newTotalQuantity: Number(updatedProduct.stockQuantity),
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

  // ─── Vendor Bills ──────────────────────────────────────────────────────────

  async createVendorBill(dto: CreateVendorBillDto, tenantId: string, userId: string) {
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      await qr.query(
        `SELECT pg_advisory_xact_lock(hashtext('vendor_bill_number_' || $1))`,
        [tenantId],
      );
      const billNumber = await this.generateVendorBillNumber(qr, tenantId);

      const items = dto.items.map((item) => {
        const lineHT = Math.round(item.quantity * item.unitPrice * 100) / 100;
        const taxAmount = item.taxRate != null
          ? Math.round(lineHT * (item.taxRate / 100) * 100) / 100
          : 0;
        return { ...item, lineHT, taxAmount, lineTotal: Math.round((lineHT + taxAmount) * 100) / 100 };
      });
      const subtotal = Math.round(items.reduce((s, i) => s + i.lineHT, 0) * 100) / 100;
      const taxAmount = Math.round(items.reduce((s, i) => s + i.taxAmount, 0) * 100) / 100;
      const totalAmount = Math.round((subtotal + taxAmount) * 100) / 100;

      const [bill] = await qr.query(`
        INSERT INTO vendor_bills
          ("tenantId","billNumber","supplierId","purchaseOrderId","receptionBlId",
           "billDate","dueDate","subtotal","taxAmount","totalAmount","amountPaid","amountDue",
           "status","notes","createdBy","updatedBy")
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,0,$11,'draft',$12,$13,$13)
        RETURNING *`,
        [
          tenantId, billNumber, dto.supplierId,
          dto.purchaseOrderId ?? null, dto.receptionBlId ?? null,
          dto.billDate, dto.dueDate ?? null,
          subtotal, taxAmount, totalAmount, totalAmount,
          dto.notes ?? null, userId,
        ],
      );

      for (const item of items) {
        await qr.query(`
          INSERT INTO vendor_bill_items
            ("tenantId","vendorBillId","finishedProductId","description",
             "quantity","unit","unitPrice","taxRate","taxAmount","lineTotal")
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [
            tenantId, bill.id, item.finishedProductId ?? null, item.description ?? null,
            item.quantity, item.unit, item.unitPrice,
            item.taxRate ?? null, item.taxAmount, item.lineTotal,
          ],
        );
      }

      await qr.commitTransaction();
      return this.findOneVendorBill(bill.id, tenantId);
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  async findAllVendorBills(dto: ListVendorBillsDto, tenantId: string) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const offset = (page - 1) * limit;

    let where = `vb."tenantId" = $1 AND vb."deletedAt" IS NULL`;
    const params: any[] = [tenantId];
    let idx = 2;

    if (dto.status) { where += ` AND vb.status = $${idx++}`; params.push(dto.status); }
    if (dto.supplierId) { where += ` AND vb."supplierId" = $${idx++}`; params.push(dto.supplierId); }
    if (dto.dateFrom) { where += ` AND vb."billDate" >= $${idx++}`; params.push(dto.dateFrom); }
    if (dto.dateTo) { where += ` AND vb."billDate" <= $${idx++}`; params.push(dto.dateTo); }

    const countRow = await this.dataSource.query(
      `SELECT COUNT(*) AS total FROM vendor_bills vb WHERE ${where}`,
      params,
    );
    const total = parseInt(countRow[0].total);

    const rows = await this.dataSource.query(
      `SELECT vb.*, s.name AS "supplierName"
       FROM vendor_bills vb
       LEFT JOIN partners s ON s.id = vb."supplierId"
       WHERE ${where}
       ORDER BY vb."billDate" DESC, vb."createdAt" DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, limit, offset],
    );

    return { data: rows, pagination: { total, page, limit } };
  }

  async findOneVendorBill(id: string, tenantId: string) {
    const rows = await this.dataSource.query(
      `SELECT vb.*, s.name AS "supplierName"
       FROM vendor_bills vb
       LEFT JOIN partners s ON s.id = vb."supplierId"
       WHERE vb.id = $1 AND vb."tenantId" = $2 AND vb."deletedAt" IS NULL`,
      [id, tenantId],
    );
    if (!rows.length) throw new NotFoundException('vendor_bill_not_found');
    const bill = rows[0];

    const [items, payments] = await Promise.all([
      this.dataSource.query(
        `SELECT vbi.*, fp.name AS "productName"
         FROM vendor_bill_items vbi
         LEFT JOIN finished_products fp ON fp.id = vbi."finishedProductId"
         WHERE vbi."vendorBillId" = $1 ORDER BY vbi."createdAt" ASC`,
        [id],
      ),
      this.dataSource.query(
        `SELECT * FROM vendor_payments WHERE "vendorBillId" = $1 ORDER BY "paymentDate" ASC`,
        [id],
      ),
    ]);

    return { data: { ...bill, items, payments } };
  }

  async updateVendorBill(id: string, dto: CreateVendorBillDto, tenantId: string, userId: string) {
    const bill = await this.dataSource.query(
      `SELECT * FROM vendor_bills WHERE id = $1 AND "tenantId" = $2 AND "deletedAt" IS NULL`,
      [id, tenantId],
    );
    if (!bill.length) throw new NotFoundException('vendor_bill_not_found');
    if (bill[0].status !== 'draft') throw new UnprocessableEntityException('vendor_bill_cannot_update');

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      await qr.query(`DELETE FROM vendor_bill_items WHERE "vendorBillId" = $1`, [id]);

      const items = dto.items.map((item) => {
        const lineHT = Math.round(item.quantity * item.unitPrice * 100) / 100;
        const taxAmount = item.taxRate != null
          ? Math.round(lineHT * (item.taxRate / 100) * 100) / 100
          : 0;
        return { ...item, lineHT, taxAmount, lineTotal: Math.round((lineHT + taxAmount) * 100) / 100 };
      });
      const subtotal = Math.round(items.reduce((s, i) => s + i.lineHT, 0) * 100) / 100;
      const taxAmount = Math.round(items.reduce((s, i) => s + i.taxAmount, 0) * 100) / 100;
      const totalAmount = Math.round((subtotal + taxAmount) * 100) / 100;

      await qr.query(`
        UPDATE vendor_bills
        SET "supplierId"=$1,"purchaseOrderId"=$2,"receptionBlId"=$3,
            "billDate"=$4,"dueDate"=$5,"subtotal"=$6,"taxAmount"=$7,
            "totalAmount"=$8,"amountDue"=$9,"notes"=$10,"updatedBy"=$11,"updatedAt"=NOW()
        WHERE id=$12`,
        [
          dto.supplierId, dto.purchaseOrderId ?? null, dto.receptionBlId ?? null,
          dto.billDate, dto.dueDate ?? null, subtotal, taxAmount, totalAmount, totalAmount,
          dto.notes ?? null, userId, id,
        ],
      );

      for (const item of items) {
        await qr.query(`
          INSERT INTO vendor_bill_items
            ("tenantId","vendorBillId","finishedProductId","description",
             "quantity","unit","unitPrice","taxRate","taxAmount","lineTotal")
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [
            tenantId, id, item.finishedProductId ?? null, item.description ?? null,
            item.quantity, item.unit, item.unitPrice,
            item.taxRate ?? null, item.taxAmount, item.lineTotal,
          ],
        );
      }

      await qr.commitTransaction();
      return this.findOneVendorBill(id, tenantId);
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  async patchVendorBillStatus(id: string, status: string, tenantId: string, userId: string) {
    const rows = await this.dataSource.query(
      `SELECT * FROM vendor_bills WHERE id = $1 AND "tenantId" = $2 AND "deletedAt" IS NULL`,
      [id, tenantId],
    );
    if (!rows.length) throw new NotFoundException('vendor_bill_not_found');
    const bill = rows[0];

    const allowed: Record<string, string[]> = {
      draft: ['validated', 'cancelled'],
      validated: ['cancelled'],
      partial: ['cancelled'],
    };
    if (!(allowed[bill.status] ?? []).includes(status)) {
      throw new UnprocessableEntityException('invalid_status_transition');
    }

    await this.dataSource.query(
      `UPDATE vendor_bills SET status=$1,"updatedBy"=$2,"updatedAt"=NOW() WHERE id=$3`,
      [status, userId, id],
    );
    return this.findOneVendorBill(id, tenantId);
  }

  async removeVendorBill(id: string, tenantId: string) {
    const rows = await this.dataSource.query(
      `SELECT status FROM vendor_bills WHERE id = $1 AND "tenantId" = $2 AND "deletedAt" IS NULL`,
      [id, tenantId],
    );
    if (!rows.length) throw new NotFoundException('vendor_bill_not_found');
    if (!['draft', 'cancelled'].includes(rows[0].status)) {
      throw new UnprocessableEntityException('vendor_bill_cannot_delete');
    }
    await this.dataSource.query(
      `UPDATE vendor_bills SET "deletedAt"=NOW() WHERE id=$1`,
      [id],
    );
  }

  async recordVendorPayment(billId: string, dto: RecordVendorPaymentDto, tenantId: string, userId: string) {
    const rows = await this.dataSource.query(
      `SELECT * FROM vendor_bills WHERE id = $1 AND "tenantId" = $2 AND "deletedAt" IS NULL`,
      [billId, tenantId],
    );
    if (!rows.length) throw new NotFoundException('vendor_bill_not_found');
    const bill = rows[0];
    if (!['validated', 'partial'].includes(bill.status)) {
      throw new UnprocessableEntityException('vendor_bill_cannot_pay');
    }

    const currentPaid = parseFloat(bill.amountPaid);
    const newPaid = Math.round((currentPaid + dto.amount) * 100) / 100;
    const totalAmount = parseFloat(bill.totalAmount);
    const newDue = Math.round(Math.max(totalAmount - newPaid, 0) * 100) / 100;
    const newStatus = newDue <= 0 ? 'paid' : 'partial';

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      await qr.query(`
        INSERT INTO vendor_payments
          ("tenantId","vendorBillId","amount","paymentDate","method","reference","createdBy")
        VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [tenantId, billId, dto.amount, dto.paymentDate, dto.method, dto.reference ?? null, userId],
      );
      await qr.query(`
        UPDATE vendor_bills
        SET "amountPaid"=$1,"amountDue"=$2,status=$3,"updatedBy"=$4,"updatedAt"=NOW()
        WHERE id=$5`,
        [newPaid, newDue, newStatus, userId, billId],
      );
      await qr.commitTransaction();
      return this.findOneVendorBill(billId, tenantId);
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private async generateVendorBillNumber(
    qr: ReturnType<DataSource['createQueryRunner']>,
    tenantId: string,
  ): Promise<string> {
    const year = new Date().getFullYear();
    const yy = String(year).slice(-2);
    const last: any[] = await qr.query(
      `SELECT "billNumber" FROM vendor_bills
       WHERE "tenantId"=$1 AND EXTRACT(YEAR FROM "createdAt")=$2 AND "deletedAt" IS NULL
       ORDER BY "billNumber" DESC LIMIT 1`,
      [tenantId, year],
    );
    const lastSeq = last.length > 0
      ? parseInt(last[0].billNumber.split('-')[3] ?? '0', 10)
      : 0;
    return `FAC-ACH-${yy}-${String(lastSeq + 1).padStart(3, '0')}`;
  }

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

  private async updateProductStock(
    qr: ReturnType<DataSource['createQueryRunner']>,
    tenantId: string,
    rawMaterialId: string,
  ): Promise<void> {
    const entries = await qr.manager
      .createQueryBuilder(StockEntry, 'se')
      .where('se.tenantId = :tenantId', { tenantId })
      .andWhere('se.finishedProductId = :rawMaterialId', { rawMaterialId })
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

    await qr.manager.query(`
      UPDATE finished_products
      SET "stockQuantity"          = $1,
          "averageCostPerUnit"     = $2,
          "totalStockValue"        = $3,
          "earliestExpirationDate" = $4,
          "updatedAt"              = NOW()
      WHERE id = $5 AND "tenantId" = $6`,
      [totalQuantity, averageCostPerUnit, totalValue, earliestExpirationDate, rawMaterialId, tenantId],
    );
  }
}
