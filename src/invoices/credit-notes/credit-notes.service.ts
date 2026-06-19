import { Injectable, Logger, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { CreditNote } from '../entities/credit-note.entity';
import { CreditNoteItem } from '../entities/credit-note-item.entity';
import { CreateCreditNoteDto, CreateCreditNoteItemDto } from './dto/create-credit-note.dto';

@Injectable()
export class CreditNotesService {
  private readonly logger = new Logger(CreditNotesService.name);

  constructor(
    @InjectRepository(CreditNote) private readonly cnRepo: Repository<CreditNote>,
    @InjectRepository(CreditNoteItem) private readonly itemRepo: Repository<CreditNoteItem>,
    private readonly dataSource: DataSource,
  ) {}

  private computeItem(dto: CreateCreditNoteItemDto) {
    const lineHT = dto.quantity * dto.unitPrice;
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
    const subtotal = Math.round(items.reduce((s, i) => s + i.quantity * i.unitPrice, 0) * 100) / 100;
    const taxAmount = Math.round(items.reduce((s, i) => s + i.lineTaxTotal, 0) * 100) / 100;
    return { subtotal, taxAmount, totalAmount: Math.round((subtotal + taxAmount) * 100) / 100 };
  }

  private async generateNumber(tenantId: string): Promise<string> {
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      await qr.query(`SELECT pg_advisory_xact_lock(hashtext('credit_note_number_' || $1))`, [tenantId]);
      const year = new Date().getFullYear();
      const yy = String(year).slice(-2);
      const last = await qr.manager
        .createQueryBuilder(CreditNote, 'cn')
        .where('cn.tenantId = :tenantId', { tenantId })
        .andWhere('EXTRACT(YEAR FROM cn."createdAt") = :year', { year })
        .andWhere('cn.deletedAt IS NULL')
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

  async issue(id: string, tenantId: string, userId: string) {
    const cn = await this.cnRepo.findOne({ where: { id, tenantId, deletedAt: IsNull() } });
    if (!cn) throw new NotFoundException('credit_note_not_found');
    if (cn.status !== 'draft') throw new UnprocessableEntityException('credit_note_already_issued');
    cn.status = 'issued';
    cn.updatedBy = userId;
    await this.cnRepo.save(cn);
    return { data: cn };
  }

  async cancel(id: string, tenantId: string, userId: string) {
    const cn = await this.cnRepo.findOne({ where: { id, tenantId, deletedAt: IsNull() } });
    if (!cn) throw new NotFoundException('credit_note_not_found');
    if (cn.status === 'applied') throw new UnprocessableEntityException('credit_note_already_applied');
    cn.status = 'cancelled';
    cn.updatedBy = userId;
    await this.cnRepo.save(cn);
    return { data: cn };
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
