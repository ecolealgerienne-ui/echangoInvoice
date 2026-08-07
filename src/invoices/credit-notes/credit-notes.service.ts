import { Injectable, Logger, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { CreditNote } from '../entities/credit-note.entity';
import { CreditNoteItem } from '../entities/credit-note-item.entity';
import { SalesInvoice } from '../entities/sales-invoice.entity';
import { CreateCreditNoteDto, CreateCreditNoteItemDto } from './dto/create-credit-note.dto';
import { assertMontant } from '../../common/limits';

@Injectable()
export class CreditNotesService {
  private readonly logger = new Logger(CreditNotesService.name);

  constructor(
    @InjectRepository(CreditNote) private readonly cnRepo: Repository<CreditNote>,
    @InjectRepository(CreditNoteItem) private readonly itemRepo: Repository<CreditNoteItem>,
    private readonly dataSource: DataSource,
  ) {}

  private computeItem(dto: CreateCreditNoteItemDto) {
    // Borner chaque champ à sa colonne ne suffit pas : deux valeurs valides
    // peuvent produire un produit qui déborde numeric(12,2) (R021).
    const lineHT = assertMontant(dto.quantity * dto.unitPrice, 'unitPrice');
    const taxAmount1 = dto.taxRate1 != null ? Math.round(lineHT * (dto.taxRate1 / 100) * 100) / 100 : 0;
    return {
      description: dto.description,
      quantity: dto.quantity,
      unit: dto.unit ?? null,
      unitPrice: dto.unitPrice,
      taxName1: dto.taxName1 ?? null,
      taxRate1: dto.taxRate1 ?? null,
      taxAmount1,
      lineTaxTotal: taxAmount1,
      lineTotal: Math.round((lineHT + taxAmount1) * 100) / 100,
    };
  }

  private computeTotals(items: ReturnType<CreditNotesService['computeItem']>[]) {
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

  private async generateNumber(tenantId: string): Promise<string> {
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      await qr.query(`SELECT pg_advisory_xact_lock(hashtext('credit_note_number_' || $1))`, [tenantId]);
      const year = new Date().getFullYear();
      const yy = String(year).slice(-2);
      // withDeleted : un numéro émis est consommé définitivement (voir R013).
      const last = await qr.manager
        .createQueryBuilder(CreditNote, 'cn')
        .withDeleted()
        .where('cn.tenantId = :tenantId', { tenantId })
        .andWhere('EXTRACT(YEAR FROM cn."createdAt") = :year', { year })
        .orderBy('cn.creditNoteNumber', 'DESC')
        .limit(1)
        .getOne();
      const lastSeq = last ? parseInt(last.creditNoteNumber.split('-')[2], 10) : 0;
      const num = `AV-${yy}-${String(lastSeq + 1).padStart(3, '0')}`;
      await qr.commitTransaction();
      return num;
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  async create(dto: CreateCreditNoteDto, tenantId: string, userId: string) {
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const creditNoteNumber = await this.generateNumber(tenantId);
      const computed = dto.items.map(i => this.computeItem(i));
      const totals = this.computeTotals(computed);

      const cn = qr.manager.create(CreditNote, {
        tenantId,
        creditNoteNumber,
        customerId: dto.customerId,
        salesInvoiceId: dto.salesInvoiceId ?? null,
        creditNoteDate: dto.creditNoteDate as unknown as Date,
        reason: dto.reason ?? null,
        notes: dto.notes ?? null,
        ...totals,
        status: 'draft',
        createdBy: userId,
        updatedBy: userId,
      });
      await qr.manager.save(CreditNote, cn);

      const items = computed.map(c =>
        qr.manager.create(CreditNoteItem, { ...c, tenantId, creditNoteId: cn.id }),
      );
      await qr.manager.save(CreditNoteItem, items);

      await qr.commitTransaction();
      return this.findOne(cn.id, tenantId);
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  async findAll(tenantId: string, page = 1, limit = 20) {
    const [data, total] = await this.cnRepo
      .createQueryBuilder('cn')
      .where('cn.tenantId = :tenantId', { tenantId })
      .andWhere('cn.deletedAt IS NULL')
      .orderBy('cn.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();
    return { data, pagination: { total, page, limit } };
  }

  async findOne(id: string, tenantId: string) {
    const cn = await this.cnRepo.findOne({
      where: { id, tenantId, deletedAt: IsNull() },
      relations: ['items'],
    });
    if (!cn) throw new NotFoundException('credit_note_not_found');
    return { data: cn };
  }

  /**
   * Émet l'avoir et lui donne son effet comptable.
   *
   * Rattaché à une facture, il en éteint une part : `creditedAmount` augmente,
   * `amountDue` diminue d'autant, et l'avoir passe à `applied`. Sans facture
   * rattachée, il n'y a rien à imputer — l'avoir reste `issued`, c'est un
   * crédit ouvert au client.
   *
   * Avant cette correction, `issue` ne faisait que changer le statut : le solde
   * de la facture ne bougeait pas et `applied` n'était atteint par aucun chemin.
   */
  async issue(id: string, tenantId: string, userId: string) {
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const cn = await qr.manager.findOne(CreditNote, {
        where: { id, tenantId, deletedAt: IsNull() },
      });
      if (!cn) throw new NotFoundException('credit_note_not_found');
      if (cn.status !== 'draft') throw new UnprocessableEntityException('credit_note_already_issued');

      if (!cn.salesInvoiceId) {
        cn.status = 'issued';
        cn.updatedBy = userId;
        await qr.manager.save(CreditNote, cn);
        await qr.commitTransaction();
        return { data: cn };
      }

      // Verrou : deux avoirs émis en parallèle sur la même facture pourraient
      // sinon dépasser ensemble le solde restant.
      const invoice = await qr.manager.findOne(SalesInvoice, {
        where: { id: cn.salesInvoiceId, tenantId, deletedAt: IsNull() },
        lock: { mode: 'pessimistic_write' },
      });
      if (!invoice) throw new NotFoundException('invoice_not_found');
      if (invoice.status === 'cancelled') {
        throw new UnprocessableEntityException('invoice_cancelled');
      }
      // Une facture non émise ne doit rien à personne : il n'y a rien à
      // créditer, et la modifier recalculerait ses totaux par-dessus l'avoir.
      if (invoice.status === 'draft') {
        throw new UnprocessableEntityException('invoice_not_issued');
      }

      const montant = Number(cn.totalAmount);
      const soldeDu = Number(invoice.amountDue);
      // Un avoir n'ouvre pas de créance négative : on ne peut pas créditer plus
      // qu'il ne reste dû. Au-delà, c'est un remboursement, pas un avoir.
      if (montant > soldeDu + 0.01) {
        throw new UnprocessableEntityException('credit_note_exceeds_amount_due');
      }

      const credite = Math.round((Number(invoice.creditedAmount) + montant) * 100) / 100;
      const du = Math.round(
        Math.max(Number(invoice.totalAmount) - Number(invoice.amountPaid) - credite, 0) * 100,
      ) / 100;

      await qr.manager.update(SalesInvoice, invoice.id, {
        creditedAmount: credite,
        amountDue: du,
        status: this.statutFacture(du, Number(invoice.amountPaid), credite),
        updatedBy: userId,
      });

      cn.status = 'applied';
      cn.updatedBy = userId;
      await qr.manager.save(CreditNote, cn);

      await qr.commitTransaction();
      this.logger.log(`Avoir ${cn.creditNoteNumber} imputé sur ${invoice.invoiceNumber} : ${montant}`);
      return { data: cn };
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  /**
   * Annule l'avoir et défait son imputation.
   *
   * L'ancienne version refusait d'annuler un avoir `applied`. Ce statut étant
   * désormais atteignable, ce refus enfermerait toute erreur de saisie sans
   * issue — le même cul-de-sac qu'un BL signé sans action possible.
   */
  async cancel(id: string, tenantId: string, userId: string) {
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const cn = await qr.manager.findOne(CreditNote, {
        where: { id, tenantId, deletedAt: IsNull() },
      });
      if (!cn) throw new NotFoundException('credit_note_not_found');
      if (cn.status === 'cancelled') {
        throw new UnprocessableEntityException('credit_note_already_cancelled');
      }

      if (cn.status === 'applied' && cn.salesInvoiceId) {
        const invoice = await qr.manager.findOne(SalesInvoice, {
          where: { id: cn.salesInvoiceId, tenantId, deletedAt: IsNull() },
          lock: { mode: 'pessimistic_write' },
        });
        if (!invoice) throw new NotFoundException('invoice_not_found');

        const credite = Math.round(
          Math.max(Number(invoice.creditedAmount) - Number(cn.totalAmount), 0) * 100,
        ) / 100;
        const du = Math.round(
          Math.max(Number(invoice.totalAmount) - Number(invoice.amountPaid) - credite, 0) * 100,
        ) / 100;

        await qr.manager.update(SalesInvoice, invoice.id, {
          creditedAmount: credite,
          amountDue: du,
          status: this.statutFacture(du, Number(invoice.amountPaid), credite),
          updatedBy: userId,
        });
      }

      cn.status = 'cancelled';
      cn.updatedBy = userId;
      await qr.manager.save(CreditNote, cn);

      await qr.commitTransaction();
      return { data: cn };
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  /**
   * Statut d'une facture après mouvement de solde. Règle unique pour les
   * règlements comme pour les avoirs : soldée, entamée, ou intacte.
   */
  private statutFacture(du: number, paye: number, credite: number): string {
    if (du <= 0) return 'paid';
    return paye > 0 || credite > 0 ? 'partial' : 'sent';
  }

  async remove(id: string, tenantId: string, userId: string) {
    const cn = await this.cnRepo.findOne({ where: { id, tenantId, deletedAt: IsNull() } });
    if (!cn) throw new NotFoundException('credit_note_not_found');
    if (cn.status !== 'draft') throw new UnprocessableEntityException('credit_note_cannot_delete');
    cn.updatedBy = userId;
    await this.cnRepo.save(cn);
    await this.cnRepo.softDelete(id);
    return { data: { deleted: true } };
  }
}
