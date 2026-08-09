import {
  Injectable, NotFoundException, UnprocessableEntityException, Logger,
} from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, IsNull, ILike, FindOptionsWhere, DataSource } from 'typeorm';
import { FinishedProduct } from './finished-product.entity';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ListProductsDto } from './dto/list-products.dto';
import { resoudreTri } from '../common/tri';

/** Colonnes que le client peut demander en tri — voir common/tri.ts (R029). */
const COLONNES_TRIABLES = ['name', 'code', 'type', 'unit', 'defaultSalesPrice', 'lastCostPerUnit', 'stockQuantity', 'createdAt'] as const;

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
      type: dto.type ?? 'product',
      code: dto.code || null,
      tenantId,
      isActive: dto.isActive ?? true,
      lastCostPerUnit: dto.lastCostPerUnit ?? 0,
      createdBy: userId,
      updatedBy: userId,
    });
    await this.repo.save(product);
    this.logger.log(`Product created: ${product.id} (${product.type}) for tenant ${tenantId}`);
    return { data: product };
  }

  async findAll(query: ListProductsDto, tenantId: string) {
    const { page, limit, search, type, isActive } = query;
    const skip = (page - 1) * limit;

    const base: FindOptionsWhere<FinishedProduct> = { tenantId, deletedAt: IsNull() };
    if (type !== undefined) base.type = type;
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
      order: resoudreTri(COLONNES_TRIABLES, { colonne: 'name', sens: 'ASC' }, query),
    });

    return { data, pagination: { total, page, limit } };
  }

  /**
   * Fiche article. Un catalogue sans historique ne répond à aucune des
   * questions qu'on se pose devant un article : à quel prix je l'achète, à qui
   * je le vends, et est-ce que je gagne de l'argent dessus.
   */
  async findOne(id: string, tenantId: string) {
    const product = await this.repo.findOne({
      where: { id, tenantId, deletedAt: IsNull() },
    });
    if (!product) throw new NotFoundException('errors.product_not_found');

    const [ventes, achats, lots, chiffres] = await Promise.all([
      this.dataSource.query(
        `SELECT si.id, si."invoiceNumber", si."invoiceDate", si.status,
                c.name AS "customerName",
                sii.quantity, sii.unit, sii."unitPrice", sii."lineTotal"
         FROM sales_invoice_items sii
         JOIN sales_invoices si ON si.id = sii."salesInvoiceId"
         JOIN partners c ON c.id = si."customerId"
         WHERE sii."finishedProductId" = $1 AND sii."tenantId" = $2
           AND si."deletedAt" IS NULL AND si.status != 'cancelled'
         ORDER BY si."invoiceDate" DESC LIMIT 10`,
        [id, tenantId],
      ),
      this.dataSource.query(
        `SELECT r.id, r."blNumber", r."receptionDate",
                f.name AS "supplierName",
                poi.quantity, poi."unitPrice"
         FROM purchase_order_items poi
         JOIN purchase_orders po ON po.id = poi."purchaseOrderId"
         JOIN reception_bls r ON r."purchaseOrderId" = po.id
         JOIN partners f ON f.id = po."supplierId"
         WHERE poi."finishedProductId" = $1 AND poi."tenantId" = $2
           AND r."deletedAt" IS NULL
         ORDER BY r."receptionDate" DESC LIMIT 10`,
        [id, tenantId],
      ),
      // Lots encore disponibles, les plus proches de la péremption d'abord :
      // c'est l'ordre dans lequel ils doivent sortir.
      this.dataSource.query(
        `SELECT id, "batchNumber", quantity, "costPerUnit", "enteredAt", "expiresAt"
         FROM stock_entries
         WHERE "rawMaterialId" = $1 AND "tenantId" = $2
           AND status = 'available' AND "deletedAt" IS NULL
         ORDER BY "expiresAt" ASC NULLS LAST, "enteredAt" ASC LIMIT 10`,
        [id, tenantId],
      ),
      this.dataSource.query(
        `SELECT COALESCE(SUM(sii.quantity), 0)    AS "quantiteVendue",
                COALESCE(SUM(sii."lineTotal"), 0) AS "chiffreAffaires"
         FROM sales_invoice_items sii
         JOIN sales_invoices si ON si.id = sii."salesInvoiceId"
         WHERE sii."finishedProductId" = $1 AND sii."tenantId" = $2
           AND si."deletedAt" IS NULL AND si.status != 'cancelled'`,
        [id, tenantId],
      ),
    ]);

    const prixVente = Number(product.defaultSalesPrice ?? 0);
    const coutMoyen = Number(product.averageCostPerUnit ?? 0);

    return {
      data: {
        ...product,
        ventes,
        achats,
        lots,
        stats: {
          quantiteVendue: Number(chiffres[0]?.quantiteVendue ?? 0),
          chiffreAffaires: Number(chiffres[0]?.chiffreAffaires ?? 0),
          valeurStock: Number(product.totalStockValue ?? 0),
          // Marge sur le prix catalogue, pas sur les ventes réelles : une remise
          // consentie ligne à ligne ne doit pas se lire comme une marge.
          margeUnitaire: Math.round((prixVente - coutMoyen) * 100) / 100,
          margePercent: prixVente > 0
            ? Math.round(((prixVente - coutMoyen) / prixVente) * 1000) / 10
            : 0,
        },
      },
    };
  }

  async update(id: string, dto: UpdateProductDto, tenantId: string, userId: string) {
    const product = await this.repo.findOne({
      where: { id, tenantId, deletedAt: IsNull() },
    });
    if (!product) throw new NotFoundException('errors.product_not_found');
    Object.assign(product, { ...dto, code: dto.code || null }, { updatedBy: userId });

    // Recalculate totalStockValue when cost changes
    if (dto.lastCostPerUnit !== undefined) {
      const costPerUnit = Number(dto.lastCostPerUnit);
      const qty = Number(product.stockQuantity ?? 0);
      product.averageCostPerUnit = costPerUnit;
      product.totalStockValue = Math.round(qty * costPerUnit * 100) / 100;
    }

    await this.repo.save(product);
    return { data: product };
  }

  async remove(id: string, tenantId: string) {
    const product = await this.repo.findOne({
      where: { id, tenantId, deletedAt: IsNull() },
    });
    if (!product) throw new NotFoundException('errors.product_not_found');

    const [inBL, inInvoice, inPO] = await Promise.all([
      this.dataSource.query(
        `SELECT 1 FROM delivery_note_items WHERE "finishedProductId" = $1 AND "tenantId" = $2 LIMIT 1`,
        [id, tenantId],
      ),
      this.dataSource.query(
        `SELECT 1 FROM sales_invoice_items WHERE "finishedProductId" = $1 AND "tenantId" = $2 LIMIT 1`,
        [id, tenantId],
      ),
      this.dataSource.query(
        `SELECT 1 FROM purchase_order_items WHERE "rawMaterialId" = $1 AND "tenantId" = $2 LIMIT 1`,
        [id, tenantId],
      ),
    ]);

    if (inBL.length > 0 || inInvoice.length > 0 || inPO.length > 0) {
      throw new UnprocessableEntityException('errors.product_in_use');
    }

    await this.repo.softDelete(id);
  }
}
