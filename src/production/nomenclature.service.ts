import {
  Injectable, Logger, NotFoundException, UnprocessableEntityException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { Nomenclature } from './nomenclature.entity';
import { BomLine } from './bom-line.entity';
import { CreateNomenclatureDto } from './dto/create-nomenclature.dto';
import { UpdateNomenclatureDto } from './dto/update-nomenclature.dto';

@Injectable()
export class NomenclatureService {
  private readonly logger = new Logger(NomenclatureService.name);

  constructor(
    @InjectRepository(Nomenclature) private readonly repo: Repository<Nomenclature>,
    @InjectDataSource() private readonly ds: DataSource,
  ) {}

  async findAll(tenantId: string, page = 1, limit = 20, search?: string) {
    const qb = this.repo
      .createQueryBuilder('n')
      .where('n.tenantId = :tenantId AND n.deletedAt IS NULL', { tenantId });
    if (search) qb.andWhere('n.name ILIKE :search', { search: `%${search}%` });
    qb.orderBy('n.createdAt', 'DESC').skip((page - 1) * limit).take(limit);
    const [data, total] = await qb.getManyAndCount();
    return { data, pagination: { total, page, limit } };
  }

  async findOne(id: string, tenantId: string) {
    const nom = await this.repo.findOne({ where: { id, tenantId, deletedAt: IsNull() } });
    if (!nom) throw new NotFoundException(`nomenclature_not_found`);
    return { data: nom };
  }

  async create(dto: CreateNomenclatureDto, tenantId: string, userId: string) {
    const qr = this.ds.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const nom = qr.manager.create(Nomenclature, {
        tenantId,
        finishedProductId: dto.finishedProductId,
        name: dto.name,
        description: dto.description ?? null,
        isActive: true,
        createdBy: userId,
        updatedBy: userId,
      });
      const saved = await qr.manager.save(Nomenclature, nom);

      const lines = dto.bomLines.map(l =>
        qr.manager.create(BomLine, {
          tenantId,
          nomenclatureId: saved.id,
          rawMaterialId: l.rawMaterialId,
          quantity: l.quantity,
          unit: l.unit,
          notes: l.notes ?? null,
        }),
      );
      await qr.manager.save(BomLine, lines);

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
    if (!existing) throw new NotFoundException(`nomenclature_not_found`);

    const qr = this.ds.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      if (dto.name !== undefined) existing.name = dto.name;
      if (dto.description !== undefined) existing.description = dto.description ?? null;
      if (dto.finishedProductId !== undefined) existing.finishedProductId = dto.finishedProductId;
      existing.updatedBy = userId;
      await qr.manager.save(Nomenclature, existing);

      if (dto.bomLines !== undefined) {
        await qr.manager.delete(BomLine, { nomenclatureId: id });
        const lines = dto.bomLines.map(l =>
          qr.manager.create(BomLine, {
            tenantId,
            nomenclatureId: id,
            rawMaterialId: l.rawMaterialId,
            quantity: l.quantity,
            unit: l.unit,
            notes: l.notes ?? null,
          }),
        );
        if (lines.length > 0) await qr.manager.save(BomLine, lines);
      }

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
    if (!nom) throw new NotFoundException(`nomenclature_not_found`);
    await this.repo.softDelete(id);
    this.logger.log(`Nomenclature soft-deleted: ${id}`);
    return { data: { success: true } };
  }
}
