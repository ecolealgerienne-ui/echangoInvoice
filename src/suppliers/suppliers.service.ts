import {
  Injectable, NotFoundException, UnprocessableEntityException, Logger,
} from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, IsNull, ILike, DataSource } from 'typeorm';
import { Partner } from '../partners/partner.entity';
import { PartnerContact } from '../partners/entities/partner-contact.entity';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { ListSuppliersDto } from './dto/list-suppliers.dto';
import { CreateCustomerContactDto } from '../customers/dto/create-customer-contact.dto';
import { resoudreTri } from '../common/tri';

/** Colonnes que le client peut demander en tri — voir common/tri.ts (R029). */
const COLONNES_TRIABLES = ['name', 'city', 'phone', 'email', 'createdAt'] as const;

@Injectable()
export class SuppliersService {
  private readonly logger = new Logger(SuppliersService.name);

  constructor(
    @InjectRepository(Partner)
    private readonly supplierRepo: Repository<Partner>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreateSupplierDto, tenantId: string, userId: string) {
    const supplier = this.supplierRepo.create({
      ...dto,
      tenantId,
      isCustomer: dto.isCustomer ?? false,
      isSupplier: dto.isSupplier ?? true,
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
      order: resoudreTri(COLONNES_TRIABLES, { colonne: 'name', sens: 'ASC' }, query),
    });

    return { data, pagination: { total, page, limit } };
  }

  /**
   * Fiche fournisseur : le miroir de la fiche client, côté achats. Ce qu'on y
   * cherche, c'est la dette — ce qu'on doit encore, et depuis quand.
   */
  async findOne(id: string, tenantId: string) {
    const supplier = await this.supplierRepo.findOne({
      where: { id, tenantId, isSupplier: true, deletedAt: IsNull() },
    });
    if (!supplier) throw new NotFoundException('errors.supplier_not_found');

    const [bills, orders, receptions, payments, chiffres] = await Promise.all([
      this.dataSource.query(
        `SELECT id, "billNumber", "billDate", "dueDate", "totalAmount",
                "amountPaid", "amountDue", status
         FROM vendor_bills
         WHERE "supplierId" = $1 AND "tenantId" = $2 AND "deletedAt" IS NULL
         ORDER BY "billDate" DESC LIMIT 10`,
        [id, tenantId],
      ),
      this.dataSource.query(
        `SELECT id, "poNumber", "orderDate", total AS "totalAmount", status
         FROM purchase_orders
         WHERE "supplierId" = $1 AND "tenantId" = $2 AND "deletedAt" IS NULL
         ORDER BY "orderDate" DESC LIMIT 10`,
        [id, tenantId],
      ),
      this.dataSource.query(
        `SELECT r.id, r."blNumber", r."receptionDate", r.status,
                r."totalQuantityReceived", bc."poNumber"
         FROM reception_bls r
         JOIN purchase_orders bc ON bc.id = r."purchaseOrderId"
         WHERE bc."supplierId" = $1 AND r."tenantId" = $2 AND r."deletedAt" IS NULL
         ORDER BY r."receptionDate" DESC LIMIT 10`,
        [id, tenantId],
      ),
      this.dataSource.query(
        `SELECT p.id, p."paymentDate", p.amount, p.method, p.reference,
                fa."billNumber"
         FROM vendor_payments p
         JOIN vendor_bills fa ON fa.id = p."vendorBillId"
         WHERE fa."supplierId" = $1 AND p."tenantId" = $2
         ORDER BY p."paymentDate" DESC LIMIT 10`,
        [id, tenantId],
      ),
      // Mêmes règles que côté client : brouillons et annulées hors total,
      // et le retard se juge sur l'échéance, pas sur le statut.
      this.dataSource.query(
        `SELECT COALESCE(SUM("totalAmount"), 0) AS "totalAchete",
                COALESCE(SUM("amountPaid"), 0)  AS "regle",
                COALESCE(SUM("amountDue"), 0)   AS "dette",
                COALESCE(SUM("amountDue") FILTER (
                  WHERE "dueDate" < CURRENT_DATE AND "amountDue" > 0
                ), 0) AS "enRetard",
                COUNT(*) AS "nbFactures"
         FROM vendor_bills
         WHERE "supplierId" = $1 AND "tenantId" = $2
           AND "deletedAt" IS NULL AND status NOT IN ('draft', 'cancelled')`,
        [id, tenantId],
      ),
    ]);

    const c = chiffres[0] ?? {};

    return {
      data: Object.assign(supplier, {
        stats: {
          totalAchete: parseFloat(c.totalAchete ?? '0'),
          regle: parseFloat(c.regle ?? '0'),
          dette: parseFloat(c.dette ?? '0'),
          enRetard: parseFloat(c.enRetard ?? '0'),
          nbFactures: parseInt(c.nbFactures ?? '0', 10),
        },
        history: { bills, orders, receptions, payments },
      }),
    };
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
      `SELECT 1 FROM purchase_orders WHERE "supplierId" = $1 AND "tenantId" = $2 AND "deletedAt" IS NULL LIMIT 1`,
      [id, tenantId],
    );
    if (linkedPOs.length > 0) {
      throw new UnprocessableEntityException('errors.supplier_has_purchase_orders');
    }

    await this.supplierRepo.softDelete(id);
  }

  // ─── Contacts ─────────────────────────────────────────────────────────────

  async listContacts(supplierId: string, tenantId: string) {
    await this.findOne(supplierId, tenantId);
    const contacts = await this.dataSource.manager.find(PartnerContact, {
      where: { partnerId: supplierId, tenantId, deletedAt: IsNull() },
      order: { isPrimary: 'DESC', createdAt: 'ASC' },
    });
    return { data: contacts };
  }

  async createContact(supplierId: string, dto: CreateCustomerContactDto, tenantId: string, userId: string) {
    await this.findOne(supplierId, tenantId);

    if (dto.isPrimary) {
      await this.dataSource.query(
        `UPDATE partner_contacts SET "isPrimary" = false WHERE "partnerId" = $1 AND "tenantId" = $2 AND "deletedAt" IS NULL`,
        [supplierId, tenantId],
      );
    }

    const contact = this.dataSource.manager.create(PartnerContact, {
      ...dto,
      partnerId: supplierId,
      tenantId,
      isPrimary: dto.isPrimary ?? false,
      createdBy: userId,
      updatedBy: userId,
    });
    await this.dataSource.manager.save(PartnerContact, contact);
    return { data: contact };
  }

  async updateContact(contactId: string, supplierId: string, dto: CreateCustomerContactDto, tenantId: string, userId: string) {
    const contact = await this.dataSource.manager.findOne(PartnerContact, {
      where: { id: contactId, partnerId: supplierId, tenantId, deletedAt: IsNull() },
    });
    if (!contact) throw new NotFoundException('errors.contact_not_found');

    if (dto.isPrimary && !contact.isPrimary) {
      await this.dataSource.query(
        `UPDATE partner_contacts SET "isPrimary" = false WHERE "partnerId" = $1 AND "tenantId" = $2 AND "deletedAt" IS NULL`,
        [supplierId, tenantId],
      );
    }

    Object.assign(contact, { ...dto, updatedBy: userId });
    await this.dataSource.manager.save(PartnerContact, contact);
    return { data: contact };
  }

  async removeContact(contactId: string, supplierId: string, tenantId: string) {
    const contact = await this.dataSource.manager.findOne(PartnerContact, {
      where: { id: contactId, partnerId: supplierId, tenantId, deletedAt: IsNull() },
    });
    if (!contact) throw new NotFoundException('errors.contact_not_found');
    await this.dataSource.manager.softDelete(PartnerContact, contactId);
  }
}
