import { QueryRunner } from 'typeorm';

/**
 * Recalcule l'agrégat de stock porté par `finished_products` à partir des lots
 * `stock_entries` encore disponibles.
 *
 * Source unique de vérité : le lot. L'agrégat n'est qu'un cache de lecture.
 * Tant que les sorties ne consommaient pas les lots, ce recalcul — déclenché à
 * chaque réception — ressuscitait les quantités déjà livrées (constaté le
 * 2026-08-08 : 100 reçus, 30 livrés, 50 reçus → 150 au lieu de 120).
 *
 * Fonction partagée plutôt que recopiée dans achats et livraisons : si la règle
 * change, elle doit changer en un seul endroit (R029).
 */
export async function recomputeProductStock(
  qr: QueryRunner,
  tenantId: string,
  productId: string,
): Promise<void> {
  const rows: { quantity: string; totalCost: string; expiresAt: Date | null }[] =
    await qr.query(
      `SELECT quantity, "totalCost", "expiresAt"
       FROM stock_entries
       WHERE "tenantId" = $1 AND "finishedProductId" = $2
         AND status = 'available' AND "deletedAt" IS NULL`,
      [tenantId, productId],
    );

  const totalQuantity = rows.reduce((s, r) => s + Number(r.quantity), 0);
  const totalValue = rows.reduce((s, r) => s + Number(r.totalCost), 0);
  const averageCostPerUnit =
    totalQuantity > 0 ? Number((totalValue / totalQuantity).toFixed(2)) : 0;

  const expirations = rows
    .map((r) => r.expiresAt)
    .filter((d): d is Date => d !== null)
    .sort((a, b) => a.getTime() - b.getTime());

  await qr.query(
    `UPDATE finished_products
     SET "stockQuantity"          = $1,
         "averageCostPerUnit"     = $2,
         "totalStockValue"        = $3,
         "earliestExpirationDate" = $4,
         "updatedAt"              = NOW()
     WHERE id = $5 AND "tenantId" = $6`,
    [
      Math.round(totalQuantity * 100) / 100,
      averageCostPerUnit,
      Math.round(totalValue * 100) / 100,
      expirations[0] ?? null,
      productId,
      tenantId,
    ],
  );
}

/**
 * Consomme `quantity` unités du produit en FIFO — lots les plus anciens
 * d'abord (R015).
 *
 * Un lot entamé est **scindé** : la part consommée devient un lot `sold`
 * rattaché au document qui l'a sortie, le reste demeure `available`. C'est ce
 * qui permet d'annuler une sortie sans perdre le coût d'origine, et de savoir
 * quel lot est parti chez quel client.
 *
 * Retourne un avertissement si le stock disponible ne suffit pas. Le stock
 * négatif reste toléré (le métier livre parfois avant de régulariser), mais il
 * est désormais visible : la quantité manquante n'est prise sur aucun lot.
 */
export async function consumeStockFifo(
  qr: QueryRunner,
  tenantId: string,
  productId: string,
  quantity: number,
  /** Statut donné à la part sortie : `sold` pour une vente, `adjusted` pour une
   *  régularisation d'inventaire — la distinction est ce qui permet de ne pas
   *  confondre une perte avec une livraison dans les états. */
  statut: 'sold' | 'adjusted' = 'sold',
  /** Renseigné pour une vente : c'est le lien qui rend l'annulation possible. */
  deliveryNoteId: string | null = null,
): Promise<string | null> {
  const lots: { id: string; quantity: string; costPerUnit: string }[] =
    await qr.query(
      `SELECT id, quantity, "costPerUnit"
       FROM stock_entries
       WHERE "tenantId" = $1 AND "finishedProductId" = $2
         AND status = 'available' AND "deletedAt" IS NULL
       ORDER BY "enteredAt" ASC, "createdAt" ASC`,
      [tenantId, productId],
    );

  let reste = quantity;

  for (const lot of lots) {
    if (reste <= 0) break;
    const dispo = Number(lot.quantity);
    const cout = Number(lot.costPerUnit);

    if (dispo <= reste) {
      // Lot consommé en entier
      await qr.query(
        `UPDATE stock_entries
         SET status = $1, "reservedByDeliveryNoteId" = $2, "updatedAt" = NOW()
         WHERE id = $3`,
        [statut, deliveryNoteId, lot.id],
      );
      reste = Math.round((reste - dispo) * 100) / 100;
    } else {
      // Lot entamé : on le scinde
      const restant = Math.round((dispo - reste) * 100) / 100;
      await qr.query(
        `UPDATE stock_entries
         SET quantity = $1, "totalCost" = $2, "updatedAt" = NOW()
         WHERE id = $3`,
        [restant, Math.round(restant * cout * 100) / 100, lot.id],
      );
      await qr.query(
        `INSERT INTO stock_entries
           ("tenantId", "finishedProductId", "rawMaterialId", quantity, "costPerUnit",
            "totalCost", status, "reservedByDeliveryNoteId", "enteredAt", "batchNumber", "expiresAt")
         SELECT "tenantId", "finishedProductId", "rawMaterialId", $1, "costPerUnit",
                $2, $3, $4, "enteredAt", "batchNumber", "expiresAt"
         FROM stock_entries WHERE id = $5`,
        [reste, Math.round(reste * cout * 100) / 100, statut, deliveryNoteId, lot.id],
      );
      reste = 0;
    }
  }

  if (reste > 0) {
    // L'avertissement remonte jusqu'à l'écran : il doit nommer l'article.
    // La version précédente affichait son identifiant technique, ce qui
    // obligeait l'utilisateur à deviner de quel produit on lui parlait.
    const [article] = await qr.query(
      `SELECT name, unit FROM finished_products WHERE id = $1 AND "tenantId" = $2`,
      [productId, tenantId],
    );
    const nom = article?.name ?? productId;
    const unite = article?.unit ? ` ${article.unit}` : '';
    return `Stock insuffisant pour « ${nom} » : ${reste}${unite} sorti(s) sans lot correspondant.`;
  }
  return null;
}

/**
 * Rend au stock les lots sortis par un bon de livraison donné.
 * Symétrique de `consumeStockFifo` : on ne recrée rien, on rebascule.
 */
export async function releaseStockForDeliveryNote(
  qr: QueryRunner,
  tenantId: string,
  deliveryNoteId: string,
): Promise<void> {
  await qr.query(
    `UPDATE stock_entries
     SET status = 'available', "reservedByDeliveryNoteId" = NULL, "updatedAt" = NOW()
     WHERE "tenantId" = $1 AND "reservedByDeliveryNoteId" = $2 AND status = 'sold'`,
    [tenantId, deliveryNoteId],
  );
}
