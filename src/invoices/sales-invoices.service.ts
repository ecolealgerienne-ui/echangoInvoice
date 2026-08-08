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
import { calculerDroitDeTimbre, calculerNetAPayer, estSoumisAuTimbre } from '../common/droit-de-timbre';
import { assertMontant } from '../common/limits';
import { ajouterArticles } from '../common/document-lines';
import { NumberingService } from '../common/numbering/numbering.service';

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  draft: ['sent', 'cancelled'],
  sent: ['cancelled'],
  partial: ['cancelled'],
  overdue: ['cancelled'],
  cancelled: ['draft'],
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
    private readonly numbering: NumberingService,
  ) {}

  // ─── Calculs financiers (R008) ────────────────────────────────────────────

  private computeItem(dto: CreateSalesInvoiceItemDto): ComputedItem {
    // Borner chaque champ à sa colonne ne suffit pas : deux valeurs valides
    // peuvent produire un produit qui déborde numeric(12,2) (R021).
    const lineHT = assertMontant(dto.quantity * dto.unitPrice, 'unitPrice');
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
    const subtotal = assertMontant(
      Math.round(items.reduce((s, i) => s + i.quantity * i.unitPrice, 0) * 100) / 100,
      'subtotal',
    );
    const taxAmount = Math.round(items.reduce((s, i) => s + i.lineTaxTotal, 0) * 100) / 100;
    const totalAmount = assertMontant(
      Math.round((subtotal + taxAmount) * 100) / 100,
      'totalAmount',
    );
    return { subtotal, taxAmount, totalAmount };
  }

  /**
   * Droit de timbre dû sur cette facture (R008 : jamais calculé côté client).
   * Zéro si la société ne l'a pas activé, ou si le règlement n'est pas en espèces.
   */
  private async computeStampDuty(
    qr: QueryRunner, tenantId: string, paymentMode: string, totalTTC: number,
  ): Promise<number> {
    if (!estSoumisAuTimbre(paymentMode)) return 0;
    const [reglages] = await qr.query(
      `SELECT "stampDutyEnabled" FROM settings WHERE "tenantId" = $1`, [tenantId],
    );
    if (!reglages?.stampDutyEnabled) return 0;
    return calculerDroitDeTimbre(totalTTC);
  }

  // ─── Auto-numérotation (R013) ────────────────────────────────────────────
  //
  // Le format vient des Paramètres ; la séquence vient d'un compteur dédié.
  // La version précédente relisait le plus grand numéro existant et découpait
  // la chaîne sur les tirets — ce qui n'a de sens que si le format ne change
  // jamais. Un numéro émis reste consommé même si le document est supprimé :
  // le compteur n'est jamais décrémenté, et une numérotation fiscale ne se
  // réattribue pas.

  async generateInvoiceNumber(qr: QueryRunner, tenantId: string): Promise<string> {
    return this.numbering.prochain(qr, tenantId, 'invoice');
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
        `SELECT id FROM sales_invoices WHERE "deliveryNoteId" = $1 AND "tenantId" = $2 AND "deletedAt" IS NULL`,
        [dto.deliveryNoteId, tenantId],
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
      const paymentMode = dto.paymentMode ?? 'other';
      const stampDuty = await this.computeStampDuty(qr, tenantId, paymentMode, totals.totalAmount);

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
        paymentMode,
        stampDuty,
        amountPaid: 0,
        amountDue: calculerNetAPayer(totals.totalAmount, stampDuty),
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

    // La recherche porte aussi sur le nom du client : au téléphone on a le
    // nom, rarement le numéro de facture. Le champ existait à l'écran depuis
    // toujours, mais le DTO ne l'acceptait pas — avec forbidNonWhitelisted,
    // toute saisie renvoyait un 400 et vidait la liste.
    if (dto.search) {
      qb.andWhere('(inv.invoiceNumber ILIKE :recherche OR customer.name ILIKE :recherche)', {
        recherche: `%${dto.search}%`,
      });
    }
    if (dto.status) qb.andWhere('inv.status = :status', { status: dto.status });
    if (dto.customerId) qb.andWhere('inv.customerId = :customerId', { customerId: dto.customerId });
    if (dto.dateFrom) qb.andWhere('inv.invoiceDate >= :dateFrom', { dateFrom: dto.dateFrom });
    if (dto.dateTo) qb.andWhere('inv.invoiceDate <= :dateTo', { dateTo: dto.dateTo });

    const [rows, total] = await qb
      .orderBy('inv.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    // Enrich with blNumber and quoteNumber
    const blIds = rows.map(r => r.deliveryNoteId).filter(Boolean);
    const qIds = rows.map(r => r.quoteId).filter(Boolean);
    let blMap: Record<string, string> = {};
    let quoteMap: Record<string, string> = {};
    if (blIds.length) {
      const bls = await this.dataSource.query(
        `SELECT id, "blNumber" FROM delivery_notes WHERE id = ANY($1) AND "tenantId" = $2`,
        [blIds, tenantId],
      );
      blMap = Object.fromEntries(bls.map((b: any) => [b.id, b.blNumber]));
    }
    if (qIds.length) {
      const quotes = await this.dataSource.query(
        `SELECT id, "quoteNumber" FROM quotes WHERE id = ANY($1) AND "tenantId" = $2`,
        [qIds, tenantId],
      );
      quoteMap = Object.fromEntries(quotes.map((q: any) => [q.id, q.quoteNumber]));
    }
    const data = rows.map(r => ({
      ...r,
      blNumber: r.deliveryNoteId ? blMap[r.deliveryNoteId] ?? null : null,
      quoteNumber: r.quoteId ? quoteMap[r.quoteId] ?? null : null,
    }));

    return { data, pagination: { total, page, limit } };
  }

  /**
   * Vue complète d'une facture, pensée pour la page détail : elle doit tenir
   * en UN appel. La découper obligerait l'écran à orchestrer cinq requêtes et
   * à afficher un document par morceaux, ce qui est pire que pas de page du
   * tout pour un document comptable qu'on consulte pour le vérifier.
   */
  async findOne(id: string, tenantId: string) {
    const invoice = await this.invoiceRepo.findOne({
      where: { id, tenantId, deletedAt: IsNull() },
      relations: ['items', 'payments', 'customer'],
    });
    if (!invoice) throw new NotFoundException('invoice_not_found');

    const items = await ajouterArticles(this.dataSource, invoice.items ?? [], tenantId);

    // Les documents d'origine et les avoirs imputés expliquent deux chiffres
    // que rien d'autre ne justifie à l'écran : d'où vient la facture, et
    // pourquoi le solde a baissé sans encaissement.
    const [origine] = await this.dataSource.query(
      `SELECT bl."blNumber" AS "blNumber", dv."quoteNumber" AS "quoteNumber"
       FROM sales_invoices f
       LEFT JOIN delivery_notes bl ON bl.id = f."deliveryNoteId"
       LEFT JOIN quotes dv ON dv.id = f."quoteId"
       WHERE f.id = $1 AND f."tenantId" = $2`,
      [id, tenantId],
    );

    const creditNotes = await this.dataSource.query(
      `SELECT id, "creditNoteNumber", "creditNoteDate", "totalAmount", status, reason
       FROM credit_notes
       WHERE "salesInvoiceId" = $1 AND "tenantId" = $2 AND "deletedAt" IS NULL
       ORDER BY "creditNoteDate"`,
      [id, tenantId],
    );

    return {
      data: {
        ...invoice,
        items,
        blNumber: origine?.blNumber ?? null,
        quoteNumber: origine?.quoteNumber ?? null,
        creditNotes,
      },
    };
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
      invoice.paymentMode = dto.paymentMode ?? invoice.paymentMode;
      invoice.stampDuty = await this.computeStampDuty(qr, tenantId, invoice.paymentMode, totals.totalAmount);
      // Retrancher aussi la part créditée. Un brouillon ne peut pas porter
      // d'avoir (issue le refuse), mais la formule doit rester juste : c'est ce
      // genre de recalcul partiel qui avait fait ressusciter du stock livré.
      invoice.amountDue = Math.round(
        Math.max(
          calculerNetAPayer(totals.totalAmount, invoice.stampDuty)
            - Number(invoice.amountPaid) - Number(invoice.creditedAmount),
          0,
        ) * 100,
      ) / 100;
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
