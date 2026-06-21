import {
  BadRequestException, ForbiddenException, Injectable,
  Logger, NotFoundException, UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, QueryRunner, Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { SalesInvoice } from './entities/sales-invoice.entity';
import { SalesInvoiceItem } from './entities/sales-invoice-item.entity';
import { Subscription } from '../tenants/entities/subscription.entity';
import { CreateSalesInvoiceDto, CreateSalesInvoiceItemDto } from './dto/create-sales-invoice.dto';
import { UpdateInvoiceStatusDto } from './dto/update-invoice-status.dto';
import { ListInvoicesDto } from './dto/list-invoices.dto';
import { EmailService } from '../common/email.service';

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  draft: ['sent', 'cancelled'],
  sent: ['cancelled'],
  partial: ['cancelled'],
  overdue: ['cancelled'],
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
export class SalesInvoicesService {
  private readonly logger = new Logger(SalesInvoicesService.name);

  constructor(
    @InjectRepository(SalesInvoice) private readonly invoiceRepo: Repository<SalesInvoice>,
    @InjectRepository(SalesInvoiceItem) private readonly itemRepo: Repository<SalesInvoiceItem>,
    @InjectRepository(Subscription) private readonly subRepo: Repository<Subscription>,
    private readonly dataSource: DataSource,
    private readonly emailService: EmailService,
  ) {}

  // ─── Calculs financiers (R008) ────────────────────────────────────────────

  private computeItem(dto: CreateSalesInvoiceItemDto): ComputedItem {
    const lineHT = dto.quantity * dto.unitPrice;
    const taxAmount1 = dto.taxRate1 != null ? Math.round(lineHT * (dto.taxRate1 / 100) * 100) / 100 : 0;
    const taxAmount2 = dto.taxRate2 != null ? Math.round(lineHT * (dto.taxRate2 / 100) * 100) / 100 : 0;
    const lineTaxTotal = Math.round((taxAmount1 + taxAmount2) * 100) / 100;
    return {
      finishedProductId: dto.finishedProductId,
      quantity: dto.quantity, unit: dto.unit, unitPrice: dto.unitPrice,
      taxName1: dto.taxName1 ?? null, taxRate1: dto.taxRate1 ?? null, taxAmount1,
      taxName2: dto.taxName2 ?? null, taxRate2: dto.taxRate2 ?? null, taxAmount2,
      lineTaxTotal, lineTotal: Math.round((lineHT + lineTaxTotal) * 100) / 100,
    };
  }

  private computeTotals(items: ComputedItem[]) {
    const subtotal = Math.round(items.reduce((s, i) => s + i.quantity * i.unitPrice, 0) * 100) / 100;
    const taxAmount = Math.round(items.reduce((s, i) => s + i.lineTaxTotal, 0) * 100) / 100;
    return { subtotal, taxAmount, totalAmount: Math.round((subtotal + taxAmount) * 100) / 100 };
  }

  // ─── Auto-numérotation FAC-YY-### (R013) ─────────────────────────────────

  async generateInvoiceNumber(qr: QueryRunner, tenantId: string): Promise<string> {
    await qr.query(
      `SELECT pg_advisory_xact_lock(hashtext('invoice_number_' || $1))`,
      [tenantId],
    );
    const year = new Date().getFullYear();
    const yy = String(year).slice(-2);
    const last = await qr.manager
      .createQueryBuilder(SalesInvoice, 'inv')
      .where('inv.tenantId = :tenantId', { tenantId })
      .andWhere('EXTRACT(YEAR FROM inv."createdAt") = :year', { year })
      .andWhere('inv.deletedAt IS NULL')
      .orderBy('inv.invoiceNumber', 'DESC')
      .limit(1)
      .getOne();
    const lastSeq = last ? parseInt(last.invoiceNumber.split('-')[2], 10) : 0;
    return `FAC-${yy}-${String(lastSeq + 1).padStart(3, '0')}`;
  }

  // ─── Freemium check ───────────────────────────────────────────────────────

  private async checkFreemiumQuota(tenantId: string, qr: QueryRunner): Promise<void> {
    const sub = await qr.manager.findOne(Subscription, {
      where: { tenantId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!sub) return;
    if (sub.invoiceLimit != null && sub.invoicesThisMonth >= sub.invoiceLimit) {
      throw new ForbiddenException('invoice_limit_reached');
    }
    await qr.manager.increment(Subscription, { tenantId }, 'invoicesThisMonth', 1);
  }

  // ─── Résolution des items (3 modes de création) ───────────────────────────

  private async resolveItems(
    dto: CreateSalesInvoiceDto,
    tenantId: string,
    qr: QueryRunner,
  ): Promise<{ items: ComputedItem[]; deliveryNoteId: string | null; quoteId: string | null }> {
    if (dto.deliveryNoteId) {
      const rows: any[] = await qr.query(
        `SELECT * FROM delivery_note_items WHERE "deliveryNoteId" = $1 AND "tenantId" = $2`,
        [dto.deliveryNoteId, tenantId],
      );
      if (!rows.length) throw new NotFoundException('delivery_note_not_found');
      const dn = await qr.query(
        `SELECT id, "customerId" FROM delivery_notes
         WHERE id = $1 AND "tenantId" = $2 AND "deletedAt" IS NULL`,
        [dto.deliveryNoteId, tenantId],
      );
      if (!dn.length) throw new NotFoundException('delivery_note_not_found');
      const existing = await qr.query(
        `SELECT id FROM sales_invoices WHERE "deliveryNoteId" = $1 AND "deletedAt" IS NULL`,
        [dto.deliveryNoteId],
      );
      if (existing.length) throw new BadRequestException('delivery_note_already_invoiced');
      const items = rows.map((r) => ({
        finishedProductId: r.finishedProductId,
        quantity: parseFloat(r.quantity), unit: r.unit, unitPrice: parseFloat(r.unitPrice),
        taxName1: r.taxName1 ?? null, taxRate1: r.taxRate1 ? parseFloat(r.taxRate1) : null,
        taxAmount1: parseFloat(r.taxAmount1 ?? 0),
        taxName2: r.taxName2 ?? null, taxRate2: r.taxRate2 ? parseFloat(r.taxRate2) : null,
        taxAmount2: parseFloat(r.taxAmount2 ?? 0),
        lineTaxTotal: parseFloat(r.lineTaxTotal ?? 0), lineTotal: parseFloat(r.lineTotal),
      }));
      return { items, deliveryNoteId: dto.deliveryNoteId, quoteId: null };
    }

    if (dto.quoteId) {
      const rows: any[] = await qr.query(
        `SELECT * FROM quote_items WHERE "quoteId" = $1 AND "tenantId" = $2`,
        [dto.quoteId, tenantId],
      );
      if (!rows.length) throw new NotFoundException('quote_not_found');
      const items = rows.map((r) => ({
        finishedProductId: r.finishedProductId,
        quantity: parseFloat(r.quantity), unit: r.unit, unitPrice: parseFloat(r.unitPrice),
        taxName1: r.taxName1 ?? null, taxRate1: r.taxRate1 ? parseFloat(r.taxRate1) : null,
        taxAmount1: parseFloat(r.taxAmount1 ?? 0),
        taxName2: r.taxName2 ?? null, taxRate2: r.taxRate2 ? parseFloat(r.taxRate2) : null,
        taxAmount2: parseFloat(r.taxAmount2 ?? 0),
        lineTaxTotal: parseFloat(r.lineTaxTotal ?? 0), lineTotal: parseFloat(r.lineTotal),
      }));
      return { items, deliveryNoteId: null, quoteId: dto.quoteId };
    }

    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('invoice_items_required');
    }
    return { items: dto.items.map((i) => this.computeItem(i)), deliveryNoteId: null, quoteId: null };
  }

  // ─── CRUD ─────────────────────────────────────────────────────────────────

  async create(dto: CreateSalesInvoiceDto, tenantId: string, userId: string) {
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      await this.checkFreemiumQuota(tenantId, qr);

      const invoiceNumber = await this.generateInvoiceNumber(qr, tenantId);
      const { items, deliveryNoteId, quoteId } = await this.resolveItems(dto, tenantId, qr);
      const totals = this.computeTotals(items);

      const invoice = qr.manager.create(SalesInvoice, {
        tenantId,
        invoiceNumber,
        customerId: dto.customerId,
        invoiceDate: dto.invoiceDate as unknown as Date,
        dueDate: dto.dueDate ? dto.dueDate as unknown as Date : null,
        notes: dto.notes ?? null,
        deliveryNoteId,
        quoteId,
        ...totals,
        amountPaid: 0,
        amountDue: totals.totalAmount,
        status: 'draft',
        createdBy: userId,
        updatedBy: userId,
      });
      await qr.manager.save(SalesInvoice, invoice);

      const savedItems = items.map((c) =>
        qr.manager.create(SalesInvoiceItem, { ...c, tenantId, salesInvoiceId: invoice.id }),
      );
      await qr.manager.save(SalesInvoiceItem, savedItems);

      await qr.commitTransaction();
      return this.findOne(invoice.id, tenantId);
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  async findAll(dto: ListInvoicesDto, tenantId: string) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;

    const qb = this.invoiceRepo
      .createQueryBuilder('inv')
      .leftJoinAndSelect('inv.customer', 'customer')
      .where('inv.tenantId = :tenantId', { tenantId })
      .andWhere('inv.deletedAt IS NULL');

    if (dto.status) qb.andWhere('inv.status = :status', { status: dto.status });
    if (dto.customerId) qb.andWhere('inv.customerId = :customerId', { customerId: dto.customerId });
    if (dto.dateFrom) qb.andWhere('inv.invoiceDate >= :dateFrom', { dateFrom: dto.dateFrom });
    if (dto.dateTo) qb.andWhere('inv.invoiceDate <= :dateTo', { dateTo: dto.dateTo });

    const [data, total] = await qb
      .orderBy('inv.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, pagination: { total, page, limit } };
  }

  async findOne(id: string, tenantId: string) {
    const invoice = await this.invoiceRepo.findOne({
      where: { id, tenantId, deletedAt: IsNull() },
      relations: ['items', 'payments'],
    });
    if (!invoice) throw new NotFoundException('invoice_not_found');
    return { data: invoice };
  }

  async update(id: string, dto: CreateSalesInvoiceDto, tenantId: string, userId: string) {
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const invoice = await qr.manager.findOne(SalesInvoice, {
        where: { id, tenantId, deletedAt: IsNull() },
      });
      if (!invoice) throw new NotFoundException('invoice_not_found');
      if (invoice.status !== 'draft') {
        throw new UnprocessableEntityException('invoice_cannot_update');
      }

      // Supprime les anciens items
      await qr.query(`DELETE FROM sales_invoice_items WHERE "salesInvoiceId" = $1`, [id]);

      const { items } = await this.resolveItems(dto, tenantId, qr);
      const totals = this.computeTotals(items);

      invoice.customerId = dto.customerId;
      invoice.invoiceDate = dto.invoiceDate as unknown as Date;
      invoice.dueDate = dto.dueDate ? dto.dueDate as unknown as Date : null;
      invoice.notes = dto.notes ?? null;
      invoice.subtotal = totals.subtotal;
      invoice.taxAmount = totals.taxAmount;
      invoice.totalAmount = totals.totalAmount;
      invoice.amountDue = totals.totalAmount - invoice.amountPaid;
      invoice.updatedBy = userId;
      await qr.manager.save(SalesInvoice, invoice);

      const savedItems = items.map((c) =>
        qr.manager.create(SalesInvoiceItem, { ...c, tenantId, salesInvoiceId: id }),
      );
      await qr.manager.save(SalesInvoiceItem, savedItems);

      await qr.commitTransaction();
      return this.findOne(id, tenantId);
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  async updateStatus(id: string, dto: UpdateInvoiceStatusDto, tenantId: string, userId: string) {
    const invoice = await this.invoiceRepo.findOne({ where: { id, tenantId, deletedAt: IsNull() } });
    if (!invoice) throw new NotFoundException('invoice_not_found');

    const allowed = ALLOWED_TRANSITIONS[invoice.status] ?? [];
    if (!allowed.includes(dto.status)) {
      throw new UnprocessableEntityException('invalid_status_transition');
    }
    invoice.status = dto.status;
    invoice.updatedBy = userId;
    await this.invoiceRepo.save(invoice);
    return { data: invoice };
  }

  async remove(id: string, tenantId: string, userId: string) {
    const invoice = await this.invoiceRepo.findOne({ where: { id, tenantId, deletedAt: IsNull() } });
    if (!invoice) throw new NotFoundException('invoice_not_found');
    if (invoice.status !== 'draft') throw new UnprocessableEntityException('invoice_cannot_delete');
    invoice.updatedBy = userId;
    await this.invoiceRepo.save(invoice);
    await this.invoiceRepo.softDelete(id);
    return { data: { deleted: true } };
  }

  // ─── Cron : marquer les factures échues (quotidien 00:01) ─────────────────

  @Cron('1 0 * * *')
  async markOverdueInvoices(): Promise<void> {
    try {
      const result = await this.dataSource
        .createQueryBuilder()
        .update(SalesInvoice)
        .set({ status: 'overdue' })
        .where('status IN (:...statuses)', { statuses: ['sent', 'partial'] })
        .andWhere('dueDate < :today', { today: new Date() })
        .andWhere('amountDue > 0')
        .andWhere('deletedAt IS NULL')
        .execute();
      if (result.affected && result.affected > 0) {
        this.logger.log(`Marked ${result.affected} invoice(s) as overdue`);
      }
    } catch (error) {
      this.logger.error('Cron markOverdueInvoices failed', (error as Error).stack);
    }
  }

  // ─── Cron : rappels email J+7 / J+14 / J+21 (quotidien 08:00) ─────────────

  @Cron('0 8 * * *')
  async sendOverdueReminders(): Promise<void> {
    if (!process.env.EMAIL_SMTP_HOST) {
      return; // email non configuré — skip silencieusement
    }
    try {
      const rows: Array<{
        id: string; invoiceNumber: string; amountDue: string; totalAmount: string;
        dueDate: string; customerName: string; customerEmail: string;
        companyName: string; daysOverdue: number;
      }> = await this.dataSource.query(`
        SELECT si.id, si."invoiceNumber", si."amountDue"::text, si."totalAmount"::text,
               si."dueDate"::text, c.name AS "customerName", c.email AS "customerEmail",
               COALESCE(s.name, 'Mon Entreprise') AS "companyName",
               (CURRENT_DATE - si."dueDate")::int AS "daysOverdue"
        FROM sales_invoices si
        JOIN partners c ON c.id = si."customerId"
        LEFT JOIN settings s ON s."tenantId" = si."tenantId"
        WHERE si.status IN ('sent', 'partial', 'overdue')
          AND si."amountDue" > 0
          AND si."deletedAt" IS NULL
          AND c.email IS NOT NULL
          AND (CURRENT_DATE - si."dueDate")::int IN (7, 14, 21)
      `);

      for (const inv of rows) {
        const fmt = (v: string) => new Intl.NumberFormat('fr-DZ', { minimumFractionDigits: 2 }).format(Number(v)) + ' DA';
        const fmtDate = (v: string) => new Intl.DateTimeFormat('fr-DZ', { timeZone: 'Africa/Algiers', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(v));
        try {
          await this.emailService.send({
            to: inv.customerEmail,
            subject: `Rappel — Facture ${inv.invoiceNumber} impayée (J+${inv.daysOverdue})`,
            html: this.emailService.buildReminderEmail({
              companyName: inv.companyName,
              invoiceNumber: inv.invoiceNumber,
              customerName: inv.customerName,
              totalAmount: fmt(inv.totalAmount),
              amountDue: fmt(inv.amountDue),
              dueDate: fmtDate(inv.dueDate),
              daysOverdue: inv.daysOverdue,
            }),
          });
          this.logger.log(`Rappel J+${inv.daysOverdue} envoyé — ${inv.invoiceNumber} → ${inv.customerEmail}`);
        } catch (emailErr) {
          this.logger.error(`Rappel échoué pour ${inv.invoiceNumber}`, (emailErr as Error).message);
        }
      }
    } catch (error) {
      this.logger.error('Cron sendOverdueReminders failed', (error as Error).stack);
    }
  }
}
