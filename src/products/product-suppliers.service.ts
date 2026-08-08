import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { ProductSupplier } from './product-supplier.entity';
import { FinishedProduct } from './finished-product.entity';
import { CreateProductSupplierDto } from './dto/create-product-supplier.dto';

@Injectable()
export class ProductSuppliersService {
  constructor(
    @InjectRepository(ProductSupplier) private readonly repo: Repository<ProductSupplier>,
    @InjectRepository(FinishedProduct) private readonly produits: Repository<FinishedProduct>,
    @InjectDataSource() private readonly ds: DataSource,
  ) {}

  /**
   * Fournisseurs d'un article, le préféré d'abord puis du moins cher au plus
   * cher — c'est l'ordre dans lequel on lit une comparaison d'offres.
   */
  async lister(finishedProductId: string, tenantId: string) {
    await this.produitExiste(finishedProductId, tenantId);
    const data = await this.ds.query(
      `SELECT ps.*, f.name AS "supplierName", f.phone AS "supplierPhone"
       FROM product_suppliers ps
       JOIN partners f ON f.id = ps."supplierId"
       WHERE ps."finishedProductId" = $1 AND ps."tenantId" = $2 AND ps."deletedAt" IS NULL
       ORDER BY ps."isPreferred" DESC, ps."purchasePrice" ASC`,
      [finishedProductId, tenantId],
    );
    return { data };
  }

  async ajouter(
    finishedProductId: string, dto: CreateProductSupplierDto, tenantId: string, userId: string,
  ) {
    await this.produitExiste(finishedProductId, tenantId);

    const fournisseur = await this.ds.query(
      `SELECT id FROM partners
       WHERE id = $1 AND "tenantId" = $2 AND "isSupplier" = true AND "deletedAt" IS NULL`,
      [dto.supplierId, tenantId],
    );
    if (!fournisseur.length) throw new NotFoundException('errors.supplier_not_found');

    const deja = await this.repo.findOne({
      where: { finishedProductId, supplierId: dto.supplierId, tenantId, deletedAt: IsNull() },
    });
    if (deja) throw new ConflictException('errors.product_supplier_exists');

    // Un seul fournisseur préféré par article : c'est celui que proposera le
    // réapprovisionnement, deux le rendraient indécidable.
    if (dto.isPreferred) await this.retirerPrefere(finishedProductId, tenantId);

    const lien = this.repo.create({
      tenantId, finishedProductId,
      supplierId: dto.supplierId,
      supplierRef: dto.supplierRef ?? null,
      purchasePrice: dto.purchasePrice ?? 0,
      leadTimeDays: dto.leadTimeDays ?? null,
      packQuantity: dto.packQuantity ?? 1,
      isPreferred: dto.isPreferred ?? false,
      notes: dto.notes ?? null,
      createdBy: userId, updatedBy: userId,
    });
    await this.repo.save(lien);
    return { data: lien };
  }

  async retirer(id: string, tenantId: string) {
    const lien = await this.repo.findOne({ where: { id, tenantId, deletedAt: IsNull() } });
    if (!lien) throw new NotFoundException('errors.product_supplier_not_found');
    await this.repo.softRemove(lien);
    return { data: { id } };
  }

  private async retirerPrefere(finishedProductId: string, tenantId: string) {
    await this.repo.update(
      { finishedProductId, tenantId, isPreferred: true, deletedAt: IsNull() },
      { isPreferred: false },
    );
  }

  private async produitExiste(id: string, tenantId: string) {
    const p = await this.produits.findOne({ where: { id, tenantId, deletedAt: IsNull() } });
    if (!p) throw new NotFoundException('errors.product_not_found');
  }
}
