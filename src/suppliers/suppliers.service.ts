import {
  Injectable, NotFoundException, UnprocessableEntityException, Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, ILike } from 'typeorm';
import { Supplier } from './supplier.entity';
import { RawMaterial } from '../raw-materials/raw-material.entity';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { ListSuppliersDto } from './dto/list-suppliers.dto';

@Injectable()
export class SuppliersService {
  private readonly logger = new Logger(SuppliersService.name);

  constructor(
    @InjectRepository(Supplier)
    private readonly supplierRepo: Repository<Supplier>,
    @InjectRepository(RawMaterial)
    private readonly rawMaterialRepo: Repository<RawMaterial>,
  ) {}

  async create(dto: CreateSupplierDto, tenantId: string, userId: string) {
    const supplier = this.supplierRepo.create({ ...dto, tenantId, createdBy: userId, updatedBy: userId });
    await this.supplierRepo.save(supplier);
    this.logger.log(`Supplier created: ${supplier.id} for tenant ${tenantId}`);
    return { data: supplier };
  }

  async findAll(query: ListSuppliersDto, tenantId: string) {
    const { page, limit, search } = query;
    const skip = (page - 1) * limit;

    const where: object[] = search
      ? [
          { tenantId, deletedAt: IsNull(), name: ILike(`%${search}%`) },
          { tenantId, deletedAt: IsNull(), contactPerson: ILike(`%${search}%`) },
          { tenantId, deletedAt: IsNull(), city: ILike(`%${search}%`) },
        ]
      : [{ tenantId, deletedAt: IsNull() }];

    const [data, total] = await this.supplierRepo.findAndCount({
      where,
      skip,
      take: limit,
      order: { name: 'ASC' },
    });

    return { data, pagination: { total, page, limit } };
  }

  async findOne(id: string, tenantId: string) {
    const supplier = await this.supplierRepo.findOne({
      where: { id, tenantId, deletedAt: IsNull() },
    });
    if (!supplier) throw new NotFoundException('errors.supplier_not_found');

    const rawMaterials = await this.rawMaterialRepo.find({
      where: { supplierId: id, tenantId, deletedAt: IsNull() },
      order: { name: 'ASC' },
    });

    return { data: { ...supplier, rawMaterials } };
  }

  async update(id: string, dto: UpdateSupplierDto, tenantId: string, userId: string) {
    const supplier = await this.supplierRepo.findOne({
      where: { id, tenantId, deletedAt: IsNull() },
    });
    if (!supplier) throw new NotFoundException('errors.supplier_not_found');

    Object.assign(supplier, dto, { updatedBy: userId });
    await this.supplierRepo.save(supplier);
    return { data: supplier };
  }

  async remove(id: string, tenantId: string) {
    const supplier = await this.supplierRepo.findOne({
      where: { id, tenantId, deletedAt: IsNull() },
    });
    if (!supplier) throw new NotFoundException('errors.supplier_not_found');

    // Check for linked purchase orders (FK guard)
    const linkedPOs = await this.supplierRepo.manager.query(
      `SELECT 1 FROM purchase_orders WHERE "supplierId" = $1 AND "deletedAt" IS NULL LIMIT 1`,
      [id],
    );
    if (linkedPOs.length > 0) {
      throw new UnprocessableEntityException('errors.supplier_has_purchase_orders');
    }

    await this.supplierRepo.softDelete(id);
  }
}
