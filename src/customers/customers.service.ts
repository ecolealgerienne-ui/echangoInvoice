import {
  Injectable, NotFoundException, UnprocessableEntityException, Logger,
} from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, IsNull, ILike, FindOptionsWhere, DataSource } from 'typeorm';
import { Partner } from '../partners/partner.entity';
import { PartnerContact } from '../partners/entities/partner-contact.entity';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { ListCustomersDto } from './dto/list-customers.dto';
import { CreateCustomerContactDto } from './dto/create-customer-contact.dto';

@Injectable()
export class CustomersService {
  private readonly logger = new Logger(CustomersService.name);

  constructor(
    @InjectRepository(Partner)
    private readonly repo: Repository<Partner>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreateCustomerDto, tenantId: string, userId: string) {
    const customer = this.repo.create({
      ...dto,
      tenantId,
      isCustomer: dto.isCustomer ?? true,
      isSupplier: dto.isSupplier ?? false,
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

    const base: FindOptionsWhere<Partner> = { tenantId, isCustomer: true, deletedAt: IsNull() };
    if (isActive !== undefined) base.isActive = isActive;

    const where: FindOptionsWhere<Partner>[] = search
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
      where: { id, tenantId, isCustomer: true, deletedAt: IsNull() },
    });
    if (!customer) throw new NotFoundException('errors.customer_not_found');

    const [deliveryNotes, invoices, revenueResult] = await Promise.all([
      this.dataSource.query(
        `SELECT id, "blNumber", "deliveryDate", total AS "totalAmount", status
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

    // Object.assign plutôt qu'un spread : `{...customer}` produirait un objet
    // plain et désactiverait silencieusement les @Exclude() d'un futur
    // ClassSerializerInterceptor (R027). L'instance de classe est conservée.
    return {
      data: Object.assign(customer, {
        history: {
          deliveryNotes,
          invoices,
          totalRevenue: parseFloat(revenueResult[0]?.totalRevenue ?? '0'),
          totalOrders: parseInt(revenueResult[0]?.totalOrders ?? '0', 10),
        },
      }),
    };
  }

  async update(id: string, dto: UpdateCustomerDto, tenantId: string, userId: string) {
    const customer = await this.repo.findOne({
      where: { id, tenantId, isCustomer: true, deletedAt: IsNull() },
    });
    if (!customer) throw new NotFoundException('errors.customer_not_found');
    Object.assign(customer, dto, { updatedBy: userId });
    await this.repo.save(customer);
    return { data: customer };
  }

  async remove(id: string, tenantId: string) {
    const customer = await this.repo.findOne({
      where: { id, tenantId, isCustomer: true, deletedAt: IsNull() },
    });
    if (!customer) throw new NotFoundException('errors.customer_not_found');

    const linked = await this.dataSource.query(
      `SELECT 1 FROM delivery_notes WHERE "customerId" = $1 AND "tenantId" = $2 AND "deletedAt" IS NULL LIMIT 1`,
      [id, tenantId],
    );
    if (linked.length > 0) {
      throw new UnprocessableEntityException('errors.customer_has_linked_documents');
    }

    await this.repo.softDelete(id);
  }

  // ─── Contacts ─────────────────────────────────────────────────────────────

  async listContacts(customerId: string, tenantId: string) {
    await this.findOne(customerId, tenantId);
    const contacts = await this.dataSource.manager.find(PartnerContact, {
      where: { partnerId: customerId, tenantId, deletedAt: IsNull() },
      order: { isPrimary: 'DESC', createdAt: 'ASC' },
    });
    return { data: contacts };
  }

  async createContact(customerId: string, dto: CreateCustomerContactDto, tenantId: string, userId: string) {
    await this.findOne(customerId, tenantId);

    if (dto.isPrimary) {
      await this.dataSource.query(
        `UPDATE partner_contacts SET "isPrimary" = false WHERE "partnerId" = $1 AND "tenantId" = $2 AND "deletedAt" IS NULL`,
        [customerId, tenantId],
      );
    }

    const contact = this.dataSource.manager.create(PartnerContact, {
      ...dto,
      partnerId: customerId,
      tenantId,
      isPrimary: dto.isPrimary ?? false,
      createdBy: userId,
      updatedBy: userId,
    });
    await this.dataSource.manager.save(PartnerContact, contact);
    return { data: contact };
  }

  async updateContact(contactId: string, customerId: string, dto: CreateCustomerContactDto, tenantId: string, userId: string) {
    const contact = await this.dataSource.manager.findOne(PartnerContact, {
      where: { id: contactId, partnerId: customerId, tenantId, deletedAt: IsNull() },
    });
    if (!contact) throw new NotFoundException('errors.contact_not_found');

    if (dto.isPrimary && !contact.isPrimary) {
      await this.dataSource.query(
        `UPDATE partner_contacts SET "isPrimary" = false WHERE "partnerId" = $1 AND "tenantId" = $2 AND "deletedAt" IS NULL`,
        [customerId, tenantId],
      );
    }

    Object.assign(contact, { ...dto, updatedBy: userId });
    await this.dataSource.manager.save(PartnerContact, contact);
    return { data: contact };
  }

  async removeContact(contactId: string, customerId: string, tenantId: string) {
    const contact = await this.dataSource.manager.findOne(PartnerContact, {
      where: { id: contactId, partnerId: customerId, tenantId, deletedAt: IsNull() },
    });
    if (!contact) throw new NotFoundException('errors.contact_not_found');
    await this.dataSource.manager.softDelete(PartnerContact, contactId);
  }
}
