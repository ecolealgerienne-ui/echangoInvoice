import {
  ConflictException, Injectable, NotFoundException, UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { ProductBarcode } from './product-barcode.entity';
import { FinishedProduct } from './finished-product.entity';
import { CreateBarcodeDto } from './dto/create-barcode.dto';
import { deviserType, normaliserCodeBarres, verifierCodeBarres } from '../common/code-barres';

@Injectable()
export class BarcodesService {
  constructor(
    @InjectRepository(ProductBarcode) private readonly repo: Repository<ProductBarcode>,
    @InjectRepository(FinishedProduct) private readonly produits: Repository<FinishedProduct>,
  ) {}

  async lister(finishedProductId: string, tenantId: string) {
    await this.produitExiste(finishedProductId, tenantId);
    const data = await this.repo.find({
      where: { finishedProductId, tenantId, deletedAt: IsNull() },
      order: { isPrimary: 'DESC', createdAt: 'ASC' },
    });
    return { data };
  }

  async creer(finishedProductId: string, dto: CreateBarcodeDto, tenantId: string, userId: string) {
    await this.produitExiste(finishedProductId, tenantId);

    const barcode = normaliserCodeBarres(dto.barcode);
    // Type déduit quand il n'est pas fourni : un EAN-13 valide se reconnaît
    // seul, et le demander à l'utilisateur est une occasion de se tromper.
    const type = dto.type ?? deviserType(barcode);

    const verdict = verifierCodeBarres(barcode, type);
    if (!verdict.valide) throw new UnprocessableEntityException(verdict.raison);

    // L'unicité est en base (UQ par locataire) ; ce contrôle sert à rendre un
    // message utile plutôt qu'un 409 générique — et à nommer l'article qui
    // détient déjà le code, car c'est la question que pose l'utilisateur.
    const existant = await this.repo.findOne({
      where: { barcode, tenantId, deletedAt: IsNull() },
    });
    if (existant) {
      const proprietaire = await this.produits.findOne({
        where: { id: existant.finishedProductId, tenantId },
      });
      throw new ConflictException({
        message: 'errors.barcode_already_used',
        field: 'barcode',
        details: { product: proprietaire?.name ?? null },
      });
    }

    if (dto.isPrimary) await this.retirerPrincipal(finishedProductId, tenantId);

    const code = this.repo.create({
      tenantId, finishedProductId, barcode, type,
      packQuantity: dto.packQuantity ?? 1,
      isPrimary: dto.isPrimary ?? false,
      label: dto.label ?? null,
      createdBy: userId, updatedBy: userId,
    });
    await this.repo.save(code);
    return { data: code };
  }

  async supprimer(id: string, tenantId: string) {
    const code = await this.repo.findOne({ where: { id, tenantId, deletedAt: IsNull() } });
    if (!code) throw new NotFoundException('errors.barcode_not_found');
    await this.repo.softRemove(code);
    return { data: { id } };
  }

  /**
   * Résolution d'un scan.
   *
   * Correspondance **exacte**, jamais un `ILIKE` : un scan doit rendre une
   * réponse, pas une liste. Le `packQuantity` accompagne le résultat parce que
   * c'est lui qui décide de la quantité à porter sur la ligne.
   */
  async parCodeBarres(code: string, tenantId: string) {
    const barcode = normaliserCodeBarres(code);

    const trouve = await this.repo.findOne({
      where: { barcode, tenantId, deletedAt: IsNull() },
    });

    // Repli sur la référence interne de l'article : beaucoup de catalogues
    // n'ont pas encore de codes-barres, et `code` y sert déjà d'identifiant.
    const produit = trouve
      ? await this.produits.findOne({ where: { id: trouve.finishedProductId, tenantId, deletedAt: IsNull() } })
      : await this.produits.findOne({ where: { code: barcode, tenantId, deletedAt: IsNull() } });

    if (!produit) throw new NotFoundException('errors.barcode_unknown');

    return {
      data: {
        product: produit,
        barcode: trouve?.barcode ?? produit.code,
        packQuantity: Number(trouve?.packQuantity ?? 1),
        // Dit à l'appelant d'où vient la correspondance : l'écran de saisie
        // peut proposer d'enregistrer un vrai code-barres sur l'article.
        source: trouve ? 'barcode' : 'productCode',
      },
    };
  }

  private async retirerPrincipal(finishedProductId: string, tenantId: string) {
    await this.repo.update(
      { finishedProductId, tenantId, isPrimary: true, deletedAt: IsNull() },
      { isPrimary: false },
    );
  }

  private async produitExiste(id: string, tenantId: string) {
    const p = await this.produits.findOne({ where: { id, tenantId, deletedAt: IsNull() } });
    if (!p) throw new NotFoundException('errors.product_not_found');
    return p;
  }
}
