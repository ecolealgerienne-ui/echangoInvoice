import { DataSource, QueryRunner } from 'typeorm';

/**
 * Décomposition du stock d'un article : physique, réservé, disponible,
 * entrant.
 *
 * L'écran n'affichait qu'un nombre, intitulé « Quantité ». Ce nombre est en
 * réalité le stock DISPONIBLE : un bon de livraison consomme ses lots dès sa
 * création, avant même d'avoir quitté le dépôt. La marchandise d'un BL en
 * brouillon est donc physiquement présente mais déjà décomptée — et rien ne
 * permettait de faire la différence entre « il n'en reste plus » et « tout
 * est promis ».
 *
 * LES QUATRE NOMBRES SONT CALCULÉS, PAS STOCKÉS.
 *
 * Une colonne de réservation devrait être tenue à jour à chaque création,
 * modification, annulation et suppression de BL — exactement le genre de
 * compteur qui dérive de sa source, comme l'agrégat de stock l'a fait avant
 * d'être recalculé depuis les lots. Ici tout se déduit des lots et des
 * documents.
 *
 * `finished_products.reservedQuantity` reste la réserve de PRODUCTION, tenue
 * par les ordres de fabrication : elle ne consomme aucun lot, elle grève le
 * disponible.
 *
 * L'entrant ne compte pas dans le disponible — on ne promet pas ce qui n'est
 * pas arrivé — mais il répond à la question qui suit : faut-il commander ?
 */
export interface Disponibilite {
  productId: string;
  /** Ce qui est réellement dans le dépôt, promis ou non. */
  physique: number;
  /** Sorti des lots par un BL qui n'a pas encore quitté le dépôt. */
  reserveVentes: number;
  /** Grevé par un ordre de fabrication en cours. */
  reserveProduction: number;
  /** Ce qu'on peut encore promettre. */
  disponible: number;
  /** Commandé au fournisseur, pas encore réceptionné. */
  entrant: number;
}

const REQUETE = `
  SELECT p.id AS "productId",
         (p."stockQuantity" + COALESCE(v.reserve, 0))::float  AS physique,
         COALESCE(v.reserve, 0)::float                        AS "reserveVentes",
         p."reservedQuantity"::float                          AS "reserveProduction",
         (p."stockQuantity" - p."reservedQuantity")::float     AS disponible,
         COALESCE(a.attendu, 0)::float                        AS entrant
  FROM finished_products p
  LEFT JOIN LATERAL (
    -- Réservé par les ventes : les lots déjà sortis par un BL en brouillon ou
    -- envoyé. Un BL livré ou signé est parti pour de bon ; un BL annulé a
    -- rendu ses lots au stock.
    SELECT SUM(se.quantity) AS reserve
    FROM stock_entries se
    JOIN delivery_notes bl ON bl.id = se."reservedByDeliveryNoteId"
    WHERE se."finishedProductId" = p.id
      AND se."tenantId" = p."tenantId"
      AND se.status = 'sold'
      AND se."deletedAt" IS NULL
      AND bl."deletedAt" IS NULL
      AND bl.status IN ('draft', 'sent')
  ) v ON TRUE
  LEFT JOIN LATERAL (
    -- Entrant : commandes envoyées, déduction faite de ce qui a déjà été
    -- réceptionné pour cet article sur ces mêmes commandes.
    --
    -- Le reçu se calcule LIGNE PAR LIGNE, par jointure latérale : en
    -- sous-requête corrélée à l'intérieur du SUM, Postgres refuse la
    -- référence à une colonne non groupée. Et GREATEST borne à zéro, sans
    -- quoi une réception excédentaire ferait compter un entrant négatif.
    SELECT SUM(GREATEST(oi.quantity - COALESCE(recu.q, 0), 0)) AS attendu
    FROM purchase_order_items oi
    JOIN purchase_orders o ON o.id = oi."purchaseOrderId"
    LEFT JOIN LATERAL (
      SELECT SUM(se.quantity) AS q
      FROM stock_entries se
      JOIN reception_bls r ON r.id = se."receptionBlId"
      WHERE se."finishedProductId" = p.id
        AND r."purchaseOrderId" = oi."purchaseOrderId"
        AND se."deletedAt" IS NULL
    ) recu ON TRUE
    WHERE oi."rawMaterialId" = p.id
      AND o."tenantId" = p."tenantId"
      AND o."deletedAt" IS NULL
      AND o.status = 'sent'
  ) a ON TRUE
  WHERE p."tenantId" = $1 AND p."deletedAt" IS NULL`;

export async function disponibilites(
  ds: DataSource | QueryRunner,
  tenantId: string,
): Promise<Map<string, Disponibilite>> {
  const lignes: Disponibilite[] = await ds.query(REQUETE, [tenantId]);
  return new Map(lignes.map((l) => [l.productId, l]));
}

/** Même règle, restreinte à une liste d'articles. */
export async function disponibilitesDe(
  ds: DataSource | QueryRunner,
  tenantId: string,
  productIds: string[],
): Promise<Map<string, Disponibilite>> {
  if (productIds.length === 0) return new Map();
  const lignes: Disponibilite[] = await ds.query(
    `${REQUETE} AND p.id = ANY($2)`,
    [tenantId, productIds],
  );
  return new Map(lignes.map((l) => [l.productId, l]));
}
