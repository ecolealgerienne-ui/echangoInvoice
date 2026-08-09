/**
 * La production tient-elle le stock comme le reste de l'application ?
 *
 * Ce contrôle existe à cause d'un défaut qui ne cassait rien et se voyait trois
 * gestes plus tard. La production écrivait sur l'agrégat `stockQuantity` sans
 * toucher aux lots ; `recomputeProductStock()` recalculant cet agrégat depuis
 * les seuls lots, la réception ou la livraison suivante **ressuscitait** les
 * quantités consommées :
 *
 *     réception 100        lots 100   agrégat 100
 *     production −30       lots 100   agrégat  70
 *     livraison → recompute  lots  90   agrégat  90   ← les 30 sont revenus
 *
 * Aucun test unitaire ne pouvait le voir : chaque opération était correcte
 * isolément. C'est leur enchaînement qui mentait. Le contrôle rejoue donc la
 * séquence complète, sur la base réelle, dans une transaction annulée à la fin.
 *
 * Lancement : node scripts/verifier-production.js  (nécessite la base)
 */
const path = require('path');

let echecs = 0;
function verifier(intitule, condition, detail) {
  console.log(`  ${condition ? 'ok  ' : 'ECHEC'} ${intitule}`);
  if (!condition && detail) console.log(`         ${detail}`);
  if (!condition) echecs += 1;
}

async function principal() {
  const dist = path.join(__dirname, '..', 'dist');
  const { NestFactory } = require('@nestjs/core');
  const { AppModule } = require(path.join(dist, 'app.module'));
  const { DataSource } = require('typeorm');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const ds = app.get(DataSource);

  console.log('\nProduction et stock par lots\n');

  // ── 1. Le schéma porte ce qu'il faut ───────────────────────────────────
  const [colonnes] = await ds.query(`
    SELECT
      COUNT(*) FILTER (WHERE column_name = 'consumedByProductionOrderId') AS consomme,
      COUNT(*) FILTER (WHERE column_name = 'producedByProductionOrderId') AS produit
    FROM information_schema.columns WHERE table_name = 'stock_entries'`);
  verifier('le lot sait qui l’a consommé et qui l’a produit',
    Number(colonnes.consomme) === 1 && Number(colonnes.produit) === 1);

  const [{ existe }] = await ds.query(
    `SELECT COUNT(*)::int AS existe FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
     WHERE t.typname = 'stock_entry_status_enum' AND e.enumlabel = 'consumed'`);
  verifier('le statut « consumed » existe', existe === 1);

  const [{ table_lignes }] = await ds.query(
    `SELECT COUNT(*)::int AS table_lignes FROM information_schema.tables
      WHERE table_name = 'production_order_lines'`);
  verifier('la recette se fige sur l’ordre', table_lignes === 1);

  // ── 2. Le code ne contourne plus les lots ──────────────────────────────
  //
  // Une assertion de forme, assumée : elle attrape la régression la plus
  // probable — quelqu'un qui « corrige vite » en réécrivant l'agrégat.
  const fs = require('fs');
  const service = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'production', 'production-order.service.ts'), 'utf8');
  verifier('la production consomme par FIFO', /consumeStockFifo\(/.test(service));
  verifier('la production crée un lot pour ce qu’elle produit',
    /create\(StockEntry,/.test(service));
  // La règle est absolue et se vérifie donc simplement : hors commentaires, le
  // service de production ne doit **jamais** nommer `stockQuantity`. L'agrégat
  // appartient à `recomputeProductStock`, qui le dérive des lots. Une première
  // version de ce contrôle cherchait le motif « stockQuantity − n » ; réécrire
  // l'ancien geste avec un « + » lui échappait, et le contrôle passait au vert
  // sur du code fautif.
  const sansCommentaires = service
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  verifier('la production ne nomme jamais stockQuantity',
    !/stockQuantity/.test(sansCommentaires),
    'l’agrégat se dérive des lots ; l’écrire à la main rouvre le défaut d’origine');

  // ── 3. La séquence complète, rejouée puis annulée ──────────────────────
  const [matiere] = await ds.query(`
    SELECT fp.id, fp."tenantId", fp.name,
           COALESCE(SUM(se.quantity) FILTER (WHERE se.status = 'available'), 0) AS lots
      FROM finished_products fp
      JOIN stock_entries se ON se."finishedProductId" = fp.id AND se."deletedAt" IS NULL
     WHERE fp."deletedAt" IS NULL
     GROUP BY fp.id, fp."tenantId", fp.name
    HAVING COALESCE(SUM(se.quantity) FILTER (WHERE se.status = 'available'), 0) >= 10
     LIMIT 1`);

  if (!matiere) {
    console.log('\n  Aucun article avec assez de stock : séquence non rejouée.\n');
    await app.close();
    return echecs;
  }

  const qr = ds.createQueryRunner();
  await qr.connect();
  await qr.startTransaction();
  try {
    const { consumeStockFifo, recomputeProductStock } =
      require(path.join(dist, 'stock', 'recompute-product-stock'));

    const avant = Number(matiere.lots);
    const faux = '00000000-0000-4000-8000-0000000000ff';

    await consumeStockFifo(qr, matiere.tenantId, matiere.id, 4, 'consumed', null, faux);
    await recomputeProductStock(qr, matiere.tenantId, matiere.id);

    const [apres] = await qr.query(
      `SELECT "stockQuantity" FROM finished_products WHERE id = $1`, [matiere.id]);
    verifier('la consommation descend l’agrégat',
      Math.abs(Number(apres.stockQuantity) - (avant - 4)) < 0.01,
      `attendu ${avant - 4}, obtenu ${apres.stockQuantity}`);

    // Le geste qui révélait le défaut : un recalcul depuis les lots.
    await recomputeProductStock(qr, matiere.tenantId, matiere.id);
    const [rejoue] = await qr.query(
      `SELECT "stockQuantity" FROM finished_products WHERE id = $1`, [matiere.id]);
    verifier('un recalcul ultérieur ne ressuscite pas la quantité consommée',
      Math.abs(Number(rejoue.stockQuantity) - (avant - 4)) < 0.01,
      `le stock est remonté à ${rejoue.stockQuantity} au lieu de rester à ${avant - 4}`);

    const [{ traces }] = await qr.query(
      `SELECT COUNT(*)::int AS traces FROM stock_entries
        WHERE "consumedByProductionOrderId" = $1`, [faux]);
    verifier('les lots sortis portent l’ordre qui les a consommés', traces > 0);
  } finally {
    await qr.rollbackTransaction();
    await qr.release();
  }

  await app.close();
  return echecs;
}

principal()
  .then((n) => {
    console.log(n === 0 ? '\nProduction : conforme.\n' : `\nProduction : ${n} échec(s).\n`);
    process.exit(n === 0 ? 0 : 1);
  })
  .catch((e) => {
    console.error('\nProduction : contrôle interrompu —', e.message, '\n');
    process.exit(1);
  });
