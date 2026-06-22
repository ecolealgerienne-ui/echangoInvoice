import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Subscription } from '../../tenants/entities/subscription.entity';
import { Plan } from '../entities/plan.entity';
import { AdminAuditService } from '../audit/admin-audit.service';
import { PatchSubscriptionDto } from '../dto/patch-subscription.dto';

@Injectable()
export class AdminSubscriptionsService {
  private readonly logger = new Logger(AdminSubscriptionsService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly auditService: AdminAuditService,
  ) {}

  async patch(id: string, dto: PatchSubscriptionDto, adminId: string, adminEmail: string, ipAddress: string | null) {
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const sub = await qr.manager.findOne(Subscription, { where: { id } });
      if (!sub) throw new NotFoundException(`Subscription ${id} not found`);

      const before = { ...sub };

      if (dto.planSlug) {
        const plan = await qr.manager.findOne(Plan, { where: { slug: dto.planSlug } });
        if (!plan) throw new NotFoundException(`Plan ${dto.planSlug} not found`);
        (sub as any).planId = plan.id;
        sub.plan = dto.planSlug as any;
      }
      if (dto.customPricePerMonth !== undefined) (sub as any).customPricePerMonth = dto.customPricePerMonth;
      if (dto.invoiceLimit !== undefined) sub.invoiceLimit = dto.invoiceLimit ?? undefined;
      if (dto.usersLimit !== undefined) sub.usersLimit = dto.usersLimit ?? undefined;
      if (dto.currentPeriodEnd !== undefined) (sub as any).currentPeriodEnd = new Date(dto.currentPeriodEnd);

      await qr.manager.save(Subscription, sub);
      await this.auditService.logAction(qr, adminId, adminEmail, 'subscription.plan_changed', 'subscription', id, { before, after: dto }, ipAddress);
      await qr.commitTransaction();
      return { data: sub };
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }
}
