import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { Cron } from '@nestjs/schedule';
import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { Plan } from './entities/plan.entity';
import { SaasPayment } from './entities/saas-payment.entity';
import { AdminAuditLog } from './entities/admin-audit-log.entity';
import { Tenant } from '../tenants/entities/tenant.entity';
import { Subscription } from '../tenants/entities/subscription.entity';
import { User } from '../users/entities/user.entity';
import { RefreshToken } from '../auth/entities/refresh-token.entity';

import { AdminAuditService } from './audit/admin-audit.service';
import { AdminAuthController } from './auth/admin-auth.controller';
import { AdminAuthService } from './auth/admin-auth.service';
import { AdminPlansController } from './plans/admin-plans.controller';
import { AdminPlansService } from './plans/admin-plans.service';
import { AdminTenantsController } from './tenants/admin-tenants.controller';
import { AdminTenantsService } from './tenants/admin-tenants.service';
import { AdminSubscriptionsController } from './subscriptions/admin-subscriptions.controller';
import { AdminSubscriptionsService } from './subscriptions/admin-subscriptions.service';
import { AdminSaasPaymentsController } from './saas-payments/admin-saas-payments.controller';
import { AdminSaasPaymentsService } from './saas-payments/admin-saas-payments.service';
import { AdminStatsController } from './stats/admin-stats.controller';
import { AdminStatsService } from './stats/admin-stats.service';
import { AdminAuditLogsController } from './admin-audit-logs.controller';
import { requireEnv } from '../config/env.config';

@Injectable()
class AdminCronService {
  private readonly logger = new Logger(AdminCronService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  @Cron('1 0 1 * *') // 1er du mois à 00:01
  async resetMonthlyCounters() {
    const result = await this.dataSource.query(
      `UPDATE subscriptions SET "invoicesThisMonth" = 0, "lastResetAt" = now()`,
    );
    this.logger.log(`Monthly reset: ${result[1]} subscriptions reset`);
  }

  @Cron('0 9 * * *') // Quotidien 09:00
  async autoSuspendExpired() {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const result = await this.dataSource.query(
      `UPDATE tenants SET status = 'suspended'
       WHERE status = 'active'
       AND "deletedAt" IS NULL
       AND id IN (
         SELECT "tenantId" FROM subscriptions
         WHERE "currentPeriodEnd" IS NOT NULL
         AND "currentPeriodEnd" < $1
       )`,
      [sevenDaysAgo.toISOString()],
    );
    this.logger.log(`Auto-suspend: ${result[1] ?? 0} tenants suspended`);
  }
}

@Module({
  imports: [
    TypeOrmModule.forFeature([Plan, SaasPayment, AdminAuditLog, Tenant, Subscription, User, RefreshToken]),
    JwtModule.register({
      secret: requireEnv('JWT_SECRET'),
      signOptions: { expiresIn: parseInt(requireEnv('JWT_EXPIRY'), 10) },
    }),
  ],
  controllers: [
    AdminAuthController,
    AdminPlansController,
    AdminTenantsController,
    AdminSubscriptionsController,
    AdminSaasPaymentsController,
    AdminStatsController,
    AdminAuditLogsController,
  ],
  providers: [
    AdminAuditService,
    AdminAuthService,
    AdminPlansService,
    AdminTenantsService,
    AdminSubscriptionsService,
    AdminSaasPaymentsService,
    AdminStatsService,
    AdminCronService,
  ],
})
export class AdminModule {}
