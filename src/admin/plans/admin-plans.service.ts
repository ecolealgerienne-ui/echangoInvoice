import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Plan } from '../entities/plan.entity';
import { UpdatePlanDto } from '../dto/update-plan.dto';

@Injectable()
export class AdminPlansService {
  private readonly logger = new Logger(AdminPlansService.name);

  constructor(
    @InjectRepository(Plan) private readonly planRepo: Repository<Plan>,
  ) {}

  async findAll() {
    const plans = await this.planRepo.find({ order: { sortOrder: 'ASC' } });
    return { data: plans };
  }

  async update(id: string, dto: UpdatePlanDto, adminEmail: string) {
    const plan = await this.planRepo.findOne({ where: { id } });
    if (!plan) throw new NotFoundException(`Plan ${id} not found`);

    if (dto.pricePerMonth !== undefined) plan.pricePerMonth = dto.pricePerMonth;
    if (dto.invoiceLimit !== undefined) plan.invoiceLimit = dto.invoiceLimit;
    if (dto.usersLimit !== undefined) plan.usersLimit = dto.usersLimit;
    if (dto.features !== undefined) plan.features = dto.features;

    await this.planRepo.save(plan);
    this.logger.log(`Plan ${plan.slug} updated by ${adminEmail}`);
    return { data: plan };
  }
}
