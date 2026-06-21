import {
  Injectable, NotFoundException, UnprocessableEntityException, Logger,
} from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, IsNull, ILike, DataSource } from 'typeorm';
import { Contact } from '../contacts/contact.entity';
import { ContactContact } from '../contacts/entities/contact-contact.entity';
import { RawMaterial } from '../raw-materials/raw-material.entity';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { ListSuppliersDto } from './dto/list-suppliers.dto';
import { CreateCustomerContactDto } from '../customers/dto/create-customer-contact.dto';

@Injectable()
export class SuppliersService {
  private readonly logger = new Logger(SuppliersService.name);

  constructor(
    @InjectRepository(Contact)
    private readonly supplierRepo: Repository<Contact>,
    @InjectRepository(RawMaterial)
    private readonly rawMaterialRepo: Repository<RawMaterial>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreateSupplierDto, tenantId: string, userId: string) {
    const supplier = this.supplierRepo.create({
      ...dto,
      tenantId,
      isSupplier: true,
      createdBy: userId,
      updatedBy: userId,
    });
    await this.supplierRepo.save(supplier);
    this.logger.log(`Supplier created: ${supplier.id} for tenant ${tenantId}`);
    return { data: supplier };
  }

  async findAll(query: ListSuppliersDto, tenantId: string) {
    const { page, limit, search } = query;
    const skip = (page - 1) * limit;

    const base = { tenantId, isSupplier: true, deletedAt: IsNull() };

    const where = search
      ? [
          { ...base, name: ILike(`%${search}%`) },
          { ...base, contactPerson: ILike(`%${search}%`) },
          { ...base, city: ILike(`%${search}%`) },
        ]
      : [base];

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
      where: { id, tenantId, isSupplier: true, deletedAt: IsNull() },
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
      where: { id, tenantId, isSupplier: true, deletedAt: IsNull() },
    });
    if (!supplier) throw new NotFoundException('errors.supplier_not_found');

    Object.assign(supplier, dto, { updatedBy: userId });
    await this.supplierRepo.save(supplier);
    return { data: supplier };
  }

  async remove(id: string, tenantId: string) {
    const supplier = await this.supplierRepo.findOne({
      where: { id, tenantId, isSupplier: true, deletedAt: IsNull() },
    });
    if (!supplier) throw new NotFoundException('errors.supplier_not_found');

    const linkedPOs = await this.supplierRepo.manager.query(
      `SELECT 1 FROM purchase_orders WHERE "supplierId" = $1 AND "deletedAt" IS NULL LIMIT 1`,
      [id],
    );
    if (linkedPOs.length > 0) {
      throw new UnprocessableEntityException('errors.supplier_has_purchase_orders');
    }

    await this.supplierRepo.softDelete(id);
  }

  // ─── Contacts ─────────────────────────────────────────────────────────────

  async listContacts(supplierId: string, tenantId: string) {
    await this.findOne(supplierId, tenantId);
    const contacts = await this.dataSource.manager.find(ContactContact, {
      where: { contactId: supplierId, tenantId, deletedAt: IsNull() },
      order: { isPrimary: 'DESC', createdAt: 'ASC' },
    });
    return { data: contacts };
  }

  async createContact(supplierId: string, dto: CreateCustomerContactDto, tenantId: string, userId: string) {
    await this.findOne(supplierId, tenantId);

    if (dto.isPrimary) {
      await this.dataSource.query(
        `UPDATE contact_contacts SET "isPrimary" = false WHERE "contactId" = $1 AND "tenantId" = $2 AND "deletedAt" IS NULL`,
        [supplierId, tenantId],
      );
    }

    const contact = this.dataSource.manager.create(ContactContact, {
      ...dto,
      contactId: supplierId,
      tenantId,
      isPrimary: dto.isPrimary ?? false,
      createdBy: userId,
      updatedBy: userId,
    });
    await this.dataSource.manager.save(ContactContact, contact);
    return { data: contact };
  }

  async updateContact(contactId: string, supplierId: string, dto: CreateCustomerContactDto, tenantId: string, userId: string) {
    const contact = await this.dataSource.manager.findOne(ContactContact, {
      where: { id: contactId, contactId: supplierId, tenantId, deletedAt: IsNull() },
    });
    if (!contact) throw new NotFoundException('errors.contact_not_found');

    if (dto.isPrimary && !contact.isPrimary) {
      await this.dataSource.query(
        `UPDATE contact_contacts SET "isPrimary" = false WHERE "contactId" = $1 AND "tenantId" = $2 AND "deletedAt" IS NULL`,
        [supplierId, tenantId],
      );
    }

    Object.assign(contact, { ...dto, updatedBy: userId });
    await this.dataSource.manager.save(ContactContact, contact);
    return { data: contact };
  }

  async removeContact(contactId: string, supplierId: string, tenantId: string) {
    const contact = await this.dataSource.manager.findOne(ContactContact, {
      where: { id: contactId, contactId: supplierId, tenantId, deletedAt: IsNull() },
    });
    if (!contact) throw new NotFoundException('errors.contact_not_found');
    await this.dataSource.manager.softDelete(ContactContact, contactId);
  }
}
