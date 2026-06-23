import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { SaasPayment } from '../entities/saas-payment.entity';
import { Tenant } from '../../tenants/entities/tenant.entity';
import { AdminAuditService } from '../audit/admin-audit.service';
import { CreateSaasPaymentDto } from '../dto/create-saas-payment.dto';
import { ListSaasPaymentsDto } from '../dto/list-saas-payments.dto';

@Injectable()
export class AdminSaasPaymentsService {
  private readonly logger = new Logger(AdminSaasPaymentsService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly auditService: AdminAuditService,
  ) {}

  async findAll(dto: ListSaasPaymentsDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const offset = (page - 1) * limit;

    let query = this.dataSource.getRepository(SaasPayment)
      .createQueryBuilder('sp')
      .orderBy('sp.paidAt', 'DESC');

    if (dto.tenantId) {
      query = query.where('sp.tenantId = :tenantId', { tenantId: dto.tenantId });
    }

    const [payments, total] = await query.skip(offset).take(limit).getManyAndCount();
    return { data: payments, pagination: { total, page, limit } };
  }

  async create(dto: CreateSaasPaymentDto, adminId: string, adminEmail: string, ipAddress: string | null) {
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const tenant = await qr.manager.findOne(Tenant, { where: { id: dto.tenantId } });
      if (!tenant) throw new NotFoundException(`Tenant ${dto.tenantId} not found`);

      const payment = qr.manager.create(SaasPayment, {
        tenantId: dto.tenantId,
        amount: dto.amount,
        method: dto.method,
        reference: dto.reference ?? null,
        paidAt: new Date(dto.paidAt),
        monthsCovered: dto.monthsCovered,
        notes: dto.notes ?? null,
        createdBy: adminId,
      });
      await qr.manager.save(SaasPayment, payment);

      // Update currentPeriodEnd
      const currentEnd = (tenant as any).currentPeriodEnd
        ? new Date((tenant as any).currentPeriodEnd)
        : new Date();
      if (currentEnd < new Date()) {
        currentEnd.setTime(new Date().getTime());
      }
      currentEnd.setMonth(currentEnd.getMonth() + dto.monthsCovered);

      await qr.query(
        `UPDATE subscriptions SET "currentPeriodEnd" = $1 WHERE "tenantId" = $2`,
        [currentEnd.toISOString(), dto.tenantId],
      );

      if (tenant.status === 'suspended') {
        tenant.status = 'active';
        await qr.manager.save(Tenant, tenant);
      }

      await this.auditService.logAction(
        qr,
        adminId,
        adminEmail,
        'saas_payment.created',
        'tenant',
        dto.tenantId,
        { amount: dto.amount, monthsCovered: dto.monthsCovered, method: dto.method },
        ipAddress,
      );

      await qr.commitTransaction();
      this.logger.log(`SaaS payment recorded for tenant ${dto.tenantId} by ${adminEmail}`);
      return { data: payment };
    } catch (e) {
      await qr.rollbackTransaction();
      throw e;
    } finally {
      await qr.release();
    }
  }

  async summary() {
    const now = new Date();
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const result = await this.dataSource.query(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM saas_payments WHERE "paidAt" >= $1`,
      [firstOfMonth.toISOString()],
    );
    return { data: { mrrActual: parseFloat(result[0]?.total ?? '0') } };
  }
}
