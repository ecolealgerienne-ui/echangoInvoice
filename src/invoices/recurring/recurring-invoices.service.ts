import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { SalesInvoicesService } from '../sales-invoices.service';
import { CreateRecurringInvoiceDto } from './dto/create-recurring-invoice.dto';
import { Frequence, estDue, prochaineEcheance } from './echeance';

/** Jour à Alger — `toISOString()` seul est en UTC et bascule une heure trop tôt. */
function aujourdhui(): string {
  const p = new Intl.DateTimeFormat('fr-DZ', {
    timeZone: 'Africa/Algiers', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const v = (t: string) => p.find((x) => x.type === t)!.value;
  return `${v('year')}-${v('month')}-${v('day')}`;
}

@Injectable()
export class RecurringInvoicesService {
  private readonly logger = new Logger(RecurringInvoicesService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly factures: SalesInvoicesService,
  ) {}

  async lister(tenantId: string) {
    const data = await this.ds.query(
      `SELECT r.*, c.name AS "customerName",
              (SELECT COUNT(*)::int FROM recurring_invoice_items i
               WHERE i."recurringInvoiceId" = r.id) AS "itemCount"
       FROM recurring_invoices r
       JOIN partners c ON c.id = r."customerId"
       WHERE r."tenantId" = $1 AND r."deletedAt" IS NULL
       ORDER BY r."isActive" DESC, r."nextRunDate" ASC`,
      [tenantId],
    );
    return { data };
  }

  async creer(dto: CreateRecurringInvoiceDto, tenantId: string, userId: string) {
    const qr = this.ds.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const [abonnement] = await qr.query(
        `INSERT INTO recurring_invoices
           ("tenantId", "customerId", label, frequency, "startDate", "endDate",
            "nextRunDate", "paymentTermsDays", "paymentMode", notes, "createdBy", "updatedBy")
         VALUES ($1,$2,$3,$4,$5,$6,$5,$7,$8,$9,$10,$10)
         RETURNING *`,
        [tenantId, dto.customerId, dto.label, dto.frequency, dto.startDate,
         dto.endDate ?? null, dto.paymentTermsDays ?? 30, dto.paymentMode ?? 'other',
         dto.notes ?? null, userId],
      );

      for (const l of dto.items) {
        await qr.query(
          `INSERT INTO recurring_invoice_items
             ("tenantId", "recurringInvoiceId", "finishedProductId", quantity, unit, "unitPrice", "taxRate1")
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [tenantId, abonnement.id, l.finishedProductId, l.quantity, l.unit, l.unitPrice, l.taxRate1 ?? null],
        );
      }

      await qr.commitTransaction();
      return { data: abonnement };
    } catch (e) {
      await qr.rollbackTransaction();
      throw e;
    } finally {
      await qr.release();
    }
  }

  async basculerActivation(id: string, tenantId: string, userId: string) {
    const [a] = await this.ds.query(
      `UPDATE recurring_invoices SET "isActive" = NOT "isActive", "updatedBy" = $3
       WHERE id = $1 AND "tenantId" = $2 AND "deletedAt" IS NULL RETURNING *`,
      [id, tenantId, userId],
    );
    if (!a) throw new NotFoundException('errors.recurring_invoice_not_found');
    return { data: a };
  }

  async supprimer(id: string, tenantId: string) {
    const [a] = await this.ds.query(
      `UPDATE recurring_invoices SET "deletedAt" = now()
       WHERE id = $1 AND "tenantId" = $2 AND "deletedAt" IS NULL RETURNING id`,
      [id, tenantId],
    );
    if (!a) throw new NotFoundException('errors.recurring_invoice_not_found');
    return { data: { id } };
  }

  /**
   * Engendre les factures dues d'un abonnement, et avance son échéance.
   *
   * Les factures sont créées **en brouillon** : personne ne veut qu'une facture
   * parte au client sans avoir été regardée, et une facture émise ne se corrige
   * pas — elle s'annule par un avoir.
   *
   * La boucle rattrape les échéances manquées : si le cron n'a pas tourné
   * pendant trois mois, trois factures sortent, aux bonnes dates. Le garde-fou
   * de 24 itérations empêche qu'une date de départ lointaine en produise mille.
   */
  async genererPour(abonnementId: string, tenantId: string, userId: string) {
    // Les colonnes `date` sont lues en texte : node-postgres les rend sinon
    // en `Date` à minuit LOCAL, et `toISOString()` recule alors d'un jour en
    // UTC+1 — le jour d'ancrage passait de 31 à 30, puis dérivait à chaque
    // échéance. Le défaut ne se voyait pas en test unitaire, qui manipule des
    // chaînes ; il est apparu au premier essai contre la base.
    const [a] = await this.ds.query(
      `SELECT *, "nextRunDate"::text AS next_txt, "startDate"::text AS start_txt,
              "endDate"::text AS end_txt
       FROM recurring_invoices
       WHERE id = $1 AND "tenantId" = $2 AND "deletedAt" IS NULL`,
      [abonnementId, tenantId],
    );
    if (!a) throw new NotFoundException('errors.recurring_invoice_not_found');

    const lignes = await this.ds.query(
      `SELECT * FROM recurring_invoice_items WHERE "recurringInvoiceId" = $1 AND "tenantId" = $2`,
      [abonnementId, tenantId],
    );
    if (!lignes.length) return { data: { generees: [] } };

    const jour = aujourdhui();
    const generees: string[] = [];
    let echeance: string = a.next_txt;
    const debut: string = a.start_txt;
    const fin: string | null = a.end_txt ?? null;

    let garde = 0;
    while (a.isActive && estDue(echeance, fin, jour) && garde++ < 24) {
      // Midi UTC : à minuit, l'ajout de jours ferait basculer la date.
      const dueDate = new Date(`${echeance}T12:00:00Z`);
      dueDate.setUTCDate(dueDate.getUTCDate() + Number(a.paymentTermsDays ?? 30));

      const facture = await this.factures.create(
        {
          customerId: a.customerId,
          invoiceDate: echeance,
          dueDate: dueDate.toISOString().slice(0, 10),
          paymentMode: a.paymentMode,
          notes: a.notes ?? undefined,
          items: lignes.map((l: any) => ({
            finishedProductId: l.finishedProductId,
            quantity: Number(l.quantity),
            unit: l.unit,
            unitPrice: Number(l.unitPrice),
            taxRate1: l.taxRate1 != null ? Number(l.taxRate1) : undefined,
          })),
        } as any,
        tenantId, userId,
      );

      await this.ds.query(
        `UPDATE sales_invoices SET "recurringInvoiceId" = $1 WHERE id = $2`,
        [abonnementId, facture.data.id],
      );
      generees.push(facture.data.invoiceNumber);

      echeance = prochaineEcheance(debut, a.frequency as Frequence, echeance);
    }

    if (generees.length) {
      await this.ds.query(
        `UPDATE recurring_invoices
         SET "nextRunDate" = $1, "lastRunAt" = now(),
             "generatedCount" = "generatedCount" + $2
         WHERE id = $3`,
        [echeance, generees.length, abonnementId],
      );
    }

    return { data: { generees } };
  }

  /**
   * Passage quotidien, à 01:15 — après la bascule des impayés (00:01) et des
   * devis expirés (00:05), pour que les factures du jour partent d'un état
   * stable.
   */
  @Cron('15 1 * * *')
  async genererLesDues() {
    const jour = aujourdhui();
    const dus = await this.ds.query(
      `SELECT id, "tenantId", "createdBy" FROM recurring_invoices
       WHERE "isActive" = true AND "deletedAt" IS NULL AND "nextRunDate" <= $1
         AND ("endDate" IS NULL OR "nextRunDate" <= "endDate")`,
      [jour],
    );

    let total = 0;
    for (const a of dus) {
      try {
        const r = await this.genererPour(a.id, a.tenantId, a.createdBy ?? 'cron');
        total += r.data.generees.length;
      } catch (e) {
        // Un abonnement en échec — quota freemium atteint, article supprimé —
        // ne doit pas empêcher les autres de sortir.
        this.logger.error(`Abonnement ${a.id} : ${String(e)}`);
      }
    }
    if (total) this.logger.log(`Facturation récurrente : ${total} facture(s) engendrée(s)`);
  }
}
