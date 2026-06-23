import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Plan } from '../entities/plan.entity';
import { UpdatePlanDto } from '../dto/update-plan.dto';
import { AdminAuditService } from '../audit/admin-audit.service';

@Injectable()
export class AdminPlansService {
  private readonly logger = new Logger(AdminPlansService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly auditService: AdminAuditService,
  ) {}

  async findAll() {
    const plans = await this.dataSource.manager.find(Plan, { order: { sortOrder: 'ASC' } });
    return { data: plans };
  }

  async update(id: string, dto: UpdatePlanDto, adminId: string, adminEmail: string, ipAddress: string | null) {
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const plan = await qr.manager.findOne(Plan, { where: { id } });
      if (!plan) throw new NotFoundException(`Plan ${id} not found`);

      const before = { ...plan };

      if (dto.pricePerMonth !== undefined) plan.pricePerMonth = dto.pricePerMonth;
      if (dto.invoiceLimit !== undefined) plan.invoiceLimit = dto.invoiceLimit;
      if (dto.usersLimit !== undefined) plan.usersLimit = dto.usersLimit;
      if (dto.features !== undefined) plan.features = dto.features;

      await qr.manager.save(Plan, plan);
      await this.auditService.logAction(qr, adminId, adminEmail, 'plan.updated', 'plan', id, { before, after: dto }, ipAddress);
      await qr.commitTransaction();

      this.logger.log(`Plan ${plan.slug} updated by ${adminEmail}`);
      return { data: plan };
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }
}
