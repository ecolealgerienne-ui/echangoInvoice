import {
  Injectable, NotFoundException, UnprocessableEntityException, Logger,
} from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, IsNull, ILike, FindOptionsWhere, DataSource } from 'typeorm';
import { FinishedProduct } from './finished-product.entity';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ListProductsDto } from './dto/list-products.dto';

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(
    @InjectRepository(FinishedProduct)
    private readonly repo: Repository<FinishedProduct>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreateProductDto, tenantId: string, userId: string) {
    const product = this.repo.create({
      ...dto,
      tenantId,
      isActive: dto.isActive ?? true,
      createdBy: userId,
      updatedBy: userId,
    });
    await this.repo.save(product);
    this.logger.log(`FinishedProduct created: ${product.id} for tenant ${tenantId}`);
    return { data: product };
  }

  async findAll(query: ListProductsDto, tenantId: string) {
    const { page, limit, search, isActive } = query;
    const skip = (page - 1) * limit;

    const base: FindOptionsWhere<FinishedProduct> = { tenantId, deletedAt: IsNull() };
    if (isActive !== undefined) base.isActive = isActive;

    const where: FindOptionsWhere<FinishedProduct>[] = search
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
    const product = await this.repo.findOne({
      where: { id, tenantId, deletedAt: IsNull() },
    });
    if (!product) throw new NotFoundException('errors.product_not_found');
    return { data: product };
  }

  async update(id: string, dto: UpdateProductDto, tenantId: string, userId: string) {
    const product = await this.repo.findOne({
      where: { id, tenantId, deletedAt: IsNull() },
    });
    if (!product) throw new NotFoundException('errors.product_not_found');
    Object.assign(product, dto, { updatedBy: userId });
    await this.repo.save(product);
    return { data: product };
  }

  async remove(id: string, tenantId: string) {
    const product = await this.repo.findOne({
      where: { id, tenantId, deletedAt: IsNull() },
    });
    if (!product) throw new NotFoundException('errors.product_not_found');

    // Cannot delete if used in active delivery notes or invoices
    const [inBL, inInvoice] = await Promise.all([
      this.dataSource.query(
        `SELECT 1 FROM delivery_note_items dni
         JOIN delivery_notes dn ON dn.id = dni."deliveryNoteId"
         WHERE dni."finishedProductId" = $1 AND dn."deletedAt" IS NULL LIMIT 1`,
        [id],
      ),
      this.dataSource.query(
        `SELECT 1 FROM sales_invoice_items sii
         JOIN sales_invoices si ON si.id = sii."salesInvoiceId"
         WHERE sii."finishedProductId" = $1 AND si."deletedAt" IS NULL LIMIT 1`,
        [id],
      ),
    ]);

    if (inBL.length > 0 || inInvoice.length > 0) {
      throw new UnprocessableEntityException('errors.product_in_use');
    }

    await this.repo.softDelete(id);
  }
}
