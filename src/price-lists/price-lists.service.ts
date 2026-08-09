import {
  ConflictException, Injectable, Logger, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { PriceList } from './entities/price-list.entity';
import { PriceListItem } from './entities/price-list-item.entity';
import { CreatePriceListDto, SetPriceListItemsDto } from './dto/price-list.dto';

/**
 * Grilles tarifaires.
 *
 * Un article n'avait qu'un prix unique, ressaisi à la main dès qu'un client
 * bénéficiait d'un tarif différent. La grille fournit un prix PROPOSÉ par
 * client : la ligne d'un document reste modifiable, un commercial négocie.
 */
@Injectable()
export class PriceListsService {
  private readonly logger = new Logger(PriceListsService.name);

  constructor(
    @InjectRepository(PriceList) private readonly repo: Repository<PriceList>,
    @InjectRepository(PriceListItem) private readonly itemRepo: Repository<PriceListItem>,
    private readonly dataSource: DataSource,
  ) {}

  async findAll(tenantId: string) {
    // Le nombre d'articles tarifés est ce qui distingue une grille remplie
    // d'une grille vide, et c'est la première question qu'on se pose.
    const data = await this.dataSource.query(
      `SELECT pl.*,
              (SELECT count(*)::int FROM price_list_items i WHERE i."priceListId" = pl.id) AS "itemCount",
              (SELECT count(*)::int FROM partners p
               WHERE p."priceListId" = pl.id AND p."deletedAt" IS NULL) AS "customerCount"
       FROM price_lists pl
       WHERE pl."tenantId" = $1 AND pl."deletedAt" IS NULL
       ORDER BY pl."name"`,
      [tenantId],
    );
    return { data };
  }

  async findOne(id: string, tenantId: string) {
    const list = await this.repo.findOne({
      where: { id, tenantId, deletedAt: IsNull() },
    });
    if (!list) throw new NotFoundException('price_list_not_found');

    const items = await this.dataSource.query(
      `SELECT i.id, i."finishedProductId", i."unitPrice",
              p.name AS "productName", p.unit, p."defaultSalesPrice"
       FROM price_list_items i
       JOIN finished_products p ON p.id = i."finishedProductId"
       WHERE i."priceListId" = $1 AND i."tenantId" = $2
       ORDER BY p.name`,
      [id, tenantId],
    );
    return { data: { ...list, items } };
  }

  async create(dto: CreatePriceListDto, tenantId: string, userId: string) {
    await this.assertNomLibre(dto.name, tenantId);
    const list = this.repo.create({
      tenantId,
      name: dto.name.trim(),
      description: dto.description ?? null,
      isActive: dto.isActive ?? true,
      createdBy: userId,
      updatedBy: userId,
    });
    await this.repo.save(list);
    return { data: list };
  }

  async update(id: string, dto: CreatePriceListDto, tenantId: string, userId: string) {
    const list = await this.repo.findOne({ where: { id, tenantId, deletedAt: IsNull() } });
    if (!list) throw new NotFoundException('price_list_not_found');
    if (dto.name.trim().toLowerCase() !== list.name.toLowerCase()) {
      await this.assertNomLibre(dto.name, tenantId);
    }
    list.name = dto.name.trim();
    list.description = dto.description ?? null;
    if (dto.isActive !== undefined) list.isActive = dto.isActive;
    list.updatedBy = userId;
    await this.repo.save(list);
    return { data: list };
  }

  async remove(id: string, tenantId: string) {
    const list = await this.repo.findOne({ where: { id, tenantId, deletedAt: IsNull() } });
    if (!list) throw new NotFoundException('price_list_not_found');

    // La contrainte FK est en ON DELETE SET NULL, donc la suppression
    // passerait en silence en remettant les clients au tarif de base. Mieux
    // vaut le refuser : un tarif qui change sans qu'on l'ait demandé est la
    // pire des surprises sur une facture.
    const [{ count }] = await this.dataSource.query(
      `SELECT count(*)::int FROM partners
       WHERE "priceListId" = $1 AND "deletedAt" IS NULL`,
      [id],
    );
    if (count > 0) throw new ConflictException('price_list_in_use');

    await this.repo.softDelete({ id, tenantId });
    return { data: { deleted: true } };
  }

  /**
   * Remplace intégralement les prix d'une grille.
   *
   * Remplacement plutôt que fusion : l'écran édite la grille entière, et un
   * article retiré de la liste doit disparaître de la grille — une fusion le
   * laisserait tarifé indéfiniment.
   */
  async setItems(id: string, dto: SetPriceListItemsDto, tenantId: string) {
    const list = await this.repo.findOne({ where: { id, tenantId, deletedAt: IsNull() } });
    if (!list) throw new NotFoundException('price_list_not_found');

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      await qr.query(`DELETE FROM price_list_items WHERE "priceListId" = $1 AND "tenantId" = $2`, [id, tenantId]);

      if (dto.items.length) {
        // Deux lignes sur le même article violeraient l'index unique : on
        // garde la dernière, comme le ferait une saisie qui se corrige.
        const parProduit = new Map(dto.items.map((i) => [i.finishedProductId, i.unitPrice]));

        const valides = await qr.query(
          `SELECT id FROM finished_products
           WHERE "tenantId" = $1 AND id = ANY($2::uuid[]) AND "deletedAt" IS NULL`,
          [tenantId, [...parProduit.keys()]],
        );
        const idsValides = new Set(valides.map((r: { id: string }) => r.id));
        const inconnus = [...parProduit.keys()].filter((pid) => !idsValides.has(pid));
        if (inconnus.length) throw new NotFoundException('product_not_found');

        const params: unknown[] = [];
        const tuples = [...parProduit.entries()].map(([pid, prix]) => {
          params.push(tenantId, id, pid, prix);
          const n = params.length;
          return `($${n - 3}, $${n - 2}, $${n - 1}, $${n})`;
        });
        await qr.query(
          `INSERT INTO price_list_items ("tenantId", "priceListId", "finishedProductId", "unitPrice")
           VALUES ${tuples.join(', ')}`,
          params,
        );
      }

      await qr.commitTransaction();
      this.logger.log(`Grille ${list.name} : ${dto.items.length} article(s) tarifé(s)`);
      return this.findOne(id, tenantId);
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  /**
   * Prix applicables à un client : map productId → prix de sa grille.
   *
   * Renvoyée en une fois plutôt qu'article par article : les écrans de saisie
   * ajoutent des lignes en rafale, une requête par ligne serait absurde.
   * Les articles absents de la grille ne figurent pas dans la réponse — c'est
   * `defaultSalesPrice` qui s'applique alors.
   */
  async resolveForCustomer(customerId: string, tenantId: string) {
    const [client] = await this.dataSource.query(
      `SELECT p.id, p."priceListId", pl.name AS "priceListName"
       FROM partners p
       LEFT JOIN price_lists pl ON pl.id = p."priceListId" AND pl."deletedAt" IS NULL
       WHERE p.id = $1 AND p."tenantId" = $2 AND p."deletedAt" IS NULL`,
      [customerId, tenantId],
    );
    if (!client) throw new NotFoundException('customer_not_found');

    if (!client.priceListId) {
      return { data: { priceListId: null, priceListName: null, prices: {} } };
    }

    const rows = await this.dataSource.query(
      `SELECT "finishedProductId", "unitPrice" FROM price_list_items
       WHERE "priceListId" = $1 AND "tenantId" = $2`,
      [client.priceListId, tenantId],
    );

    const prices: Record<string, number> = {};
    for (const r of rows) prices[r.finishedProductId] = Number(r.unitPrice);

    return {
      data: {
        priceListId: client.priceListId,
        priceListName: client.priceListName,
        prices,
      },
    };
  }

  private async assertNomLibre(name: string, tenantId: string): Promise<void> {
    const [existe] = await this.dataSource.query(
      `SELECT 1 FROM price_lists
       WHERE "tenantId" = $1 AND lower(name) = lower($2) AND "deletedAt" IS NULL`,
      [tenantId, name.trim()],
    );
    if (existe) throw new ConflictException('price_list_name_taken');
  }
}
