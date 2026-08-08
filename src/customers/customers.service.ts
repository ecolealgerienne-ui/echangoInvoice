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

    const [deliveryNotes, invoices, quotes, payments, chiffres, grille] = await Promise.all([
      this.dataSource.query(
        `SELECT id, "blNumber", "deliveryDate", total AS "totalAmount", status
         FROM delivery_notes
         WHERE "customerId" = $1 AND "tenantId" = $2 AND "deletedAt" IS NULL
         ORDER BY "deliveryDate" DESC LIMIT 10`,
        [id, tenantId],
      ),
      this.dataSource.query(
        `SELECT id, "invoiceNumber", "invoiceDate", "dueDate", "totalAmount",
                "amountPaid", "creditedAmount", "amountDue", status
         FROM sales_invoices
         WHERE "customerId" = $1 AND "tenantId" = $2 AND "deletedAt" IS NULL
         ORDER BY "invoiceDate" DESC LIMIT 10`,
        [id, tenantId],
      ),
      this.dataSource.query(
        `SELECT id, "quoteNumber", "quoteDate", "totalAmount", status
         FROM quotes
         WHERE "customerId" = $1 AND "tenantId" = $2 AND "deletedAt" IS NULL
         ORDER BY "quoteDate" DESC LIMIT 10`,
        [id, tenantId],
      ),
      this.dataSource.query(
        `SELECT p.id, p."paymentDate", p.amount, p."paymentMethod", p.reference,
                f."invoiceNumber", f.id AS "invoiceId"
         FROM payments p
         JOIN sales_invoices f ON f.id = p."salesInvoiceId"
         WHERE f."customerId" = $1 AND p."tenantId" = $2 AND p."deletedAt" IS NULL
         ORDER BY p."paymentDate" DESC LIMIT 10`,
        [id, tenantId],
      ),
      // Brouillons et annulées sont exclus de tous les totaux. Une facture en
      // brouillon n'a pas été émise : elle ne représente ni un chiffre
      // d'affaires ni une créance, et la compter gonflerait l'encours d'un
      // montant que le client ne doit pas — au point de faire relancer
      // quelqu'un qui n'a jamais rien reçu.
      //
      // « En retard » se calcule sur la date d'échéance, pas sur le statut :
      // le statut `overdue` est posé par une tâche planifiée, et une facture
      // échue depuis ce matin ne l'a pas encore reçu.
      this.dataSource.query(
        `SELECT COALESCE(SUM("totalAmount"), 0) AS "chiffreAffaires",
                COALESCE(SUM("amountPaid"), 0)  AS "encaisse",
                COALESCE(SUM("creditedAmount"), 0) AS "avoirs",
                COALESCE(SUM("amountDue"), 0)   AS "encours",
                COALESCE(SUM("amountDue") FILTER (
                  WHERE "dueDate" < CURRENT_DATE AND "amountDue" > 0
                ), 0) AS "enRetard",
                COUNT(*) AS "nbFactures"
         FROM sales_invoices
         WHERE "customerId" = $1 AND "tenantId" = $2
           AND "deletedAt" IS NULL AND status NOT IN ('draft', 'cancelled')`,
        [id, tenantId],
      ),
      this.dataSource.query(
        `SELECT g.name FROM price_lists g
         JOIN partners c ON c."priceListId" = g.id
         WHERE c.id = $1 AND c."tenantId" = $2`,
        [id, tenantId],
      ),
    ]);

    const c = chiffres[0] ?? {};

    // Object.assign plutôt qu'un spread : `{...customer}` produirait un objet
    // plain et désactiverait silencieusement les @Exclude() d'un futur
    // ClassSerializerInterceptor (R027). L'instance de classe est conservée.
    return {
      data: Object.assign(customer, {
        priceListName: grille[0]?.name ?? null,
        stats: {
          chiffreAffaires: parseFloat(c.chiffreAffaires ?? '0'),
          encaisse: parseFloat(c.encaisse ?? '0'),
          avoirs: parseFloat(c.avoirs ?? '0'),
          encours: parseFloat(c.encours ?? '0'),
          enRetard: parseFloat(c.enRetard ?? '0'),
          nbFactures: parseInt(c.nbFactures ?? '0', 10),
        },
        history: { invoices, deliveryNotes, quotes, payments },
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
