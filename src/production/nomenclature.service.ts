import {
  ConflictException, Injectable, Logger, NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { Nomenclature } from './nomenclature.entity';
import { BomLine } from './bom-line.entity';
import { FinishedProduct } from '../products/finished-product.entity';
import { ProductionOrder } from './production-order.entity';
import { CreateNomenclatureDto } from './dto/create-nomenclature.dto';
import { UpdateNomenclatureDto } from './dto/update-nomenclature.dto';

@Injectable()
export class NomenclatureService {
  private readonly logger = new Logger(NomenclatureService.name);

  constructor(
    @InjectRepository(Nomenclature) private readonly repo: Repository<Nomenclature>,
    @InjectRepository(FinishedProduct) private readonly fpRepo: Repository<FinishedProduct>,
    @InjectRepository(ProductionOrder) private readonly orderRepo: Repository<ProductionOrder>,
    @InjectDataSource() private readonly ds: DataSource,
  ) {}

  async findAll(
    tenantId: string,
    page = 1,
    limit = 20,
    search?: string,
    status?: string,
    finishedProductId?: string,
  ) {
    const qb = this.repo
      .createQueryBuilder('n')
      .leftJoinAndSelect('n.bomLines', 'bl')
      .where('n.tenantId = :tenantId AND n.deletedAt IS NULL', { tenantId });
    if (search) qb.andWhere('(n.name ILIKE :s OR n.code ILIKE :s)', { s: `%${search}%` });
    if (status) qb.andWhere('n.status = :status', { status });
    if (finishedProductId) qb.andWhere('n.finishedProductId = :finishedProductId', { finishedProductId });
    qb.orderBy('n.createdAt', 'DESC').skip((page - 1) * limit).take(limit);
    const [data, total] = await qb.getManyAndCount();

    const fpIds = [...new Set(data.map(n => n.finishedProductId).filter(Boolean))];
    const fpMap: Record<string, string> = {};
    if (fpIds.length > 0) {
      const fps = await this.fpRepo.findByIds(fpIds);
      fps.forEach(fp => { fpMap[fp.id] = fp.name; });
    }

    return {
      data: data.map(n => ({ ...n, finishedProductName: fpMap[n.finishedProductId] ?? null })),
      pagination: { total, page, limit },
    };
  }

  async findOne(id: string, tenantId: string) {
    const nom = await this.repo.findOne({ where: { id, tenantId, deletedAt: IsNull() } });
    if (!nom) throw new NotFoundException('nomenclature_not_found');
    return { data: nom };
  }

  async create(dto: CreateNomenclatureDto, tenantId: string, userId: string) {
    const qr = this.ds.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const nom = qr.manager.create(Nomenclature, {
        tenantId,
        code: dto.code ?? null,
        name: dto.name,
        description: dto.description ?? null,
        finishedProductId: dto.finishedProductId,
        outputQuantity: dto.outputQuantity,
        version: 1,
        status: 'active',
        estimatedCostPerUnit: 0,
        createdBy: userId,
        updatedBy: userId,
      });
      const saved = await qr.manager.save(Nomenclature, nom);

      let estimatedCost = 0;
      const lines = await Promise.all(
        dto.lines.map(async (l, idx) => {
          const rm = await qr.manager.findOne(FinishedProduct, {
            where: { id: l.rawMaterialId, tenantId, deletedAt: IsNull() },
          });
          if (!rm) throw new NotFoundException(`raw_material_not_found:${l.rawMaterialId}`);
          const unitCost = Number(rm.lastCostPerUnit);
          const lineCost = Number(l.quantityPerUnit) * unitCost;
          estimatedCost += lineCost;
          return qr.manager.create(BomLine, {
            tenantId,
            nomenclatureId: saved.id,
            order: l.order ?? idx + 1,
            rawMaterialId: l.rawMaterialId,
            quantityPerUnit: l.quantityPerUnit,
            unit: l.unit,
            unitCost,
            lineCost,
          });
        }),
      );
      await qr.manager.save(BomLine, lines);

      // estimatedCostPerUnit = coût total pour 1 unité finie = Σ(quantityPerUnit × lastCostPerUnit)
      saved.estimatedCostPerUnit = estimatedCost;
      await qr.manager.save(Nomenclature, saved);

      await qr.commitTransaction();
      this.logger.log(`Nomenclature created: ${saved.id} for tenant ${tenantId}`);
      return this.findOne(saved.id, tenantId);
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  async update(id: string, dto: UpdateNomenclatureDto, tenantId: string, userId: string) {
    const existing = await this.repo.findOne({ where: { id, tenantId, deletedAt: IsNull() } });
    if (!existing) throw new NotFoundException('nomenclature_not_found');

    const qr = this.ds.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      if (dto.code !== undefined) existing.code = dto.code ?? null;
      if (dto.name !== undefined) existing.name = dto.name;
      if (dto.description !== undefined) existing.description = dto.description ?? null;
      if (dto.finishedProductId !== undefined) existing.finishedProductId = dto.finishedProductId;
      if (dto.outputQuantity !== undefined) existing.outputQuantity = dto.outputQuantity;
      existing.updatedBy = userId;

      if (dto.lines !== undefined) {
        await qr.manager.delete(BomLine, { nomenclatureId: id });
        let estimatedCost = 0;
        const outputQty = dto.outputQuantity ?? Number(existing.outputQuantity);
        const lines = await Promise.all(
          dto.lines.map(async (l, idx) => {
            const rm = await qr.manager.findOne(FinishedProduct, {
              where: { id: l.rawMaterialId, tenantId, deletedAt: IsNull() },
            });
            if (!rm) throw new NotFoundException(`raw_material_not_found:${l.rawMaterialId}`);
            const unitCost = Number(rm.lastCostPerUnit);
            const lineCost = Number(l.quantityPerUnit) * unitCost;
            estimatedCost += lineCost;
            return qr.manager.create(BomLine, {
              tenantId,
              nomenclatureId: id,
              order: l.order ?? idx + 1,
              rawMaterialId: l.rawMaterialId,
              quantityPerUnit: l.quantityPerUnit,
              unit: l.unit,
              unitCost,
              lineCost,
            });
          }),
        );
        if (lines.length > 0) await qr.manager.save(BomLine, lines);
        existing.estimatedCostPerUnit = estimatedCost;
      }

      // UPDATE direct sans passer par save() pour éviter que TypeORM cascade
      // et orpheline les nouvelles bomLines qu'on vient d'insérer
      await qr.manager
        .createQueryBuilder()
        .update(Nomenclature)
        .set({
          code: existing.code,
          name: existing.name,
          description: existing.description,
          finishedProductId: existing.finishedProductId,
          outputQuantity: existing.outputQuantity,
          estimatedCostPerUnit: existing.estimatedCostPerUnit,
          updatedBy: userId,
        })
        .where('id = :id AND "tenantId" = :tenantId', { id, tenantId })
        .execute();
      await qr.commitTransaction();
      return this.findOne(id, tenantId);
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  async remove(id: string, tenantId: string) {
    const nom = await this.repo.findOne({ where: { id, tenantId, deletedAt: IsNull() } });
    if (!nom) throw new NotFoundException('nomenclature_not_found');

    const activeOrders = await this.orderRepo.count({
      where: [
        { nomenclatureId: id, status: 'planned', deletedAt: IsNull() },
        { nomenclatureId: id, status: 'in_progress', deletedAt: IsNull() },
      ],
    });
    if (activeOrders > 0) {
      throw new ConflictException('nomenclature_has_active_orders');
    }

    await this.repo.softDelete(id);
    this.logger.log(`Nomenclature soft-deleted: ${id}`);
    return { data: { success: true } };
  }
}
