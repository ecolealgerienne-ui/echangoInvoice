import {
  BadRequestException, Injectable, Logger,
  NotFoundException, UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { Payment } from './entities/payment.entity';
import { SalesInvoice } from './entities/sales-invoice.entity';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { ListPaymentsDto } from './dto/list-payments.dto';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @InjectRepository(Payment) private readonly paymentRepo: Repository<Payment>,
    @InjectRepository(SalesInvoice) private readonly invoiceRepo: Repository<SalesInvoice>,
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreatePaymentDto, tenantId: string, userId: string) {
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const invoice = await qr.manager.findOne(SalesInvoice, {
        where: { id: dto.salesInvoiceId, tenantId, deletedAt: IsNull() },
        lock: { mode: 'pessimistic_write' },
      });
      if (!invoice) throw new NotFoundException('invoice_not_found');
      if (invoice.status === 'cancelled') throw new BadRequestException('invoice_cancelled');
      if (invoice.status === 'paid') throw new BadRequestException('invoice_already_paid');

      const amountDue = Number(invoice.amountDue);
      if (dto.amount > amountDue + 0.01) {
        throw new UnprocessableEntityException(
          `Montant (${dto.amount}) supérieur au solde dû (${amountDue})`,
        );
      }

      const payment = qr.manager.create(Payment, {
        tenantId,
        salesInvoiceId: dto.salesInvoiceId,
        amount: dto.amount,
        paymentDate: dto.paymentDate as unknown as Date,
        paymentMethod: dto.paymentMethod,
        reference: dto.reference ?? null,
        notes: dto.notes ?? null,
        createdBy: userId,
        updatedBy: userId,
      });
      await qr.manager.save(Payment, payment);

      const newAmountPaid = Math.round((Number(invoice.amountPaid) + dto.amount) * 100) / 100;
      const newAmountDue = Math.round(Math.max(Number(invoice.totalAmount) - newAmountPaid, 0) * 100) / 100;
      const newStatus = newAmountDue <= 0 ? 'paid' : 'partial';

      await qr.manager.update(SalesInvoice, invoice.id, {
        amountPaid: newAmountPaid,
        amountDue: newAmountDue,
        status: newStatus,
        updatedBy: userId,
      });

      await qr.commitTransaction();

      const updatedInvoice = await this.invoiceRepo.findOne({ where: { id: invoice.id, tenantId, deletedAt: IsNull() } });
      return { data: { ...payment, invoice: updatedInvoice } };
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  async findAll(dto: ListPaymentsDto, tenantId: string) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;

    const qb = this.paymentRepo
      .createQueryBuilder('p')
      .where('p.tenantId = :tenantId', { tenantId })
      .andWhere('p.deletedAt IS NULL');

    if (dto.salesInvoiceId) qb.andWhere('p.salesInvoiceId = :salesInvoiceId', { salesInvoiceId: dto.salesInvoiceId });
    if (dto.dateFrom) qb.andWhere('p.paymentDate >= :dateFrom', { dateFrom: dto.dateFrom });
    if (dto.dateTo) qb.andWhere('p.paymentDate <= :dateTo', { dateTo: dto.dateTo });

    const [data, total] = await qb
      .orderBy('p.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, pagination: { total, page, limit } };
  }

  async findOne(id: string, tenantId: string) {
    const payment = await this.paymentRepo.findOne({
      where: { id, tenantId, deletedAt: IsNull() },
      relations: ['salesInvoice'],
    });
    if (!payment) throw new NotFoundException('payment_not_found');
    return { data: payment };
  }

  async cancel(id: string, tenantId: string, userId: string) {
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const payment = await qr.manager.findOne(Payment, {
        where: { id, tenantId, deletedAt: IsNull() },
      });
      if (!payment) throw new NotFoundException('payment_not_found');

      const invoice = await qr.manager.findOne(SalesInvoice, {
        where: { id: payment.salesInvoiceId, tenantId, deletedAt: IsNull() },
        lock: { mode: 'pessimistic_write' },
      });
      if (!invoice) throw new NotFoundException('invoice_not_found');

      await qr.manager.softDelete(Payment, id);

      const newAmountPaid = Math.round(Math.max(Number(invoice.amountPaid) - Number(payment.amount), 0) * 100) / 100;
      const newAmountDue = Math.round((Number(invoice.totalAmount) - newAmountPaid) * 100) / 100;

      const newStatus = newAmountPaid <= 0 ? 'sent' : 'partial';
      await qr.manager.update(SalesInvoice, invoice.id, {
        amountPaid: newAmountPaid,
        amountDue: newAmountDue,
        status: newStatus,
        updatedBy: userId,
      });

      await qr.commitTransaction();
      return { data: { cancelled: true } };
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }
}
