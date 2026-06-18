import {
  Injectable, NotFoundException, Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, ILike, FindOptionsWhere } from 'typeorm';
import { RawMaterial } from './raw-material.entity';
import { CreateRawMaterialDto } from './dto/create-raw-material.dto';
import { UpdateRawMaterialDto } from './dto/update-raw-material.dto';
import { ListRawMaterialsDto } from './dto/list-raw-materials.dto';

@Injectable()
export class RawMaterialsService {
  private readonly logger = new Logger(RawMaterialsService.name);

  constructor(
    @InjectRepository(RawMaterial)
    private readonly repo: Repository<RawMaterial>,
  ) {}

  async create(dto: CreateRawMaterialDto, tenantId: string, userId: string) {
    const rm = this.repo.create({ ...dto, tenantId, createdBy: userId, updatedBy: userId, isActive: dto.isActive ?? true });
    await this.repo.save(rm);
    this.logger.log(`RawMaterial created: ${rm.id} for tenant ${tenantId}`);
    return { data: rm };
  }

  async findAll(query: ListRawMaterialsDto, tenantId: string) {
    const { page, limit, search, supplierId, isActive } = query;
    const skip = (page - 1) * limit;

    const base: FindOptionsWhere<RawMaterial> = { tenantId, deletedAt: IsNull() };
    if (supplierId !== undefined) base.supplierId = supplierId;
    if (isActive !== undefined) base.isActive = isActive;

    const where: FindOptionsWhere<RawMaterial>[] = search
      ? [
          { ...base, name: ILike(`%${search}%`) },
          { ...base, code: ILike(`%${search}%`) },
        ]
      : [base];

    const [data, total] = await this.repo.findAndCount({
      where,
      skip,
      take: limit,
      order: { name: 'ASC' },
    });

    return { data, pagination: { total, page, limit } };
  }

  async findOne(id: string, tenantId: string) {
    const rm = await this.repo.findOne({ where: { id, tenantId, deletedAt: IsNull() } });
    if (!rm) throw new NotFoundException('errors.raw_material_not_found');
    return { data: rm };
  }

  async update(id: string, dto: UpdateRawMaterialDto, tenantId: string, userId: string) {
    const rm = await this.repo.findOne({ where: { id, tenantId, deletedAt: IsNull() } });
    if (!rm) throw new NotFoundException('errors.raw_material_not_found');
    Object.assign(rm, dto, { updatedBy: userId });
    await this.repo.save(rm);
    return { data: rm };
  }

  async remove(id: string, tenantId: string) {
    const rm = await this.repo.findOne({ where: { id, tenantId, deletedAt: IsNull() } });
    if (!rm) throw new NotFoundException('errors.raw_material_not_found');
    await this.repo.softDelete(id);
  }
}
