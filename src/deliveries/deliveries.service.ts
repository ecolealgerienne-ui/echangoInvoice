import {
  BadRequestException, Injectable, Logger, NotFoundException,
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
  draft: ['sent'],
  sent: ['signed'],
  signed: ['delivered'],
  delivered: [],
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
  ): Promise<void> {
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
           WHERE id = $2`,
          [deliveryNoteId, entry.id],
        );
        remaining -= available;
      } else {
        // Split: consume part of this entry
        await qr.query(
          `UPDATE stock_entries SET quantity = quantity - $1 WHERE id = $2`,
          [remaining, entry.id],
        );
        await qr.query(
          `INSERT INTO stock_entries
             ("tenantId", "finishedProductId", quantity, "costPerUnit", "totalCost",
              "enteredAt", status, "reservedByDeliveryNoteId",
              "createdAt", "updatedAt")
           SELECT "tenantId", "finishedProductId", $1, "costPerUnit", "costPerUnit" * $1,
              "enteredAt", 'reserved', $2,
              now(), now()
           FROM stock_entries WHERE id = $3`,
          [remaining, deliveryNoteId, entry.id],
        );
        remaining = 0;
      }
    }

    if (remaining > 0.001) {
      throw new BadRequestException(
        `Stock insuffisant pour le produit ${finishedProductId} : manque ${remaining.toFixed(2)} unités`,
      );
    }
  }

  // ─── Libération FIFO (annulation réservation lors de delete/update) ───────

  private async releaseFIFO(qr: QueryRunner, deliveryNoteId: string): Promise<void> {
    await qr.query(
      `UPDATE stock_entries SET status = 'available', "reservedByDeliveryNoteId" = NULL
       WHERE "reservedByDeliveryNoteId" = $1 AND status = 'reserved'`,
      [deliveryNoteId],
    );
    // Remove split zero-quantity entries (cleanup)
    await qr.query(
      `DELETE FROM stock_entries
       WHERE "reservedByDeliveryNoteId" = $1 AND status = 'reserved'`,
      [deliveryNoteId],
    );
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
      for (const item of computed) {
        await this.decrementFIFO(qr, tenantId, item.finishedProductId, item.quantity, dn.id);
      }

      await qr.commitTransaction();
      return this.findOne(dn.id, tenantId);
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
      .where('dn.tenantId = :tenantId', { tenantId })
      .andWhere('dn.deletedAt IS NULL');

    if (dto.status) qb.andWhere('dn.status = :status', { status: dto.status });
    if (dto.customerId) qb.andWhere('dn.customerId = :customerId', { customerId: dto.customerId });
    if (dto.dateFrom) qb.andWhere('dn.deliveryDate >= :dateFrom', { dateFrom: dto.dateFrom });
    if (dto.dateTo) qb.andWhere('dn.deliveryDate <= :dateTo', { dateTo: dto.dateTo });

    const [data, total] = await qb
      .orderBy('dn.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

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

  async updateStatus(
    id: string,
    dto: UpdateDeliveryNoteStatusDto,
    tenantId: string,
    userId: string,
  ) {
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
      await this.releaseFIFO(qr, id);

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
