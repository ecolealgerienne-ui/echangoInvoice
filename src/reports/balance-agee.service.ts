import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * Bornes des tranches, en jours de retard. La dernière est ouverte.
 *
 * Le découpage 30/60/90 est celui que tout comptable lit sans explication : le
 * changer rendrait la balance incomparable avec celle de son cabinet.
 */
const TRANCHES = [
  { cle: 'courant', libelle: "Non échu", min: null as number | null, max: 0 },
  { cle: 'j1_30', libelle: '1 à 30 jours', min: 1, max: 30 },
  { cle: 'j31_60', libelle: '31 à 60 jours', min: 31, max: 60 },
  { cle: 'j61_90', libelle: '61 à 90 jours', min: 61, max: 90 },
  { cle: 'j90plus', libelle: 'Plus de 90 jours', min: 91, max: null as number | null },
];

@Injectable()
export class BalanceAgeeService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  /**
   * Balance âgée client : ce qui reste dû, réparti par ancienneté de retard.
   *
   * Le retard se calcule sur l'**échéance**, pas sur le statut : une facture
   * marquée « envoyée » dont l'échéance est passée est en retard, que le cron
   * de bascule soit passé ou non. Se fier au statut ferait dépendre un chiffre
   * comptable de l'heure à laquelle une tâche planifiée s'est exécutée.
   *
   * Les factures sans échéance sont comptées comme non échues : leur imputer un
   * retard supposerait un délai de paiement qui n'a pas été convenu.
   */
  async parClient(tenantId: string) {
    const lignes = await this.ds.query(
      `SELECT c.id AS "customerId", c.name AS "customerName",
              f."invoiceNumber", f."invoiceDate", f."dueDate", f."amountDue",
              CASE
                WHEN f."dueDate" IS NULL THEN 0
                ELSE GREATEST(0, (CURRENT_DATE - f."dueDate"::date))
              END AS "joursRetard"
       FROM sales_invoices f
       JOIN partners c ON c.id = f."customerId"
       WHERE f."tenantId" = $1 AND f."deletedAt" IS NULL
         AND f.status NOT IN ('draft', 'cancelled')
         AND f."amountDue" > 0
       ORDER BY c.name, f."dueDate" NULLS FIRST`,
      [tenantId],
    );

    const parClient = new Map<string, any>();
    const totaux: Record<string, number> = Object.fromEntries(TRANCHES.map((t) => [t.cle, 0]));
    let totalGeneral = 0;

    for (const l of lignes) {
      const du = Number(l.amountDue);
      const retard = Number(l.joursRetard);
      const tranche = TRANCHES.find(
        (t) => (t.min === null || retard >= t.min) && (t.max === null || retard <= t.max),
      )!;

      if (!parClient.has(l.customerId)) {
        parClient.set(l.customerId, {
          customerId: l.customerId,
          customerName: l.customerName,
          total: 0,
          plusAncien: 0,
          ...Object.fromEntries(TRANCHES.map((t) => [t.cle, 0])),
          factures: [],
        });
      }
      const c = parClient.get(l.customerId);
      c[tranche.cle] = Math.round((c[tranche.cle] + du) * 100) / 100;
      c.total = Math.round((c.total + du) * 100) / 100;
      c.plusAncien = Math.max(c.plusAncien, retard);
      c.factures.push({
        invoiceNumber: l.invoiceNumber,
        invoiceDate: l.invoiceDate,
        dueDate: l.dueDate,
        amountDue: du,
        joursRetard: retard,
        tranche: tranche.cle,
      });

      totaux[tranche.cle] = Math.round((totaux[tranche.cle] + du) * 100) / 100;
      totalGeneral = Math.round((totalGeneral + du) * 100) / 100;
    }

    // Le plus en retard en tête : c'est celui qu'on rappelle en premier.
    const clients = [...parClient.values()].sort((a, b) => b.plusAncien - a.plusAncien);

    return {
      data: {
        tranches: TRANCHES.map(({ cle, libelle }) => ({ cle, libelle })),
        clients,
        totaux,
        totalGeneral,
        arreteeAu: new Date().toISOString().slice(0, 10),
      },
    };
  }
}
