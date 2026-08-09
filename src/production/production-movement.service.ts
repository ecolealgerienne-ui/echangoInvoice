import {
  BadRequestException, Injectable, Logger, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { ProductionOrder } from './production-order.entity';
import { ProductionMovement } from './production-movement.entity';
import { FinishedProduct } from '../products/finished-product.entity';
import { CreateProductionMovementDto } from './dto/create-production-movement.dto';
import { BatchCreateMovementsDto } from './dto/batch-create-movements.dto';

@Injectable()
export class ProductionMovementService {
  private readonly logger = new Logger(ProductionMovementService.name);

  constructor(
    @InjectRepository(ProductionOrder) private readonly orderRepo: Repository<ProductionOrder>,
    @InjectRepository(ProductionMovement) private readonly repo: Repository<ProductionMovement>,
    @InjectRepository(FinishedProduct) private readonly fpRepo: Repository<FinishedProduct>,
  ) {}

  async findByOrder(orderId: string, tenantId: string, type?: string, from?: string, to?: string) {
    // L'appartenance de l'ORDRE, et pas seulement celle des mouvements.
    //
    // Les mouvements étaient déjà filtrés par `tenantId` : rien ne sortait. Mais
    // l'identifiant d'un ordre appartenant à un autre locataire rendait
    // `200 { data: [] }`, là où le contrat est « introuvable » — et où
    // `create()`, quelques lignes plus bas, pose la question depuis toujours.
    // La lecture était la seule des deux à ne pas la poser.
    //
    // Ce n'était pas une fuite ; c'est la forme qui en produit une le jour où
    // le `WHERE` de la requête bouge. Trouvé par scripts/banc-cloisonnement.py.
    const ordre = await this.orderRepo.findOne({
      where: { id: orderId, tenantId, deletedAt: IsNull() },
      select: ['id'],
    });
    if (!ordre) throw new NotFoundException('production_order_not_found');

    const qb = this.repo
      .createQueryBuilder('m')
      .where('m.productionOrderId = :orderId AND m.tenantId = :tenantId', { orderId, tenantId });
    if (type) qb.andWhere('m.type = :type', { type });
    if (from) qb.andWhere('m.movedAt >= :from', { from });
    if (to) qb.andWhere('m.movedAt <= :to', { to });
    qb.orderBy('m.movedAt', 'ASC');
    const movements = await qb.getMany();

    const productIds = [
      ...new Set([
        ...movements.map(m => m.rawMaterialId).filter(Boolean),
        ...movements.map(m => m.finishedProductId).filter(Boolean),
      ]),
    ] as string[];

    const nameMap: Record<string, string> = {};
    if (productIds.length > 0) {
      const products = await this.fpRepo.findByIds(productIds);
      products.forEach(p => { nameMap[p.id] = p.name; });
    }

    const data = movements.map(m => ({
      ...m,
      rawMaterialName: m.rawMaterialId ? (nameMap[m.rawMaterialId] ?? null) : null,
      finishedProductName: m.finishedProductId ? (nameMap[m.finishedProductId] ?? null) : null,
    }));

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

  async createBatch(
    orderId: string,
    dto: BatchCreateMovementsDto,
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

    const now = new Date();
    const movements = dto.items.map(item =>
      this.repo.create({
        tenantId,
        productionOrderId: orderId,
        rawMaterialId: item.rawMaterialId ?? null,
        finishedProductId: item.finishedProductId ?? null,
        type: item.type as any,
        quantity: item.quantity,
        unit: item.unit,
        reason: item.reason ?? null,
        location: null,
        notes: item.notes ?? null,
        loggedBy: userId,
        movedAt: now,
      }),
    );
    const saved = await this.repo.save(movements);
    this.logger.log(`Batch of ${saved.length} movements logged on order ${orderId}`);
    return { data: saved };
  }
}
