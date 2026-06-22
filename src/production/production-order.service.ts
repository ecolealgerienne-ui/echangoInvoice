import {
  BadRequestException, Injectable, Logger, NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { ProductionOrder } from './production-order.entity';
import { ProductionMovement } from './production-movement.entity';
import { Nomenclature } from './nomenclature.entity';
import { FinishedProduct } from '../products/finished-product.entity';
import { CreateProductionOrderDto } from './dto/create-production-order.dto';
import { CompleteProductionOrderDto } from './dto/complete-production-order.dto';
import { CancelProductionOrderDto } from './dto/cancel-production-order.dto';
import { ListProductionOrdersDto } from './dto/list-production-orders.dto';

@Injectable()
export class ProductionOrderService {
  private readonly logger = new Logger(ProductionOrderService.name);

  constructor(
    @InjectRepository(ProductionOrder) private readonly repo: Repository<ProductionOrder>,
    @InjectRepository(Nomenclature) private readonly nomRepo: Repository<Nomenclature>,
    @InjectRepository(FinishedProduct) private readonly fpRepo: Repository<FinishedProduct>,
    @InjectDataSource() private readonly ds: DataSource,
  ) {}

  private async enrichOrders(orders: ProductionOrder[], tenantId: string) {
    const nomIds = [...new Set(orders.map(o => o.nomenclatureId).filter(Boolean))];
    const fpIds = [...new Set(orders.map(o => o.finishedProductId).filter(Boolean))];
    const nomMap: Record<string, string> = {};
    const fpMap: Record<string, string> = {};
    if (nomIds.length > 0) {
      const noms = await this.nomRepo.findByIds(nomIds);
      noms.forEach(n => { nomMap[n.id] = n.name; });
    }
    if (fpIds.length > 0) {
      const fps = await this.fpRepo.findByIds(fpIds);
      fps.forEach(fp => { fpMap[fp.id] = fp.name; });
    }
    return orders.map(o => ({
      ...o,
      nomenclatureName: nomMap[o.nomenclatureId] ?? null,
      finishedProductName: fpMap[o.finishedProductId] ?? null,
    }));
  }

  async findAll(query: ListProductionOrdersDto, tenantId: string) {
    const { page = 1, limit = 20, search, status, priority, from, to } = query;
    const qb = this.repo
      .createQueryBuilder('o')
      .where('o.tenantId = :tenantId AND o.deletedAt IS NULL', { tenantId });
    if (search) qb.andWhere('o.ref ILIKE :search', { search: `%${search}%` });
    if (status) qb.andWhere('o.status = :status', { status });
    if (priority) qb.andWhere('o.priority = :priority', { priority });
    if (from) qb.andWhere('o.createdAt >= :from', { from });
    if (to) qb.andWhere('o.createdAt <= :to', { to });
    qb.orderBy('o.createdAt', 'DESC').skip((page - 1) * limit).take(limit);
    const [data, total] = await qb.getManyAndCount();
    return { data: await this.enrichOrders(data, tenantId), pagination: { total, page, limit } };
  }

  async findOne(id: string, tenantId: string) {
    const order = await this.repo.findOne({ where: { id, tenantId, deletedAt: IsNull() } });
    if (!order) throw new NotFoundException('production_order_not_found');
    const [enriched] = await this.enrichOrders([order], tenantId);
    return { data: enriched };
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
        .where('o.tenantId = :tenantId AND o.deletedAt IS NULL', { tenantId })
        .andWhere('EXTRACT(YEAR FROM o.createdAt) = :year', { year })
        .orderBy('o.ref', 'DESC')
        .getOne();
      const seq = last ? parseInt(last.ref.split('-').pop() ?? '0') + 1 : 1;
      const ref = `MO-${yy}-${String(seq).padStart(3, '0')}`;

      const estimatedCost =
        Number(nom.estimatedCostPerUnit) * Number(dto.quantityToProduce);

      const order = qr.manager.create(ProductionOrder, {
        tenantId,
        ref,
        nomenclatureId: nom.id,
        finishedProductId: nom.finishedProductId,
        quantityToProduce: dto.quantityToProduce,
        priority: dto.priority ?? 'normal',
        responsibleUserId: dto.responsibleUserId ?? null,
        plannedStartDate: dto.plannedStartDate ? new Date(dto.plannedStartDate) : null,
        plannedEndDate: dto.plannedEndDate ? new Date(dto.plannedEndDate) : null,
        estimatedCost,
        status: 'planned',
        createdBy: userId,
        updatedBy: userId,
      });
      const saved = await qr.manager.save(ProductionOrder, order);

      await qr.commitTransaction();
      this.logger.log(`ProductionOrder created: ${ref} for tenant ${tenantId}`);
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
    if (order.status !== 'planned') throw new BadRequestException('production_order_not_planned');

    const nom = await this.nomRepo.findOne({
      where: { id: order.nomenclatureId, tenantId, deletedAt: IsNull() },
    });
    if (!nom) throw new NotFoundException('nomenclature_not_found');

    const qr = this.ds.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      for (const line of nom.bomLines) {
        const needed = Number(line.quantityPerUnit) * Number(order.quantityToProduce);
        const material = await qr.manager.findOne(FinishedProduct, {
          where: { id: line.rawMaterialId, tenantId, deletedAt: IsNull() },
        });
        if (!material) throw new NotFoundException(`raw_material_not_found:${line.rawMaterialId}`);

        // Calcul stock disponible = somme stock_entries - reservedQuantity
        const stockRows: { total: string }[] = await qr.query(
          `SELECT COALESCE(SUM(quantity), 0) AS total
           FROM stock_entries
           WHERE "rawMaterialId" = $1 AND status = 'available' AND "deletedAt" IS NULL`,
          [material.id],
        );
        const stockQty = Number(stockRows[0]?.total ?? 0);
        const available = stockQty - Number(material.reservedQuantity);

        if (available <= 0) {
          throw new BadRequestException(`insufficient_stock:${material.id}`);
        }
        if (available < needed) {
          this.logger.warn(
            `Stock insuffisant pour MO ${order.ref} — MP ${material.id}: disponible=${available}, besoin=${needed}`,
          );
        }

        await qr.manager
          .createQueryBuilder()
          .update(FinishedProduct)
          .set({ reservedQuantity: () => `"reservedQuantity" + ${needed}` })
          .where('id = :id', { id: material.id })
          .execute();
      }

      await qr.manager
        .createQueryBuilder()
        .update(ProductionOrder)
        .set({ status: 'in_progress', actualStartDate: new Date(), updatedBy: userId })
        .where('id = :id AND "tenantId" = :tenantId', { id, tenantId })
        .execute();

      await qr.commitTransaction();
      this.logger.log(`ProductionOrder started: ${order.ref}`);
      return this.findOne(id, tenantId);
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  async complete(id: string, dto: CompleteProductionOrderDto, tenantId: string, userId: string) {
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
      // 1. Aggregate mp_consumption movements
      const consumptionRows: { rawMaterialId: string; totalQty: string }[] = await qr.query(
        `SELECT "rawMaterialId", SUM("quantity") as "totalQty"
         FROM "production_movements"
         WHERE "productionOrderId" = $1 AND "type" = 'mp_consumption'
         GROUP BY "rawMaterialId"`,
        [id],
      );

      let actualCost = 0;

      for (const row of consumptionRows) {
        const consumed = Number(row.totalQty);
        const material = await qr.manager.findOne(FinishedProduct, {
          where: { id: row.rawMaterialId, tenantId, deletedAt: IsNull() },
        });
        if (!material) continue;

        actualCost += consumed * Number(material.lastCostPerUnit);

        // Decrement stock_entries FIFO (oldest first, may span multiple entries)
        let remaining = consumed;
        const entries: { id: string; quantity: string }[] = await qr.query(
          `SELECT id, quantity FROM stock_entries
           WHERE "rawMaterialId" = $1 AND status = 'available' AND "deletedAt" IS NULL
           ORDER BY "enteredAt" ASC`,
          [row.rawMaterialId],
        );
        for (const entry of entries) {
          if (remaining <= 0) break;
          const entryQty = Number(entry.quantity);
          const deduct = Math.min(remaining, entryQty);
          await qr.query(
            `UPDATE stock_entries SET quantity = quantity - $1 WHERE id = $2`,
            [deduct, entry.id],
          );
          remaining -= deduct;
        }

        // Update material stockQuantity and release reservation
        await qr.manager
          .createQueryBuilder()
          .update(FinishedProduct)
          .set({
            stockQuantity: () => `GREATEST(0, "stockQuantity" - ${consumed})`,
            reservedQuantity: () => `GREATEST(0, "reservedQuantity" - ${consumed})`,
          })
          .where('id = :id', { id: material.id })
          .execute();
      }

      // If no movements logged, fall back to BOM × quantityToProduce for reservations release
      if (consumptionRows.length === 0) {
        for (const line of nom.bomLines) {
          const needed = Number(line.quantityPerUnit) * Number(order.quantityToProduce);
          await qr.manager
            .createQueryBuilder()
            .update(FinishedProduct)
            .set({ reservedQuantity: () => `GREATEST(0, "reservedQuantity" - ${needed})` })
            .where('id = :id AND "tenantId" = :tenantId', { id: line.rawMaterialId, tenantId })
            .execute();
        }
        // Estimate actualCost from BOM
        actualCost = Number(nom.estimatedCostPerUnit) * Number(order.quantityToProduce);
      }

      // 2. Update finished product stock + average cost
      const qtyProduced = Number(dto.quantityProduced);
      const qtyRejected = Number(dto.quantityRejected ?? 0);
      const qtyNet = Math.max(0, qtyProduced - qtyRejected);

      const prevQty = Number(fp.stockQuantity);
      const prevAvg = Number(fp.averageCostPerUnit);
      const newTotalQty = prevQty + qtyNet;
      const newAvgCost = newTotalQty > 0
        ? (prevQty * prevAvg + actualCost) / newTotalQty
        : 0;

      await qr.manager
        .createQueryBuilder()
        .update(FinishedProduct)
        .set({
          stockQuantity: newTotalQty,
          averageCostPerUnit: newAvgCost,
          totalStockValue: newTotalQty * newAvgCost,
          updatedBy: userId,
        })
        .where('id = :id', { id: fp.id })
        .execute();

      // 3. Update order
      const yieldPct =
        Number(order.quantityToProduce) > 0
          ? Math.round((qtyProduced / Number(order.quantityToProduce)) * 10000) / 100
          : 0;

      await qr.manager
        .createQueryBuilder()
        .update(ProductionOrder)
        .set({
          status: 'completed',
          quantityProduced: qtyProduced,
          quantityRejected: qtyRejected,
          yieldPercentage: yieldPct,
          actualCost,
          actualEndDate: new Date(),
          notes: dto.notes ?? order.notes ?? null,
          updatedBy: userId,
        })
        .where('id = :id AND "tenantId" = :tenantId', { id, tenantId })
        .execute();

      await qr.commitTransaction();
      this.logger.log(
        `ProductionOrder completed: ${order.ref} — produced=${qtyProduced}, yield=${yieldPct}%`,
      );
      return this.findOne(id, tenantId);
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  async cancel(id: string, tenantId: string, userId: string, reason?: string) {
    const order = await this.repo.findOne({ where: { id, tenantId, deletedAt: IsNull() } });
    if (!order) throw new NotFoundException('production_order_not_found');
    if (order.status === 'completed') throw new BadRequestException('production_order_already_completed');
    if (order.status === 'cancelled') throw new BadRequestException('production_order_already_cancelled');

    const qr = this.ds.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      if (order.status === 'in_progress') {
        const nom = await this.nomRepo.findOne({ where: { id: order.nomenclatureId, tenantId } });
        if (nom) {
          for (const line of nom.bomLines) {
            const reserved = Number(line.quantityPerUnit) * Number(order.quantityToProduce);
            await qr.manager
              .createQueryBuilder()
              .update(FinishedProduct)
              .set({ reservedQuantity: () => `GREATEST(0, "reservedQuantity" - ${reserved})` })
              .where('id = :id AND "tenantId" = :tenantId', { id: line.rawMaterialId, tenantId })
              .execute();
          }
        }
      }

      await qr.manager
        .createQueryBuilder()
        .update(ProductionOrder)
        .set({ status: 'cancelled', notes: reason ?? order.notes ?? null, updatedBy: userId })
        .where('id = :id AND "tenantId" = :tenantId', { id, tenantId })
        .execute();

      await qr.commitTransaction();
      this.logger.log(`ProductionOrder cancelled: ${order.ref}`);
      return this.findOne(id, tenantId);
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }
}
