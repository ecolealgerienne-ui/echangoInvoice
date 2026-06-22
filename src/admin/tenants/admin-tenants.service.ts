import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, IsNull } from 'typeorm';
import { Tenant } from '../../tenants/entities/tenant.entity';
import { Subscription } from '../../tenants/entities/subscription.entity';
import { User } from '../../users/entities/user.entity';
import { RefreshToken } from '../../auth/entities/refresh-token.entity';
import { AdminAuditService } from '../audit/admin-audit.service';
import { ListTenantsDto } from '../dto/list-tenants.dto';
import { PatchTenantStatusDto } from '../dto/patch-tenant-status.dto';

@Injectable()
export class AdminTenantsService {
  private readonly logger = new Logger(AdminTenantsService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly auditService: AdminAuditService,
  ) {}

  async findAll(dto: ListTenantsDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const offset = (page - 1) * limit;

    let query = this.dataSource.getRepository(Tenant)
      .createQueryBuilder('t')
      .where('t.deletedAt IS NULL');

    if (dto.search) {
      query = query.andWhere('(t.name ILIKE :search OR t.email ILIKE :search)', { search: `%${dto.search}%` });
    }
    if (dto.status) {
      query = query.andWhere('t.status = :status', { status: dto.status });
    }

    const [tenants, total] = await query.skip(offset).take(limit).getManyAndCount();
    return { data: tenants, pagination: { total, page, limit } };
  }

  async findOne(id: string) {
    const tenant = await this.dataSource.getRepository(Tenant).findOne({
      where: { id, deletedAt: IsNull() },
    });
    if (!tenant) throw new NotFoundException(`Tenant ${id} not found`);

    const subscription = await this.dataSource.getRepository(Subscription).findOne({
      where: { tenantId: id },
    });

    const users = await this.dataSource.getRepository(User).find({
      where: { tenantId: id, deletedAt: IsNull() },
      select: ['id', 'name', 'email', 'role', 'isActive'],
    });

    const payments = await this.dataSource.query(
      `SELECT id, amount, "paidAt", method, "monthsCovered" FROM saas_payments WHERE "tenantId" = $1 ORDER BY "paidAt" DESC LIMIT 20`,
      [id],
    );

    return {
      data: {
        ...tenant,
        subscription,
        users,
        paymentsHistory: payments,
      },
    };
  }

  async patchStatus(id: string, dto: PatchTenantStatusDto, adminId: string, adminEmail: string, ipAddress: string | null) {
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const tenant = await qr.manager.findOne(Tenant, { where: { id, deletedAt: IsNull() } });
      if (!tenant) throw new NotFoundException(`Tenant ${id} not found`);

      const before = { status: tenant.status };
      tenant.status = dto.status;
      await qr.manager.save(Tenant, tenant);

      if (dto.status === 'suspended') {
        await qr.manager.delete(RefreshToken, { tenantId: id });
      }

      await this.auditService.logAction(qr, adminId, adminEmail, 'tenant.status_changed', 'tenant', id, { before, after: { status: dto.status } }, ipAddress);
      await qr.commitTransaction();
      return { data: tenant };
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  async remove(id: string, adminId: string, adminEmail: string, ipAddress: string | null) {
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const tenant = await qr.manager.findOne(Tenant, { where: { id, deletedAt: IsNull() } });
      if (!tenant) throw new NotFoundException(`Tenant ${id} not found`);

      tenant.deletedAt = new Date();
      await qr.manager.save(Tenant, tenant);

      await this.auditService.logAction(qr, adminId, adminEmail, 'tenant.deleted', 'tenant', id, null, ipAddress);
      await qr.commitTransaction();
      return { data: { message: 'Tenant deleted' } };
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }
}
