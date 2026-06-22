import {
  BadRequestException, Injectable, Logger, NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { ProductionOrder } from './production-order.entity';
import { ProductionMovement } from './production-movement.entity';
import { Nomenclature } from './nomenclature.entity';
import { RawMaterial } from '../raw-materials/raw-material.entity';
import { FinishedProduct } from '../products/finished-product.entity';
import { CreateProductionOrderDto } from './dto/create-production-order.dto';
import { CompleteProductionOrderDto } from './dto/complete-production-order.dto';
import { CreateProductionMovementDto } from './dto/create-production-movement.dto';
import { ListProductionOrdersDto } from './dto/list-production-orders.dto';

@Injectable()
export class ProductionOrderService {
  private readonly logger = new Logger(ProductionOrderService.name);

  constructor(
    @InjectRepository(ProductionOrder) private readonly repo: Repository<ProductionOrder>,
    @InjectRepository(Nomenclature) private readonly nomRepo: Repository<Nomenclature>,
    @InjectRepository(RawMaterial) private readonly rmRepo: Repository<RawMaterial>,
    @InjectRepository(FinishedProduct) private readonly fpRepo: Repository<FinishedProduct>,
    @InjectDataSource() private readonly ds: DataSource,
  ) {}

  async findAll(query: ListProductionOrdersDto, tenantId: string) {
    const { page = 1, limit = 20, search, status } = query;
    const qb = this.repo
      .createQueryBuilder('o')
      .where('o.tenantId = :tenantId AND o.deletedAt IS NULL', { tenantId });
    if (search) qb.andWhere('o.reference ILIKE :search', { search: `%${search}%` });
    if (status) qb.andWhere('o.status = :status', { status });
    qb.orderBy('o.createdAt', 'DESC').skip((page - 1) * limit).take(limit);
    const [data, total] = await qb.getManyAndCount();
    return { data, pagination: { total, page, limit } };
  }

  async findOne(id: string, tenantId: string) {
    const order = await this.repo.findOne({ where: { id, tenantId, deletedAt: IsNull() } });
    if (!order) throw new NotFoundException('production_order_not_found');
    return { data: order };
  }

  async create(dto: CreateProductionOrderDto, tenantId: string, userId: string) {
    const nom = await this.nomRepo.findOne({
      where: { id: dto.nomenclatureId, tenantId, deletedAt: IsNull() },
    });
    if (!nom) throw new NotFoundException('nomenclature_not_found');

    const qr = this.ds.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      await qr.query(
        `SELECT pg_advisory_xact_lock(hashtext('mo_ref_' || $1 || '_' || $2))`,
        [tenantId, new Date().getFullYear()],
      );

      const year = new Date().getFullYear();
      const yy = String(year).slice(-2);
      const last = await qr.manager
        .createQueryBuilder(ProductionOrder, 'o')
        .where('o.tenantId = :tenantId', { tenantId })
        .andWhere(`EXTRACT(YEAR FROM o.createdAt) = :year`, { year })
        .orderBy('o.reference', 'DESC')
        .getOne();
      const seq = last
        ? parseInt(last.reference.split('-').pop() ?? '0') + 1
        : 1;
      const reference = `MO-${yy}-${String(seq).padStart(3, '0')}`;

      const order = qr.manager.create(ProductionOrder, {
        tenantId,
        reference,
        nomenclatureId: nom.id,
        finishedProductId: nom.finishedProductId,
        quantityOrdered: dto.quantityOrdered,
        priority: dto.priority ?? 'normal',
        scheduledStartDate: dto.scheduledStartDate ? new Date(dto.scheduledStartDate) : null,
        scheduledEndDate: dto.scheduledEndDate ? new Date(dto.scheduledEndDate) : null,
        status: 'draft',
        createdBy: userId,
        updatedBy: userId,
      });
      const saved = await qr.manager.save(ProductionOrder, order);

      await qr.commitTransaction();
      this.logger.log(`ProductionOrder created: ${saved.reference} for tenant ${tenantId}`);
      return this.findOne(saved.id, tenantId);
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  async start(id: string, tenantId: string, userId: string) {
    const order = await this.repo.findOne({ where: { id, tenantId, deletedAt: IsNull() } });
    if (!order) throw new NotFoundException('production_order_not_found');
    if (order.status !== 'draft') throw new BadRequestException('production_order_not_draft');

    const nom = await this.nomRepo.findOne({
      where: { id: order.nomenclatureId, tenantId, deletedAt: IsNull() },
    });
    if (!nom) throw new NotFoundException('nomenclature_not_found');

    const qr = this.ds.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      // Reserve raw materials
      for (const line of nom.bomLines) {
        const needed = Number(line.quantity) * Number(order.quantityOrdered);
        const rm = await qr.manager.findOne(RawMaterial, {
          where: { id: line.rawMaterialId, tenantId, deletedAt: IsNull() },
        });
        if (!rm) throw new NotFoundException(`raw_material_not_found:${line.rawMaterialId}`);
        await qr.manager.increment(
          RawMaterial,
          { id: rm.id },
          'reservedQuantity',
          needed,
        );
      }

      order.status = 'in_progress';
      order.actualStartDate = new Date();
      order.updatedBy = userId;
      await qr.manager.save(ProductionOrder, order);

      await qr.commitTransaction();
      this.logger.log(`ProductionOrder started: ${order.reference}`);
      return this.findOne(id, tenantId);
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  async complete(
    id: string,
    dto: CompleteProductionOrderDto,
    tenantId: string,
    userId: string,
  ) {
    const order = await this.repo.findOne({ where: { id, tenantId, deletedAt: IsNull() } });
    if (!order) throw new NotFoundException('production_order_not_found');
    if (order.status !== 'in_progress') throw new BadRequestException('production_order_not_in_progress');

    const nom = await this.nomRepo.findOne({
      where: { id: order.nomenclatureId, tenantId, deletedAt: IsNull() },
    });
    if (!nom) throw new NotFoundException('nomenclature_not_found');

    const fp = await this.fpRepo.findOne({
      where: { id: order.finishedProductId, tenantId, deletedAt: IsNull() },
    });
    if (!fp) throw new NotFoundException('finished_product_not_found');

    const qr = this.ds.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      // 1. Decrement raw materials stock + release reservations
      let totalCost = 0;
      for (const line of nom.bomLines) {
        const consumed = Number(line.quantity) * Number(order.quantityOrdered);
        const rm = await qr.manager.findOne(RawMaterial, {
          where: { id: line.rawMaterialId, tenantId, deletedAt: IsNull() },
        });
        if (!rm) throw new NotFoundException(`raw_material_not_found:${line.rawMaterialId}`);
        totalCost += consumed * Number(rm.lastCostPerUnit);

        await qr.manager
          .createQueryBuilder()
          .update(RawMaterial)
          .set({
            reservedQuantity: () => `"reservedQuantity" - ${consumed}`,
          })
          .where('id = :id', { id: rm.id })
          .execute();

        // Log consumption movement
        await qr.manager.save(ProductionMovement, qr.manager.create(ProductionMovement, {
          tenantId,
          productionOrderId: order.id,
          rawMaterialId: rm.id,
          type: 'raw_material_consumption',
          quantity: consumed,
          unit: line.unit,
          notes: `Clôture MO ${order.reference}`,
          createdBy: userId,
        }));
      }

      // 2. Update finished product stock + average cost
      const qtyProduced = Number(dto.quantityProduced);
      const prevQty = Number(fp.stockQuantity);
      const prevAvg = Number(fp.averageCostPerUnit);
      const newAvgCost = qtyProduced > 0
        ? (prevQty * prevAvg + totalCost) / (prevQty + qtyProduced)
        : prevAvg;

      await qr.manager
        .createQueryBuilder()
        .update(FinishedProduct)
        .set({
          stockQuantity: () => `"stockQuantity" + ${qtyProduced}`,
          averageCostPerUnit: newAvgCost,
          totalStockValue: () => `("stockQuantity" + ${qtyProduced}) * ${newAvgCost}`,
          updatedBy: userId,
        })
        .where('id = :id', { id: fp.id })
        .execute();

      // Log output movement
      await qr.manager.save(ProductionMovement, qr.manager.create(ProductionMovement, {
        tenantId,
        productionOrderId: order.id,
        finishedProductId: fp.id,
        type: 'finished_product_output',
        quantity: qtyProduced,
        unit: fp.unit,
        notes: dto.notes ?? `Clôture MO ${order.reference}`,
        createdBy: userId,
      }));

      // 3. Update order
      order.status = 'completed';
      order.quantityProduced = qtyProduced;
      order.actualEndDate = new Date();
      order.notes = dto.notes ?? order.notes;
      order.updatedBy = userId;
      await qr.manager.save(ProductionOrder, order);

      await qr.commitTransaction();
      this.logger.log(`ProductionOrder completed: ${order.reference}, produced=${qtyProduced}`);
      return this.findOne(id, tenantId);
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  async cancel(id: string, tenantId: string, userId: string) {
    const order = await this.repo.findOne({ where: { id, tenantId, deletedAt: IsNull() } });
    if (!order) throw new NotFoundException('production_order_not_found');
    if (order.status === 'completed') throw new BadRequestException('production_order_already_completed');
    if (order.status === 'cancelled') throw new BadRequestException('production_order_already_cancelled');

    const qr = this.ds.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      // Release reservations if was in_progress
      if (order.status === 'in_progress') {
        const nom = await this.nomRepo.findOne({ where: { id: order.nomenclatureId } });
        if (nom) {
          for (const line of nom.bomLines) {
            const reserved = Number(line.quantity) * Number(order.quantityOrdered);
            await qr.manager
              .createQueryBuilder()
              .update(RawMaterial)
              .set({ reservedQuantity: () => `GREATEST(0, "reservedQuantity" - ${reserved})` })
              .where('id = :id', { id: line.rawMaterialId })
              .execute();
          }
        }
      }

      order.status = 'cancelled';
      order.updatedBy = userId;
      await qr.manager.save(ProductionOrder, order);

      await qr.commitTransaction();
      this.logger.log(`ProductionOrder cancelled: ${order.reference}`);
      return this.findOne(id, tenantId);
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  async addMovement(
    id: string,
    dto: CreateProductionMovementDto,
    tenantId: string,
    userId: string,
  ) {
    const order = await this.repo.findOne({ where: { id, tenantId, deletedAt: IsNull() } });
    if (!order) throw new NotFoundException('production_order_not_found');
    if (order.status !== 'in_progress') throw new BadRequestException('production_order_not_in_progress');

    const movement = this.ds.manager.create(ProductionMovement, {
      tenantId,
      productionOrderId: id,
      rawMaterialId: dto.rawMaterialId ?? null,
      finishedProductId: dto.finishedProductId ?? null,
      type: dto.type as any,
      quantity: dto.quantity,
      unit: dto.unit,
      notes: dto.notes ?? null,
      createdBy: userId,
    });
    await this.ds.manager.save(ProductionMovement, movement);
    return { data: movement };
  }
}
