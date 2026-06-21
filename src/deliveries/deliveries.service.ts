import {
  Injectable, Logger, NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, QueryRunner, Repository } from 'typeorm';
import { DeliveryNote } from './entities/delivery-note.entity';
import { DeliveryNoteItem } from './entities/delivery-note-item.entity';
import { CreateDeliveryNoteDto, CreateDeliveryNoteItemDto } from './dto/create-delivery-note.dto';
import { UpdateDeliveryNoteStatusDto } from './dto/update-delivery-note-status.dto';
import { SignDeliveryNoteDto } from './dto/sign-delivery-note.dto';
import { ListDeliveryNotesDto } from './dto/list-delivery-notes.dto';

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  draft: ['sent', 'cancelled'],
  sent: ['delivered', 'cancelled'],
  signed: ['delivered', 'cancelled'],
  delivered: ['cancelled'],
  cancelled: [],
};

interface ComputedItem {
  finishedProductId: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  taxName1: string | null;
  taxRate1: number | null;
  taxAmount1: number;
  taxName2: string | null;
  taxRate2: number | null;
  taxAmount2: number;
  lineTaxTotal: number;
  lineTotal: number;
}

@Injectable()
export class DeliveriesService {
  private readonly logger = new Logger(DeliveriesService.name);

  constructor(
    @InjectRepository(DeliveryNote) private readonly dnRepo: Repository<DeliveryNote>,
    @InjectRepository(DeliveryNoteItem) private readonly itemRepo: Repository<DeliveryNoteItem>,
    private readonly dataSource: DataSource,
  ) {}

  // ─── Calculs financiers (R008) ────────────────────────────────────────────

  private computeItem(dto: CreateDeliveryNoteItemDto): ComputedItem {
    const lineHT = dto.quantity * dto.unitPrice;
    const taxAmount1 = dto.taxRate1 != null
      ? Math.round(lineHT * (dto.taxRate1 / 100) * 100) / 100 : 0;
    const taxAmount2 = dto.taxRate2 != null
      ? Math.round(lineHT * (dto.taxRate2 / 100) * 100) / 100 : 0;
    const lineTaxTotal = Math.round((taxAmount1 + taxAmount2) * 100) / 100;
    const lineTotal = Math.round((lineHT + lineTaxTotal) * 100) / 100;
    return {
      finishedProductId: dto.finishedProductId,
      quantity: dto.quantity,
      unit: dto.unit,
      unitPrice: dto.unitPrice,
      taxName1: dto.taxName1 ?? null,
      taxRate1: dto.taxRate1 ?? null,
      taxAmount1,
      taxName2: dto.taxName2 ?? null,
      taxRate2: dto.taxRate2 ?? null,
      taxAmount2,
      lineTaxTotal,
      lineTotal,
    };
  }

  private computeTotals(items: ComputedItem[]) {
    const subtotal = Math.round(items.reduce((s, i) => s + i.quantity * i.unitPrice, 0) * 100) / 100;
    const taxAmount = Math.round(items.reduce((s, i) => s + i.lineTaxTotal, 0) * 100) / 100;
    return { subtotal, taxAmount, total: Math.round((subtotal + taxAmount) * 100) / 100 };
  }

  // ─── Auto-numérotation BL-YY-### (R013) ──────────────────────────────────

  private async generateBlNumber(qr: QueryRunner, tenantId: string): Promise<string> {
    await qr.query(
      `SELECT pg_advisory_xact_lock(hashtext('bl_number_' || $1))`,
      [tenantId],
    );
    const year = new Date().getFullYear();
    const yy = String(year).slice(-2);
    const last = await qr.manager
      .createQueryBuilder(DeliveryNote, 'dn')
      .where('dn.tenantId = :tenantId', { tenantId })
      .andWhere('EXTRACT(YEAR FROM dn."createdAt") = :year', { year })
      .andWhere('dn.deletedAt IS NULL')
      .orderBy('dn.blNumber', 'DESC')
      .limit(1)
      .getOne();
    const lastSeq = last ? parseInt(last.blNumber.split('-')[2], 10) : 0;
    return `BL-${yy}-${String(lastSeq + 1).padStart(3, '0')}`;
  }

  // ─── Décrémentation FIFO (R015) ───────────────────────────────────────────
  // Réserve des stock_entries de produits finis (status available → reserved)

  private async decrementFIFO(
    qr: QueryRunner,
    tenantId: string,
    finishedProductId: string,
    quantityNeeded: number,
    deliveryNoteId: string,
  ): Promise<string | null> {
    const entries: { id: string; quantity: string }[] = await qr.query(
      `SELECT id, quantity FROM stock_entries
       WHERE "tenantId" = $1
         AND "finishedProductId" = $2
         AND status = 'available'
         AND "deletedAt" IS NULL
       ORDER BY "enteredAt" ASC`,
      [tenantId, finishedProductId],
    );

    let remaining = quantityNeeded;
    for (const entry of entries) {
      if (remaining <= 0) break;
      const available = parseFloat(entry.quantity);
      if (available <= remaining) {
        await qr.query(
          `UPDATE stock_entries SET status = 'reserved', "reservedByDeliveryNoteId" = $1
           WHERE id = $2 AND "tenantId" = $3`,
          [deliveryNoteId, entry.id, tenantId],
        );
        remaining -= available;
      } else {
        // Split: consume part of this entry
        await qr.query(
          `UPDATE stock_entries SET quantity = quantity - $1 WHERE id = $2 AND "tenantId" = $3`,
          [remaining, entry.id, tenantId],
        );
        await qr.query(
          `INSERT INTO stock_entries
             ("tenantId", "rawMaterialId", "finishedProductId", quantity, "costPerUnit", "totalCost",
              "enteredAt", status, "reservedByDeliveryNoteId",
              "createdAt", "updatedAt")
           SELECT "tenantId", "rawMaterialId", "finishedProductId", $1, "costPerUnit", "costPerUnit" * $1,
              "enteredAt", 'reserved', $2,
              now(), now()
           FROM stock_entries WHERE id = $3`,
          [remaining, deliveryNoteId, entry.id],
        );
        remaining = 0;
      }
    }

    let warning: string | null = null;
    if (remaining > 0.001) {
      // Allow negative stock: insert a deficit entry and continue
      warning = `Stock insuffisant pour le produit ${finishedProductId} : manque ${remaining.toFixed(2)} unités`;
      this.logger.warn(warning);
      await qr.query(
        `INSERT INTO stock_entries
           ("tenantId", "finishedProductId", quantity, "costPerUnit", "totalCost",
            "enteredAt", status, "reservedByDeliveryNoteId", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, 0, 0, now(), 'reserved', $4, now(), now())`,
        [tenantId, finishedProductId, -remaining, deliveryNoteId],
      );
    }

    // Always update finished_products.stockQuantity (may go negative)
    await qr.query(
      `UPDATE finished_products
       SET "stockQuantity" = COALESCE("stockQuantity", 0) - $1,
           "totalStockValue" = GREATEST(0, COALESCE("stockQuantity", 0) - $1) * COALESCE("averageCostPerUnit", 0),
           "updatedAt" = NOW()
       WHERE id = $2 AND "tenantId" = $3`,
      [quantityNeeded, finishedProductId, tenantId],
    );

    return warning;
  }

  // ─── Libération FIFO (annulation réservation lors de delete/update) ───────

  private async releaseFIFO(qr: QueryRunner, deliveryNoteId: string, tenantId: string): Promise<void> {
    // Collect per-product quantities to restore before releasing entries
    const reserved: { finishedProductId: string; qty: string }[] = await qr.query(
      `SELECT "finishedProductId", SUM(ABS(quantity)) AS qty
       FROM stock_entries
       WHERE "reservedByDeliveryNoteId" = $1 AND "tenantId" = $2 AND status = 'reserved'
       GROUP BY "finishedProductId"`,
      [deliveryNoteId, tenantId],
    );

    // Restore split entries to available; remove fully-consumed (inserted) reserved entries
    await qr.query(
      `UPDATE stock_entries SET status = 'available', "reservedByDeliveryNoteId" = NULL
       WHERE "reservedByDeliveryNoteId" = $1 AND "tenantId" = $2 AND status = 'reserved' AND quantity > 0`,
      [deliveryNoteId, tenantId],
    );
    await qr.query(
      `DELETE FROM stock_entries
       WHERE "reservedByDeliveryNoteId" = $1 AND "tenantId" = $2 AND status = 'reserved'`,
      [deliveryNoteId, tenantId],
    );

    // Restore stockQuantity on finished_products
    for (const row of reserved) {
      await qr.query(
        `UPDATE finished_products
         SET "stockQuantity" = COALESCE("stockQuantity", 0) + $1,
             "totalStockValue" = GREATEST(0, COALESCE("stockQuantity", 0) + $1) * COALESCE("averageCostPerUnit", 0),
             "updatedAt" = NOW()
         WHERE id = $2 AND "tenantId" = $3`,
        [parseFloat(row.qty), row.finishedProductId, tenantId],
      );
    }
  }

  // ─── CRUD ─────────────────────────────────────────────────────────────────

  async create(dto: CreateDeliveryNoteDto, tenantId: string, userId: string) {
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const blNumber = await this.generateBlNumber(qr, tenantId);
      const computed = dto.items.map((i) => this.computeItem(i));
      const totals = this.computeTotals(computed);

      const dn = qr.manager.create(DeliveryNote, {
        tenantId,
        blNumber,
        customerId: dto.customerId,
        deliveryDate: dto.deliveryDate as unknown as Date,
        notes: dto.notes ?? null,
        ...totals,
        status: 'draft',
        createdBy: userId,
        updatedBy: userId,
      });
      await qr.manager.save(DeliveryNote, dn);

      const items = computed.map((c) =>
        qr.manager.create(DeliveryNoteItem, { ...c, tenantId, deliveryNoteId: dn.id }),
      );
      await qr.manager.save(DeliveryNoteItem, items);

      // Décrémentation FIFO stock (R005, R015)
      const warnings: string[] = [];
      for (const item of computed) {
        const w = await this.decrementFIFO(qr, tenantId, item.finishedProductId, item.quantity, dn.id);
        if (w) warnings.push(w);
      }

      await qr.commitTransaction();
      const result = await this.findOne(dn.id, tenantId);
      return warnings.length ? { ...result, warnings } : result;
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  async findAll(dto: ListDeliveryNotesDto, tenantId: string) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;

    const qb = this.dnRepo
      .createQueryBuilder('dn')
      .leftJoinAndSelect('dn.customer', 'customer')
      .where('dn.tenantId = :tenantId', { tenantId })
      .andWhere('dn.deletedAt IS NULL');

    if (dto.status) qb.andWhere('dn.status = :status', { status: dto.status });
    if (dto.customerId) qb.andWhere('dn.customerId = :customerId', { customerId: dto.customerId });
    if (dto.dateFrom) qb.andWhere('dn.deliveryDate >= :dateFrom', { dateFrom: dto.dateFrom });
    if (dto.dateTo) qb.andWhere('dn.deliveryDate <= :dateTo', { dateTo: dto.dateTo });

    const [rows, total] = await qb
      .orderBy('dn.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    // Enrich with quoteNumber
    const quoteIds = rows.map(r => r.quoteId).filter(Boolean);
    let quoteMap: Record<string, string> = {};
    if (quoteIds.length) {
      const quotes = await this.dataSource.query(
        `SELECT id, "quoteNumber" FROM quotes WHERE id = ANY($1) AND "tenantId" = $2`,
        [quoteIds, tenantId],
      );
      quoteMap = Object.fromEntries(quotes.map((q: any) => [q.id, q.quoteNumber]));
    }
    const data = rows.map(r => ({ ...r, quoteNumber: r.quoteId ? quoteMap[r.quoteId] ?? null : null }));

    return { data, pagination: { total, page, limit } };
  }

  async findOne(id: string, tenantId: string) {
    const dn = await this.dnRepo.findOne({
      where: { id, tenantId, deletedAt: IsNull() },
      relations: ['items'],
    });
    if (!dn) throw new NotFoundException('delivery_note_not_found');
    return { data: dn };
  }

  async update(id: string, dto: CreateDeliveryNoteDto, tenantId: string, userId: string) {
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const dn = await qr.manager.findOne(DeliveryNote, {
        where: { id, tenantId, deletedAt: IsNull() },
      });
      if (!dn) throw new NotFoundException('delivery_note_not_found');
      if (dn.status !== 'draft') {
        throw new UnprocessableEntityException('delivery_note_cannot_update');
      }

      // Libère les réservations stock de l'ancien BL
      await this.releaseFIFO(qr, id, tenantId);

      // Supprime les anciens items
      await qr.query(`DELETE FROM delivery_note_items WHERE "deliveryNoteId" = $1 AND "tenantId" = $2`, [id, tenantId]);

      // Recalcule et recrée les items
      const computed = dto.items.map((i) => this.computeItem(i));
      const totals = this.computeTotals(computed);

      dn.customerId = dto.customerId;
      dn.deliveryDate = dto.deliveryDate as unknown as Date;
      dn.notes = dto.notes ?? null;
      dn.subtotal = totals.subtotal;
      dn.taxAmount = totals.taxAmount;
      dn.total = totals.total;
      dn.updatedBy = userId;
      await qr.manager.save(DeliveryNote, dn);

      const items = computed.map((c) =>
        qr.manager.create(DeliveryNoteItem, { ...c, tenantId, deliveryNoteId: id }),
      );
      await qr.manager.save(DeliveryNoteItem, items);

      // Redécrémente FIFO stock
      const warnings: string[] = [];
      for (const item of computed) {
        const w = await this.decrementFIFO(qr, tenantId, item.finishedProductId, item.quantity, id);
        if (w) warnings.push(w);
      }

      await qr.commitTransaction();
      const result = await this.findOne(id, tenantId);
      return warnings.length ? { ...result, warnings } : result;
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  async updateStatus(
    id: string,
    dto: UpdateDeliveryNoteStatusDto,
    tenantId: string,
    userId: string,
  ) {
    if (dto.status === 'cancelled') {
      return this.cancel(id, tenantId, userId);
    }

    const dn = await this.dnRepo.findOne({ where: { id, tenantId, deletedAt: IsNull() } });
    if (!dn) throw new NotFoundException('delivery_note_not_found');

    const allowed = ALLOWED_TRANSITIONS[dn.status] ?? [];
    if (!allowed.includes(dto.status)) {
      throw new UnprocessableEntityException('invalid_status_transition');
    }

    dn.status = dto.status;
    dn.updatedBy = userId;
    await this.dnRepo.save(dn);
    return { data: dn };
  }

  async cancel(id: string, tenantId: string, userId: string) {
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const dn = await qr.manager.findOne(DeliveryNote, {
        where: { id, tenantId, deletedAt: IsNull() },
      });
      if (!dn) throw new NotFoundException('delivery_note_not_found');

      const allowed = ALLOWED_TRANSITIONS[dn.status] ?? [];
      if (!allowed.includes('cancelled')) {
        throw new UnprocessableEntityException('invalid_status_transition');
      }
      if (dn.convertedToInvoiceId) {
        throw new UnprocessableEntityException('delivery_note_has_invoice');
      }

      await this.releaseFIFO(qr, id, tenantId);

      dn.status = 'cancelled';
      dn.updatedBy = userId;
      await qr.manager.save(DeliveryNote, dn);

      await qr.commitTransaction();
      return { data: dn };
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  async sign(id: string, dto: SignDeliveryNoteDto, tenantId: string, userId: string) {
    const dn = await this.dnRepo.findOne({ where: { id, tenantId, deletedAt: IsNull() } });
    if (!dn) throw new NotFoundException('delivery_note_not_found');
    if (!['draft', 'sent'].includes(dn.status)) {
      throw new UnprocessableEntityException('delivery_note_not_signable');
    }

    dn.customerSignature = dto.customerSignature;
    dn.signedDate = dto.signedDate ? dto.signedDate as unknown as Date : new Date() as any;
    dn.status = 'signed';
    dn.updatedBy = userId;
    await this.dnRepo.save(dn);
    return { data: dn };
  }

  // ─── Conversion Devis → BL (R005, R015) ──────────────────────────────────

  async createFromQuote(quoteId: string, tenantId: string, userId: string) {
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const rows = await qr.query(
        `SELECT * FROM quotes WHERE id = $1 AND "tenantId" = $2 AND "deletedAt" IS NULL`,
        [quoteId, tenantId],
      );
      if (!rows.length) throw new NotFoundException('quote_not_found');
      const quote = rows[0];
      if (quote.status !== 'accepted') throw new UnprocessableEntityException('quote_not_accepted');
      if (quote.convertedToDeliveryNoteId) {
        throw new UnprocessableEntityException('quote_already_converted_to_bl');
      }

      const quoteItems: any[] = await qr.query(
        `SELECT * FROM quote_items WHERE "quoteId" = $1 AND "tenantId" = $2`,
        [quoteId, tenantId],
      );

      const computed = quoteItems.map((it) => ({
        finishedProductId: it.finishedProductId,
        quantity: parseFloat(it.quantity),
        unit: it.unit,
        unitPrice: parseFloat(it.unitPrice),
        taxName1: it.taxName1 ?? null,
        taxRate1: it.taxRate1 != null ? parseFloat(it.taxRate1) : null,
        taxAmount1: parseFloat(it.taxAmount1 ?? '0'),
        taxName2: it.taxName2 ?? null,
        taxRate2: it.taxRate2 != null ? parseFloat(it.taxRate2) : null,
        taxAmount2: parseFloat(it.taxAmount2 ?? '0'),
        lineTaxTotal: parseFloat(it.lineTaxTotal ?? '0'),
        lineTotal: parseFloat(it.lineTotal ?? '0'),
      }));

      const blNumber = await this.generateBlNumber(qr, tenantId);
      const totals = this.computeTotals(computed);

      const dn = qr.manager.create(DeliveryNote, {
        tenantId,
        blNumber,
        customerId: quote.customerId,
        deliveryDate: new Date() as any,
        notes: quote.notes ?? null,
        quoteId,
        ...totals,
        status: 'draft',
        createdBy: userId,
        updatedBy: userId,
      });
      await qr.manager.save(DeliveryNote, dn);

      const dnItems = computed.map((c) =>
        qr.manager.create(DeliveryNoteItem, { ...c, tenantId, deliveryNoteId: dn.id }),
      );
      await qr.manager.save(DeliveryNoteItem, dnItems);

      const warnings: string[] = [];
      for (const item of computed) {
        const w = await this.decrementFIFO(qr, tenantId, item.finishedProductId, item.quantity, dn.id);
        if (w) warnings.push(w);
      }

      await qr.query(
        `UPDATE quotes SET "convertedToDeliveryNoteId" = $1, status = 'converted', "updatedBy" = $2, "updatedAt" = NOW()
         WHERE id = $3 AND "tenantId" = $4`,
        [dn.id, userId, quoteId, tenantId],
      );

      await qr.commitTransaction();
      const result = await this.findOne(dn.id, tenantId);
      return warnings.length ? { ...result, warnings } : result;
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  // ─── Conversion BL → Facture (R005, R008) ────────────────────────────────

  async createInvoice(blId: string, tenantId: string, userId: string) {
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const dn = await qr.manager.findOne(DeliveryNote, {
        where: { id: blId, tenantId, deletedAt: IsNull() },
        relations: ['items'],
      });
      if (!dn) throw new NotFoundException('delivery_note_not_found');
      if (!['sent', 'signed', 'delivered'].includes(dn.status)) {
        throw new UnprocessableEntityException('delivery_note_cannot_create_invoice');
      }
      if (dn.convertedToInvoiceId) {
        throw new UnprocessableEntityException('bl_already_converted_to_invoice');
      }

      await qr.query(
        `SELECT pg_advisory_xact_lock(hashtext('invoice_number_' || $1))`,
        [tenantId],
      );
      const year = new Date().getFullYear();
      const yy = String(year).slice(-2);
      const lastInv: any[] = await qr.query(
        `SELECT "invoiceNumber" FROM sales_invoices
         WHERE "tenantId" = $1 AND EXTRACT(YEAR FROM "createdAt") = $2 AND "deletedAt" IS NULL
         ORDER BY "invoiceNumber" DESC LIMIT 1`,
        [tenantId, year],
      );
      const lastSeq = lastInv.length > 0
        ? parseInt(lastInv[0].invoiceNumber.split('-')[2], 10)
        : 0;
      const invoiceNumber = `FAC-${yy}-${String(lastSeq + 1).padStart(3, '0')}`;

      const [invoice] = await qr.query(
        `INSERT INTO sales_invoices
           ("tenantId", "invoiceNumber", "customerId", "invoiceDate",
            "subtotal", "taxAmount", "totalAmount",
            "amountPaid", "amountDue", "status", "deliveryNoteId", "createdBy", "updatedBy")
         VALUES ($1,$2,$3,NOW(),$4,$5,$6,0,$7,'draft',$8,$9,$9)
         RETURNING *`,
        [
          tenantId, invoiceNumber, dn.customerId,
          dn.subtotal, dn.taxAmount, dn.total,
          dn.total, blId, userId,
        ],
      );

      for (const item of dn.items) {
        await qr.query(
          `INSERT INTO sales_invoice_items
             ("tenantId", "salesInvoiceId", "finishedProductId",
              "quantity", "unit", "unitPrice",
              "taxName1", "taxRate1", "taxAmount1",
              "taxName2", "taxRate2", "taxAmount2",
              "lineTaxTotal", "lineTotal")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
          [
            tenantId, invoice.id, item.finishedProductId,
            item.quantity, item.unit, item.unitPrice,
            item.taxName1, item.taxRate1, item.taxAmount1,
            item.taxName2, item.taxRate2, item.taxAmount2,
            item.lineTaxTotal, item.lineTotal,
          ],
        );
      }

      dn.convertedToInvoiceId = invoice.id;
      dn.updatedBy = userId;
      await qr.manager.save(DeliveryNote, dn);

      await qr.commitTransaction();
      return {
        data: {
          blConverted: { id: dn.id, blNumber: dn.blNumber, convertedToInvoiceId: invoice.id },
          invoiceCreated: invoice,
        },
      };
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  async remove(id: string, tenantId: string, userId: string) {
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const dn = await qr.manager.findOne(DeliveryNote, {
        where: { id, tenantId, deletedAt: IsNull() },
      });
      if (!dn) throw new NotFoundException('delivery_note_not_found');
      if (dn.status !== 'draft') {
        throw new UnprocessableEntityException('delivery_note_cannot_delete');
      }

      // Libère les réservations stock avant suppression
      await this.releaseFIFO(qr, id, tenantId);

      dn.updatedBy = userId;
      await qr.manager.save(DeliveryNote, dn);
      await qr.manager.softDelete(DeliveryNote, id);

      await qr.commitTransaction();
      return { data: { deleted: true } };
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }
}
