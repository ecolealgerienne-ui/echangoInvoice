import {
  BadRequestException, Injectable, Logger, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { ProductionOrder } from './production-order.entity';
import { ProductionMovement } from './production-movement.entity';
import { CreateProductionMovementDto } from './dto/create-production-movement.dto';

@Injectable()
export class ProductionMovementService {
  private readonly logger = new Logger(ProductionMovementService.name);

  constructor(
    @InjectRepository(ProductionOrder) private readonly orderRepo: Repository<ProductionOrder>,
    @InjectRepository(ProductionMovement) private readonly repo: Repository<ProductionMovement>,
  ) {}

  async findByOrder(orderId: string, tenantId: string, type?: string, from?: string, to?: string) {
    const qb = this.repo
      .createQueryBuilder('m')
      .where('m.productionOrderId = :orderId AND m.tenantId = :tenantId', { orderId, tenantId });
    if (type) qb.andWhere('m.type = :type', { type });
    if (from) qb.andWhere('m.movedAt >= :from', { from });
    if (to) qb.andWhere('m.movedAt <= :to', { to });
    qb.orderBy('m.movedAt', 'ASC');
    const data = await qb.getMany();
    return { data };
  }

  async create(
    orderId: string,
    dto: CreateProductionMovementDto,
    tenantId: string,
    userId: string,
  ) {
    const order = await this.orderRepo.findOne({
      where: { id: orderId, tenantId, deletedAt: IsNull() },
    });
    if (!order) throw new NotFoundException('production_order_not_found');
    if (order.status !== 'in_progress') {
      throw new BadRequestException('production_order_not_in_progress');
    }

    const movement = this.repo.create({
      tenantId,
      productionOrderId: orderId,
      rawMaterialId: dto.rawMaterialId ?? null,
      finishedProductId: dto.finishedProductId ?? null,
      type: dto.type as any,
      quantity: dto.quantity,
      unit: dto.unit,
      reason: dto.reason ?? null,
      location: dto.location ?? null,
      notes: dto.notes ?? null,
      loggedBy: userId,
      movedAt: dto.movedAt ? new Date(dto.movedAt) : new Date(),
    });
    await this.repo.save(movement);
    this.logger.log(`Movement logged: ${dto.type} on order ${orderId}`);
    return { data: movement };
  }
}
