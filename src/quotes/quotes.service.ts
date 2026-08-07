import {
  Injectable, Logger, NotFoundException, UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, QueryRunner, Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { Quote } from './entities/quote.entity';
import { QuoteItem } from './entities/quote-item.entity';
import { CreateQuoteDto, CreateQuoteItemDto } from './dto/create-quote.dto';
import { UpdateQuoteDto } from './dto/update-quote.dto';
import { UpdateQuoteStatusDto } from './dto/update-quote-status.dto';
import { ListQuotesDto } from './dto/list-quotes.dto';
import { assertMontant } from '../common/limits';

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  draft: ['sent'],
  sent: ['accepted', 'rejected'],
  accepted: ['rejected'],
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
export class QuotesService {
  private readonly logger = new Logger(QuotesService.name);

  constructor(
    @InjectRepository(Quote) private readonly quoteRepo: Repository<Quote>,
    @InjectRepository(QuoteItem) private readonly itemRepo: Repository<QuoteItem>,
    private readonly dataSource: DataSource,
  ) {}

  // ─── Calculs financiers (R008) ────────────────────────────────────────────

  private computeItem(dto: CreateQuoteItemDto): ComputedItem {
    // Borner chaque champ à sa colonne ne suffit pas : deux valeurs valides
    // peuvent produire un produit qui déborde numeric(12,2) (R021).
    const lineHT = assertMontant(dto.quantity * dto.unitPrice, 'unitPrice');
    const taxAmount1 = dto.taxRate1 != null
      ? Math.round(lineHT * (dto.taxRate1 / 100) * 100) / 100
      : 0;
    const taxAmount2 = dto.taxRate2 != null
      ? Math.round(lineHT * (dto.taxRate2 / 100) * 100) / 100
      : 0;
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
    const subtotal = Math.round(
      items.reduce((s, i) => s + i.quantity * i.unitPrice, 0) * 100,
    ) / 100;
    const taxAmount = Math.round(
      items.reduce((s, i) => s + i.lineTaxTotal, 0) * 100,
    ) / 100;
    const totalAmount = assertMontant(
      Math.round((subtotal + taxAmount) * 100) / 100,
      'totalAmount',
    );
    return { subtotal, taxAmount, totalAmount };
  }

  // ─── Auto-numérotation DEV-YY-### (R013) ─────────────────────────────────

  async generateQuoteNumber(queryRunner: QueryRunner, tenantId: string): Promise<string> {
    await queryRunner.query(
      `SELECT pg_advisory_xact_lock(hashtext('quote_number_' || $1))`,
      [tenantId],
    );
    const year = new Date().getFullYear();
    const yy = String(year).slice(-2);
    // withDeleted : un numéro émis est consommé définitivement (voir R013).
    const last = await queryRunner.manager
      .createQueryBuilder(Quote, 'q')
      .withDeleted()
      .where('q.tenantId = :tenantId', { tenantId })
      .andWhere('EXTRACT(YEAR FROM q."createdAt") = :year', { year })
      .orderBy('q.quoteNumber', 'DESC')
      .limit(1)
      .getOne();
    const lastSeq = last ? parseInt(last.quoteNumber.split('-')[2], 10) : 0;
    return `DEV-${yy}-${String(lastSeq + 1).padStart(3, '0')}`;
  }

  // ─── CRUD ─────────────────────────────────────────────────────────────────

  async create(dto: CreateQuoteDto, tenantId: string, userId: string) {
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const quoteNumber = await this.generateQuoteNumber(qr, tenantId);
      const computed = dto.items.map((i) => this.computeItem(i));
      const totals = this.computeTotals(computed);

      const quote = qr.manager.create(Quote, {
        tenantId,
        quoteNumber,
        customerId: dto.customerId,
        quoteDate: dto.quoteDate as unknown as Date,
        expiryDate: dto.expiryDate ? (dto.expiryDate as unknown as Date) : null,
        notes: dto.notes ?? null,
        ...totals,
        status: 'draft',
        createdBy: userId,
        updatedBy: userId,
      });
      await qr.manager.save(Quote, quote);

      const items = computed.map((c) =>
        qr.manager.create(QuoteItem, { ...c, tenantId, quoteId: quote.id }),
      );
      await qr.manager.save(QuoteItem, items);

      await qr.commitTransaction();
      return this.findOne(quote.id, tenantId);
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  async findAll(dto: ListQuotesDto, tenantId: string) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;

    const qb = this.quoteRepo
      .createQueryBuilder('q')
      .leftJoinAndSelect('q.customer', 'customer')
      .where('q.tenantId = :tenantId', { tenantId })
      .andWhere('q.deletedAt IS NULL');

    if (dto.status) qb.andWhere('q.status = :status', { status: dto.status });
    if (dto.customerId) qb.andWhere('q.customerId = :customerId', { customerId: dto.customerId });
    if (dto.dateFrom) qb.andWhere('q.quoteDate >= :dateFrom', { dateFrom: dto.dateFrom });
    if (dto.dateTo) qb.andWhere('q.quoteDate <= :dateTo', { dateTo: dto.dateTo });

    const [data, total] = await qb
      .orderBy('q.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, pagination: { total, page, limit } };
  }

  async findOne(id: string, tenantId: string) {
    const quote = await this.quoteRepo.findOne({
      where: { id, tenantId, deletedAt: IsNull() },
      relations: ['items'],
    });
    if (!quote) throw new NotFoundException('quote_not_found');
    return { data: quote };
  }

  async update(id: string, dto: UpdateQuoteDto, tenantId: string, userId: string) {
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      // Do NOT load 'items' relation — cascade save would try to orphan them
      const quote = await qr.manager.findOne(Quote, {
        where: { id, tenantId, deletedAt: IsNull() },
      });
      if (!quote) throw new NotFoundException('quote_not_found');
      if (!['draft', 'sent'].includes(quote.status)) {
        throw new UnprocessableEntityException('quote_not_editable');
      }

      if (dto.customerId) quote.customerId = dto.customerId;
      if (dto.quoteDate) quote.quoteDate = dto.quoteDate as unknown as Date;
      if (dto.expiryDate !== undefined) quote.expiryDate = dto.expiryDate ? dto.expiryDate as unknown as Date : null;
      if (dto.notes !== undefined) quote.notes = dto.notes ?? null;
      // Editing a sent quote resets it to draft (needs to be re-sent)
      if (quote.status === 'sent') quote.status = 'draft';
      quote.updatedBy = userId;

      if (dto.items) {
        const computed = dto.items.map((i) => this.computeItem(i));
        const totals = this.computeTotals(computed);
        Object.assign(quote, totals);
        // Save quote first, then replace items to avoid cascade conflict
        await qr.manager.save(Quote, quote);
        await qr.manager.delete(QuoteItem, { quoteId: id });
        const items = computed.map((c) =>
          qr.manager.create(QuoteItem, { ...c, tenantId, quoteId: id }),
        );
        await qr.manager.save(QuoteItem, items);
      } else {
        await qr.manager.save(Quote, quote);
      }

      await qr.commitTransaction();
      return this.findOne(id, tenantId);
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  async updateStatus(id: string, dto: UpdateQuoteStatusDto, tenantId: string, userId: string) {
    const quote = await this.quoteRepo.findOne({
      where: { id, tenantId, deletedAt: IsNull() },
    });
    if (!quote) throw new NotFoundException('quote_not_found');

    const allowed = ALLOWED_TRANSITIONS[quote.status] ?? [];
    if (!allowed.includes(dto.status)) {
      throw new UnprocessableEntityException('invalid_status_transition');
    }

    quote.status = dto.status;
    quote.updatedBy = userId;
    await this.quoteRepo.save(quote);
    return { data: quote };
  }

  async convertToInvoice(id: string, tenantId: string, userId: string) {
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const quote = await qr.manager.findOne(Quote, {
        where: { id, tenantId, deletedAt: IsNull() },
        relations: ['items'],
      });
      if (!quote) throw new NotFoundException('quote_not_found');
      if (quote.status !== 'accepted') {
        throw new UnprocessableEntityException('quote_not_accepted');
      }

      // Generate invoice number with advisory lock (R013)
      await qr.query(
        `SELECT pg_advisory_xact_lock(hashtext('invoice_number_' || $1))`,
        [tenantId],
      );
      const year = new Date().getFullYear();
      const yy = String(year).slice(-2);
      const lastInv = await qr.manager.query(
        // Pas de filtre sur deletedAt : un numéro émis est consommé (R013).
        `SELECT "invoiceNumber" FROM sales_invoices
         WHERE "tenantId" = $1
           AND EXTRACT(YEAR FROM "createdAt") = $2
         ORDER BY "invoiceNumber" DESC
         LIMIT 1`,
        [tenantId, year],
      );
      const lastSeq = lastInv.length > 0
        ? parseInt(lastInv[0].invoiceNumber.split('-')[2], 10)
        : 0;
      const invoiceNumber = `FAC-${yy}-${String(lastSeq + 1).padStart(3, '0')}`;

      // Create stub sales_invoice row (full module comes later)
      const [invoice] = await qr.query(
        `INSERT INTO sales_invoices
           ("tenantId", "invoiceNumber", "customerId", "invoiceDate",
            "subtotal", "taxAmount", "totalAmount",
            "amountPaid", "amountDue", "status", "quoteId", "createdBy", "updatedBy")
         VALUES ($1,$2,$3,NOW(),$4,$5,$6,0,$7,'draft',$8,$9,$9)
         RETURNING *`,
        [
          tenantId, invoiceNumber, quote.customerId,
          quote.subtotal, quote.taxAmount, quote.totalAmount,
          quote.totalAmount, quote.id, userId,
        ],
      );

      // Copy quote items to sales_invoice_items
      for (const item of quote.items) {
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

      quote.status = 'converted';
      quote.convertedToInvoiceId = invoice.id;
      quote.updatedBy = userId;
      await qr.manager.save(Quote, quote);

      await qr.commitTransaction();
      return {
        data: {
          quoteConverted: {
            id: quote.id,
            quoteNumber: quote.quoteNumber,
            status: quote.status,
            convertedToInvoiceId: invoice.id,
          },
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
    const quote = await this.quoteRepo.findOne({
      where: { id, tenantId, deletedAt: IsNull() },
    });
    if (!quote) throw new NotFoundException('quote_not_found');
    if (!['draft', 'rejected'].includes(quote.status)) {
      throw new UnprocessableEntityException('quote_cannot_delete');
    }
    quote.updatedBy = userId;
    await this.quoteRepo.save(quote);
    await this.quoteRepo.softDelete(id);
    return { data: { deleted: true } };
  }

  // ─── Cron : expiration horaire ────────────────────────────────────────────

  @Cron('0 * * * *')
  async markExpiredQuotes(): Promise<void> {
    try {
      const result = await this.dataSource
        .createQueryBuilder()
        .update(Quote)
        .set({ status: 'expired' })
        .where('status IN (:...statuses)', { statuses: ['sent', 'accepted'] })
        .andWhere('expiryDate IS NOT NULL')
        .andWhere('expiryDate < :today', { today: new Date() })
        .andWhere('deletedAt IS NULL')
        .execute();
      if (result.affected && result.affected > 0) {
        this.logger.log(`Marked ${result.affected} quote(s) as expired`);
      }
    } catch (error) {
      this.logger.error('Cron markExpiredQuotes failed', (error as Error).stack);
    }
  }
}
