import {
  Injectable, NotFoundException, UnprocessableEntityException, Logger,
} from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, IsNull, ILike, FindOptionsWhere, DataSource } from 'typeorm';
import { Customer } from './customer.entity';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { ListCustomersDto } from './dto/list-customers.dto';

@Injectable()
export class CustomersService {
  private readonly logger = new Logger(CustomersService.name);

  constructor(
    @InjectRepository(Customer)
    private readonly repo: Repository<Customer>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreateCustomerDto, tenantId: string, userId: string) {
    const customer = this.repo.create({
      ...dto,
      tenantId,
      isActive: dto.isActive ?? true,
      createdBy: userId,
      updatedBy: userId,
    });
    await this.repo.save(customer);
    this.logger.log(`Customer created: ${customer.id} for tenant ${tenantId}`);
    return { data: customer };
  }

  async findAll(query: ListCustomersDto, tenantId: string) {
    const { page, limit, search, isActive } = query;
    const skip = (page - 1) * limit;

    const base: FindOptionsWhere<Customer> = { tenantId, deletedAt: IsNull() };
    if (isActive !== undefined) base.isActive = isActive;

    const where: FindOptionsWhere<Customer>[] = search
      ? [
          { ...base, name: ILike(`%${search}%`) },
          { ...base, contactPerson: ILike(`%${search}%`) },
          { ...base, email: ILike(`%${search}%`) },
          { ...base, phone: ILike(`%${search}%`) },
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
    const customer = await this.repo.findOne({
      where: { id, tenantId, deletedAt: IsNull() },
    });
    if (!customer) throw new NotFoundException('errors.customer_not_found');

    // History: last 5 delivery notes, last 5 invoices, total revenue
    const [deliveryNotes, invoices, revenueResult] = await Promise.all([
      this.dataSource.query(
        `SELECT id, "blNumber", "deliveryDate", "totalAmount", status
         FROM delivery_notes
         WHERE "customerId" = $1 AND "tenantId" = $2 AND "deletedAt" IS NULL
         ORDER BY "deliveryDate" DESC LIMIT 5`,
        [id, tenantId],
      ),
      this.dataSource.query(
        `SELECT id, "invoiceNumber", "invoiceDate", "totalAmount", status
         FROM sales_invoices
         WHERE "customerId" = $1 AND "tenantId" = $2 AND "deletedAt" IS NULL
         ORDER BY "invoiceDate" DESC LIMIT 5`,
        [id, tenantId],
      ),
      this.dataSource.query(
        `SELECT COALESCE(SUM("totalAmount"), 0) AS "totalRevenue",
                COUNT(*) AS "totalOrders"
         FROM sales_invoices
         WHERE "customerId" = $1 AND "tenantId" = $2
           AND status = 'paid' AND "deletedAt" IS NULL`,
        [id, tenantId],
      ),
    ]);

    return {
      data: {
        ...customer,
        history: {
          deliveryNotes,
          invoices,
          totalRevenue: parseFloat(revenueResult[0]?.totalRevenue ?? '0'),
          totalOrders: parseInt(revenueResult[0]?.totalOrders ?? '0', 10),
        },
      },
    };
  }

  async update(id: string, dto: UpdateCustomerDto, tenantId: string, userId: string) {
    const customer = await this.repo.findOne({
      where: { id, tenantId, deletedAt: IsNull() },
    });
    if (!customer) throw new NotFoundException('errors.customer_not_found');
    Object.assign(customer, dto, { updatedBy: userId });
    await this.repo.save(customer);
    return { data: customer };
  }

  async remove(id: string, tenantId: string) {
    const customer = await this.repo.findOne({
      where: { id, tenantId, deletedAt: IsNull() },
    });
    if (!customer) throw new NotFoundException('errors.customer_not_found');

    const linked = await this.dataSource.query(
      `SELECT 1 FROM delivery_notes WHERE "customerId" = $1 AND "deletedAt" IS NULL LIMIT 1`,
      [id],
    );
    if (linked.length > 0) {
      throw new UnprocessableEntityException('errors.customer_has_linked_documents');
    }

    await this.repo.softDelete(id);
  }
}
