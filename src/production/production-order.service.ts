import {
  BadRequestException, Injectable, Logger, NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, IsNull, Repository } from 'typeorm';
import { ProductionOrder } from './production-order.entity';
import { Nomenclature } from './nomenclature.entity';
import { ProductionOrderLine } from './production-order-line.entity';
import { StockEntry } from '../stock/stock-entry.entity';
import { consumeStockFifo, recomputeProductStock } from '../stock/recompute-product-stock';
import { FinishedProduct } from '../products/finished-product.entity';
import { CreateProductionOrderDto } from './dto/create-production-order.dto';
import { CompleteProductionOrderDto } from './dto/complete-production-order.dto';
import { ListProductionOrdersDto } from './dto/list-production-orders.dto';
import { NumberingService } from '../common/numbering/numbering.service';

@Injectable()
export class ProductionOrderService {
  private readonly logger = new Logger(ProductionOrderService.name);

  constructor(
    @InjectRepository(ProductionOrder) private readonly repo: Repository<ProductionOrder>,
    @InjectRepository(Nomenclature) private readonly nomRepo: Repository<Nomenclature>,
    @InjectRepository(FinishedProduct) private readonly fpRepo: Repository<FinishedProduct>,
    @InjectDataSource() private readonly ds: DataSource,
    private readonly numbering: NumberingService,
  ) {}

  private async enrichOrders(orders: ProductionOrder[], tenantId: string) {
    const nomIds = [...new Set(orders.map(o => o.nomenclatureId).filter(Boolean))];
    const fpIds = [...new Set(orders.map(o => o.finishedProductId).filter(Boolean))];
    const nomMap: Record<string, string> = {};
    const fpMap: Record<string, string> = {};
    // tenantId était reçu sans être utilisé : findByIds ne filtrait pas le
    // tenant (R020). Les identifiants viennent des ordres du tenant, donc rien
    // ne fuyait en pratique — mais la requête ne le garantissait pas.
    if (nomIds.length > 0) {
      const noms = await this.nomRepo.find({
        where: { id: In(nomIds), tenantId, deletedAt: IsNull() },
      });
      noms.forEach(n => { nomMap[n.id] = n.name; });
    }
    if (fpIds.length > 0) {
      const fps = await this.fpRepo.find({
        where: { id: In(fpIds), tenantId, deletedAt: IsNull() },
      });
      fps.forEach(fp => { fpMap[fp.id] = fp.name; });
    }
    return orders.map(o => ({
      ...o,
      nomenclatureName: nomMap[o.nomenclatureId] ?? null,
      finishedProductName: fpMap[o.finishedProductId] ?? null,
    }));
  }

  async findAll(query: ListProductionOrdersDto, tenantId: string) {
    const { page = 1, limit = 20, search, status, priority, from, to } = query;
    const qb = this.repo
      .createQueryBuilder('o')
      .where('o.tenantId = :tenantId AND o.deletedAt IS NULL', { tenantId });
    if (search) qb.andWhere('o.ref ILIKE :search', { search: `%${search}%` });
    if (status) qb.andWhere('o.status = :status', { status });
    if (priority) qb.andWhere('o.priority = :priority', { priority });
    if (from) qb.andWhere('o.createdAt >= :from', { from });
    if (to) qb.andWhere('o.createdAt <= :to', { to });
    qb.orderBy('o.createdAt', 'DESC').skip((page - 1) * limit).take(limit);
    const [data, total] = await qb.getManyAndCount();
    return { data: await this.enrichOrders(data, tenantId), pagination: { total, page, limit } };
  }

  async findOne(id: string, tenantId: string) {
    const order = await this.repo.findOne({ where: { id, tenantId, deletedAt: IsNull() } });
    if (!order) throw new NotFoundException('production_order_not_found');
    const [enriched] = await this.enrichOrders([order], tenantId);
    return { data: enriched };
  }

  async create(dto: CreateProductionOrderDto, tenantId: string, userId: string) {
    const nom = await this.nomRepo.findOne({
      where: { id: dto.nomenclatureId, tenantId, deletedAt: IsNull() },
    });
    if (!nom) throw new NotFoundException('nomenclature_not_found');

    const qr = this.ds.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const ref = await this.numbering.prochain(qr, tenantId, 'production_order');

      const estimatedCost =
        Number(nom.estimatedCostPerUnit) * Number(dto.quantityToProduce);

      const order = qr.manager.create(ProductionOrder, {
        tenantId,
        ref,
        nomenclatureId: nom.id,
        finishedProductId: nom.finishedProductId,
        quantityToProduce: dto.quantityToProduce,
        priority: dto.priority ?? 'normal',
        responsibleUserId: dto.responsibleUserId ?? null,
        plannedStartDate: dto.plannedStartDate ? new Date(dto.plannedStartDate) : null,
        plannedEndDate: dto.plannedEndDate ? new Date(dto.plannedEndDate) : null,
        estimatedCost,
        status: 'planned',
        createdBy: userId,
        updatedBy: userId,
      });
      const saved = await qr.manager.save(ProductionOrder, order);

      await qr.commitTransaction();
      this.logger.log(`ProductionOrder created: ${ref} for tenant ${tenantId}`);
      return this.findOne(saved.id, tenantId);
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  async start(id: string, tenantId: string, userId: string) {
    const order = await this.repo.findOne({ where: { id, tenantId, deletedAt: IsNull() } });
    if (!order) throw new NotFoundException('production_order_not_found');
    if (order.status !== 'planned') throw new BadRequestException('production_order_not_planned');

    const nom = await this.nomRepo.findOne({
      where: { id: order.nomenclatureId, tenantId, deletedAt: IsNull() },
    });
    if (!nom) throw new NotFoundException('nomenclature_not_found');

    const qr = this.ds.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      for (const line of nom.bomLines) {
        const needed = Number(line.quantityPerUnit) * Number(order.quantityToProduce);
        const material = await qr.manager.findOne(FinishedProduct, {
          where: { id: line.rawMaterialId, tenantId, deletedAt: IsNull() },
        });
        if (!material) throw new NotFoundException(`raw_material_not_found:${line.rawMaterialId}`);

        // Calcul stock disponible = somme stock_entries - reservedQuantity
        const stockRows: { total: string }[] = await qr.query(
          `SELECT COALESCE(SUM(quantity), 0) AS total
           FROM stock_entries
           WHERE "rawMaterialId" = $1 AND status = 'available' AND "deletedAt" IS NULL`,
          [material.id],
        );
        const stockQty = Number(stockRows[0]?.total ?? 0);
        const available = stockQty - Number(material.reservedQuantity);

        if (available <= 0) {
          throw new BadRequestException(`insufficient_stock:${material.id}`);
        }
        if (available < needed) {
          this.logger.warn(
            `Stock insuffisant pour MO ${order.ref} — MP ${material.id}: disponible=${available}, besoin=${needed}`,
          );
        }

        await qr.manager
          .createQueryBuilder()
          .update(FinishedProduct)
          .set({ reservedQuantity: () => `"reservedQuantity" + ${needed}` })
          .where('id = :id', { id: material.id })
          .execute();
      }

      // La recette est **copiée** sur l'ordre, pas référencée. Sans cela,
      // modifier la nomenclature réécrit rétroactivement ce sur quoi cet ordre
      // s'appuie : son coût estimé change après coup, et l'écart estimé/réel
      // finit par mesurer l'ancienneté de la fiche plutôt que l'atelier.
      await qr.manager.save(
        ProductionOrderLine,
        nom.bomLines.map((line) => qr.manager.create(ProductionOrderLine, {
          tenantId,
          productionOrderId: id,
          rawMaterialId: line.rawMaterialId,
          order: line.order,
          quantityPerUnit: line.quantityPerUnit,
          unit: line.unit,
          unitCost: line.unitCost,
          lineCost: line.lineCost,
        })),
      );

      await qr.manager
        .createQueryBuilder()
        .update(ProductionOrder)
        .set({ status: 'in_progress', actualStartDate: new Date(), updatedBy: userId })
        .where('id = :id AND "tenantId" = :tenantId', { id, tenantId })
        .execute();

      await qr.commitTransaction();
      this.logger.log(`ProductionOrder started: ${order.ref}`);
      return this.findOne(id, tenantId);
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  async complete(id: string, dto: CompleteProductionOrderDto, tenantId: string, userId: string) {
    const order = await this.repo.findOne({ where: { id, tenantId, deletedAt: IsNull() } });
    if (!order) throw new NotFoundException('production_order_not_found');
    if (order.status !== 'in_progress') throw new BadRequestException('production_order_not_in_progress');

    const nom = await this.nomRepo.findOne({
      where: { id: order.nomenclatureId, tenantId, deletedAt: IsNull() },
    });
    if (!nom) throw new NotFoundException('nomenclature_not_found');

    const fp = await this.fpRepo.findOne({
      where: { id: order.finishedProductId, tenantId, deletedAt: IsNull() },
    });
    if (!fp) throw new NotFoundException('finished_product_not_found');

    const qr = this.ds.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      // ── 1. Ce qui a réellement été consommé ────────────────────────────
      //
      // Les mouvements saisis à l'atelier priment sur la recette. S'il n'y en a
      // aucun, on retombe sur la recette **figée au démarrage** — jamais sur la
      // nomenclature courante, qui a pu changer entre-temps.
      const lignesFigees = await qr.manager.find(ProductionOrderLine, {
        where: { productionOrderId: id, tenantId },
      });
      if (lignesFigees.length === 0) {
        throw new BadRequestException('production_order_lines_missing');
      }

      const mouvements: { rawMaterialId: string; type: string; totalQty: string }[] =
        await qr.query(
          `SELECT "rawMaterialId", type, SUM("quantity") AS "totalQty"
           FROM "production_movements"
           WHERE "productionOrderId" = $1 AND type IN ('mp_consumption', 'mp_loss')
           GROUP BY "rawMaterialId", type`,
          [id],
        );

      const parMatiere: Record<string, { consommation: number; perte: number }> = {};
      for (const m of mouvements) {
        parMatiere[m.rawMaterialId] ??= { consommation: 0, perte: 0 };
        if (m.type === 'mp_consumption') parMatiere[m.rawMaterialId].consommation += Number(m.totalQty);
        if (m.type === 'mp_loss') parMatiere[m.rawMaterialId].perte += Number(m.totalQty);
      }

      if (Object.keys(parMatiere).length === 0) {
        for (const ligne of lignesFigees) {
          const besoin = Number(ligne.quantityPerUnit) * Number(order.quantityToProduce);
          parMatiere[ligne.rawMaterialId] = { consommation: besoin, perte: 0 };
        }
      }

      // ── 2. Sortie du stock, par les lots ───────────────────────────────
      //
      // C'est le cœur du correctif. La version précédente faisait un
      // `UPDATE finished_products SET "stockQuantity" = "stockQuantity" - n`
      // sans toucher aux lots — et `recomputeProductStock()` recalculant cet
      // agrégat depuis les seuls lots, la première réception ou livraison
      // suivante **ressuscitait** les quantités consommées. Le même défaut
      // avait déjà été corrigé côté ventes ; il n'avait pas été porté ici.
      const avertissements: string[] = [];
      for (const [matiereId, totaux] of Object.entries(parMatiere)) {
        const sortie = Math.round((totaux.consommation + totaux.perte) * 100) / 100;
        if (sortie <= 0) continue;

        // Perte comprise : ce qui est perdu quitte le stock aussi.
        const avertissement = await consumeStockFifo(
          qr, tenantId, matiereId, sortie, 'consumed', null, id,
        );
        if (avertissement) {
          avertissements.push(avertissement);
          this.logger.warn(`MO ${order.ref} — ${avertissement}`);
        }

        // La réservation est un compteur d'article, distinct des lots : elle se
        // relâche à hauteur de ce qui était réservé, soit la consommation.
        await qr.manager
          .createQueryBuilder()
          .update(FinishedProduct)
          .set({
            reservedQuantity: () => `GREATEST(0, "reservedQuantity" - ${totaux.consommation})`,
          })
          .where('id = :id AND "tenantId" = :tenantId', { id: matiereId, tenantId })
          .execute();

        await recomputeProductStock(qr, tenantId, matiereId);
      }

      // Le coût réel se lit sur les lots réellement sortis, pas sur un coût
      // moyen relevé avant la sortie : c'est le lien de traçabilité qui le rend
      // possible, et c'est la valeur exacte de ce qui a quitté le magasin.
      const [{ cout }] = await qr.query(
        `SELECT COALESCE(SUM("totalCost"), 0) AS cout
         FROM stock_entries
         WHERE "consumedByProductionOrderId" = $1 AND "tenantId" = $2`,
        [id, tenantId],
      );
      const actualCost = Math.round(Number(cout) * 100) / 100;

      // ── 3. Entrée du produit fini, en lot ──────────────────────────────
      const qtyProduced = Number(dto.quantityProduced);
      const qtyRejected = Number(dto.quantityRejected ?? 0);
      // Les rebuts n'entrent pas en stock : le coût total se répartit donc sur
      // les seules unités bonnes, ce qui renchérit leur coût unitaire — c'est
      // la conséquence comptable normale d'un rebut.
      const qtyNet = Math.max(0, Math.round((qtyProduced - qtyRejected) * 100) / 100);

      if (qtyNet > 0) {
        // La péremption du lot produit hérite de la **plus courte** de ses
        // matières. Un plat cuisiné ne se conserve pas plus longtemps que son
        // ingrédient le plus fragile ; à défaut de durée de conservation dans
        // la fiche article, c'est la règle du métier, et elle ne surestime
        // jamais. Sans elle, le produit fabriqué n'aurait aucune date — ce qui
        // est inacceptable en chambre froide.
        const [peremption] = await qr.query(
          `SELECT MIN("expiresAt") AS date
           FROM stock_entries
           WHERE "consumedByProductionOrderId" = $1 AND "tenantId" = $2
             AND "expiresAt" IS NOT NULL`,
          [id, tenantId],
        );

        await qr.manager.save(qr.manager.create(StockEntry, {
          tenantId,
          rawMaterialId: fp.id,
          finishedProductId: fp.id,
          producedByProductionOrderId: id,
          quantity: qtyNet,
          costPerUnit: Math.round((actualCost / qtyNet) * 100) / 100,
          totalCost: actualCost,
          // Le numéro de lot est la référence de l'ordre : c'est par elle qu'on
          // remonte aux matières employées.
          batchNumber: order.ref,
          expiresAt: peremption?.date ?? null,
          status: 'available',
          enteredAt: new Date(),
          createdBy: userId,
        }));
      }

      // L'agrégat se recalcule depuis les lots, comme partout ailleurs. Le
      // coût moyen pondéré en découle : il n'est plus calculé à la main ici,
      // et ne peut donc plus diverger de celui des ventes.
      await recomputeProductStock(qr, tenantId, fp.id);

      // 3. Update order
      const yieldPct =
        Number(order.quantityToProduce) > 0
          ? Math.round((qtyProduced / Number(order.quantityToProduce)) * 10000) / 100
          : 0;

      await qr.manager
        .createQueryBuilder()
        .update(ProductionOrder)
        .set({
          status: 'completed',
          quantityProduced: qtyProduced,
          quantityRejected: qtyRejected,
          yieldPercentage: yieldPct,
          actualCost,
          actualEndDate: new Date(),
          notes: dto.notes ?? order.notes ?? null,
          updatedBy: userId,
        })
        .where('id = :id AND "tenantId" = :tenantId', { id, tenantId })
        .execute();

      await qr.commitTransaction();
      this.logger.log(
        `ProductionOrder completed: ${order.ref} — produced=${qtyProduced}, yield=${yieldPct}%`,
      );
      return this.findOne(id, tenantId);
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  async cancel(id: string, tenantId: string, userId: string, reason?: string) {
    const order = await this.repo.findOne({ where: { id, tenantId, deletedAt: IsNull() } });
    if (!order) throw new NotFoundException('production_order_not_found');
    if (order.status === 'completed') throw new BadRequestException('production_order_already_completed');
    if (order.status === 'cancelled') throw new BadRequestException('production_order_already_cancelled');

    const qr = this.ds.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      if (order.status === 'in_progress') {
        // La libération se fait sur la recette **figée au démarrage** : c'est
        // elle qui a servi à réserver. Repasser par la nomenclature courante
        // libérerait des quantités qui n'ont jamais été réservées si la recette
        // a changé entre-temps, et laisserait l'écart sur les autres matières.
        const lignes = await qr.manager.find(ProductionOrderLine, {
          where: { productionOrderId: id, tenantId },
        });
        {
          for (const line of lignes) {
            const reserved = Number(line.quantityPerUnit) * Number(order.quantityToProduce);
            await qr.manager
              .createQueryBuilder()
              .update(FinishedProduct)
              .set({ reservedQuantity: () => `GREATEST(0, "reservedQuantity" - ${reserved})` })
              .where('id = :id AND "tenantId" = :tenantId', { id: line.rawMaterialId, tenantId })
              .execute();
          }
        }
      }

      await qr.manager
        .createQueryBuilder()
        .update(ProductionOrder)
        .set({ status: 'cancelled', notes: reason ?? order.notes ?? null, updatedBy: userId })
        .where('id = :id AND "tenantId" = :tenantId', { id, tenantId })
        .execute();

      await qr.commitTransaction();
      this.logger.log(`ProductionOrder cancelled: ${order.ref}`);
      return this.findOne(id, tenantId);
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }
}
