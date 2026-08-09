/**
 * Les agrégats financiers du tableau de bord disent-ils ce qu'ils annoncent ?
 *
 * Ce contrôle existe à cause d'un chiffre faux resté trois passes à l'écran, et
 * qu'aucun test ne pouvait voir : la marge brute était calculée
 *
 *     marge = chiffre d'affaires − achats REÇUS sur la période
 *
 * ce qui n'est pas une marge mais une trésorerie d'approvisionnement. Sur un
 * mois à vingt millions de ventes et deux réceptions, elle affichait **96,83 %**
 * — et le résultat net, qui en dérive, était surestimé d'un facteur cinq.
 *
 * Rien ne plantait. Le code était juste, la requête aussi ; c'est la
 * **définition** qui était fausse. Un contrôle de forme ne voit pas cela : il
 * faut vérifier la propriété comptable elle-même.
 *
 *     marge brute = chiffre d'affaires − coût des marchandises VENDUES
 *     résultat net = marge brute − charges approuvées
 *
 * Lancement : node scripts/verifier-comptabilite.js  (nécessite la base)
 */
const path = require('path');

let echecs = 0;
function verifier(intitule, condition, detail) {
  console.log(`  ${condition ? 'ok  ' : 'ECHEC'} ${intitule}`);
  if (!condition && detail) console.log(`         ${detail}`);
  if (!condition) echecs += 1;
}

const dinars = (v) => `${Number(v).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} DA`;

async function principal() {
  const dist = path.join(__dirname, '..', 'dist');
  const { NestFactory } = require('@nestjs/core');
  const { AppModule } = require(path.join(dist, 'app.module'));
  const { DashboardService } = require(path.join(dist, 'dashboard', 'dashboard.service'));

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const ds = app.get(require('typeorm').DataSource);

  // Quel locataire ? La question ne se posait pas tant qu'il n'y en avait
  // qu'un : `LIMIT 1` sans `ORDER BY` rendait toujours le même.
  //
  // Depuis que `provision-decor.sh` en pose un second, c'est un tirage au sort
  // — et tomber sur le locataire de test ferait juger les bornes de
  // plausibilité sur une trentaine de factures fabriquées par les bancs. Le
  // contrôle deviendrait vert ou rouge selon l'ordre physique des lignes, ce
  // qui est la pire façon d'échouer : sans raison lisible.
  //
  // On prend donc, à défaut d'indication, **celui qui porte le plus de
  // factures** — les bornes de plausibilité n'ont de sens que sur une activité
  // réelle. `TENANT_ID` permet de désigner l'autre explicitement.
  const t = process.env.TENANT_ID || (await ds.query(
    `SELECT "tenantId", count(*) AS n
       FROM sales_invoices WHERE "deletedAt" IS NULL
      GROUP BY "tenantId" ORDER BY n DESC, "tenantId" ASC LIMIT 1`,
  ))[0]?.tenantId;
  if (!t) {
    console.log('\n  Aucune facture en base : contrôle ignoré.\n');
    await app.close();
    return 0;
  }

  console.log('\nAgrégats financiers\n');
  const stats = await app.get(DashboardService).getStats(t, {});
  const p = stats.data.profit;
  const v = stats.data.sales;

  // ── L'identité comptable ────────────────────────────────────────────────
  const marge = Math.round((v.totalRevenue - p.costOfGoodsSold) * 100) / 100;
  verifier(
    'marge brute = CA − coût des marchandises vendues',
    Math.abs(marge - p.grossMargin) < 0.02,
    `attendu ${dinars(marge)}, obtenu ${dinars(p.grossMargin)}`,
  );

  const charges = Math.round((p.grossMargin - p.netProfit) * 100) / 100;
  verifier(
    'résultat net = marge brute − charges',
    charges >= -0.02,
    `les charges déduites valent ${dinars(charges)} — un négatif signifie que le résultat dépasse la marge`,
  );

  // ── Le coût des ventes ne peut pas venir des achats de la période ───────
  //
  // C'est l'erreur d'origine, et elle se reconnaît à ceci : le coût utilisé
  // était exactement le montant des réceptions. Les deux peuvent coïncider par
  // hasard sur un mois, jamais à la décimale.
  const achats = stats.data.purchases.totalPurchaseCost;
  verifier(
    'le coût des ventes n’est pas le montant des achats reçus',
    !(achats > 0 && Math.abs(p.costOfGoodsSold - achats) < 0.02),
    `coût des ventes ${dinars(p.costOfGoodsSold)} identique aux achats reçus — la marge mesure la trésorerie, pas la marge`,
  );

  // ── Plausibilité ────────────────────────────────────────────────────────
  //
  // Bornes larges : elles ne jugent pas la performance commerciale, elles
  // attrapent une définition fausse. Une marge de 96 % sur du négoce
  // alimentaire, ou une marge négative sur un mois de réassort, sont les deux
  // symptômes de l'erreur corrigée.
  verifier(
    'la marge brute reste dans des bornes plausibles',
    p.grossMarginPercent > -50 && p.grossMarginPercent < 90,
    `marge de ${p.grossMarginPercent} % — hors des bornes, vérifier la définition du coût`,
  );

  verifier(
    'le coût des ventes est renseigné',
    p.costOfGoodsSold > 0 || v.totalRevenue === 0,
    'coût nul avec du chiffre d’affaires : les lignes n’ont pas de coût figé',
  );

  // ── Le coût figé couvre-t-il les lignes récentes ? ──────────────────────
  const [couverture] = await ds.query(
    `SELECT COUNT(*) FILTER (WHERE sii."unitCost" IS NULL) AS sans,
            COUNT(*) AS total
       FROM sales_invoice_items sii
       JOIN sales_invoices si ON si.id = sii."salesInvoiceId"
      WHERE si."tenantId" = $1 AND si."deletedAt" IS NULL`,
    [t],
  );
  const sans = Number(couverture.sans);
  const total = Number(couverture.total);
  verifier(
    'toutes les lignes portent un coût figé',
    sans === 0,
    `${sans} ligne(s) sur ${total} sans coût — leur marge se recalculera au gré des réceptions`,
  );

  console.log(`\n  CA ${dinars(v.totalRevenue)} · coût ${dinars(p.costOfGoodsSold)} `
    + `· marge ${p.grossMarginPercent} % · net ${p.netProfitPercent} %`);

  await app.close();
  return echecs;
}

principal()
  .then((n) => {
    console.log(n === 0 ? '\nAgrégats financiers : conformes.\n' : `\nAgrégats financiers : ${n} échec(s).\n`);
    process.exit(n === 0 ? 0 : 1);
  })
  .catch((e) => {
    console.error('\nAgrégats financiers : contrôle interrompu —', e.message, '\n');
    process.exit(1);
  });
