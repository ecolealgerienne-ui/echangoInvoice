import 'reflect-metadata';
import { DataSource, QueryRunner } from 'typeorm';
import * as crypto from 'crypto';

/**
 * Seed de démonstration — jeu de données réaliste pour le développement.
 *
 * Volumes calés sur le « tenant moyen » de la spec 17 §9 (300 clients, 200 produits,
 * 1 000 factures, 800 BL, 600 paiements, 400 devis, fenêtre 90 jours), ce qui permet
 * de mesurer les cibles de performance du cache mobile sur des données crédibles.
 *
 * Les montants sont calculés exactement comme SalesInvoicesService.computeItem /
 * computeTotals : lineTotal est TTC, subtotal est HT, totalAmount = subtotal + taxes.
 *
 * Rejouable : purge les données de démo du tenant avant de réinsérer. Ne touche
 * jamais aux tables tenants / users / plans / subscriptions.
 *
 *   npm run seed:demo
 *   DEMO_INVOICES=100 DEMO_CUSTOMERS=30 npm run seed:demo   # jeu réduit
 */

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('[FATAL] DATABASE_URL manquante');

const TENANT_SLUG = process.env.DEMO_TENANT_SLUG ?? 'chambre-froide-djelfa';

const N = {
  customers: int(process.env.DEMO_CUSTOMERS, 300),
  suppliers: int(process.env.DEMO_SUPPLIERS, 30),
  products: int(process.env.DEMO_PRODUCTS, 200),
  invoices: int(process.env.DEMO_INVOICES, 1000),
  deliveryNotes: int(process.env.DEMO_DELIVERY_NOTES, 800),
  payments: int(process.env.DEMO_PAYMENTS, 600),
  creditNotes: int(process.env.DEMO_CREDIT_NOTES, 60),
  quotes: int(process.env.DEMO_QUOTES, 400),
  expenses: int(process.env.DEMO_EXPENSES, 150),
  // Lignes d'achat postérieures aux ventes simulées : elles n'alimentent pas la
  // consommation FIFO. Elles servent à montrer une activité récente et, pour
  // une partie d'entre elles, un cycle encore ouvert (commandes en attente de
  // réception) — sans quoi l'écran Achats n'afficherait que du « reçu ».
  recentPurchases: int(process.env.DEMO_RECENT_PURCHASES, 120),
  windowDays: int(process.env.DEMO_WINDOW_DAYS, 90),
};

function int(v: string | undefined, def: number): number {
  const n = v ? parseInt(v, 10) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : def;
}

// ── Aléatoire déterministe ────────────────────────────────────────────────────
// Graine fixe : deux exécutions produisent le même jeu de données.

let _s = 0x2f6e2b1;
function rnd(): number {
  _s |= 0;
  _s = (_s + 0x6d2b79f5) | 0;
  let t = Math.imul(_s ^ (_s >>> 15), 1 | _s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const ri = (min: number, max: number) => Math.floor(rnd() * (max - min + 1)) + min;
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rnd() * arr.length)];
const money = (n: number) => Math.round(n * 100) / 100;

// ── Référentiels ──────────────────────────────────────────────────────────────

const VILLES = [
  'Alger', 'Oran', 'Constantine', 'Annaba', 'Blida', 'Batna', 'Djelfa', 'Sétif',
  'Sidi Bel Abbès', 'Biskra', 'Tébessa', 'Tlemcen', 'Béjaïa', 'Tiaret', 'Ouargla',
  'Béchar', 'Mostaganem', 'Bordj Bou Arréridj', 'Chlef', 'Souk Ahras', 'Médéa', 'Laghouat',
] as const;

const FORMES = ['SARL', 'EURL', 'SPA', 'ETS', 'SNC'] as const;

const ENSEIGNES = [
  'El Baraka', 'Nour', 'El Amel', 'Ennasr', 'El Wifak', 'Es Salam', 'El Fath',
  'Rahma', 'El Djazair', 'Ibn Sina', 'El Yasmine', 'Sidi Okba', 'El Anseur',
  'Tassili', 'Hoggar', 'Djurdjura', 'Aurès', 'Chelia', 'Ouarsenis', 'Zaccar',
  'El Feth', 'Ennour', 'El Hidhab', 'Boussaada', 'El Mordjane', 'Errahma',
] as const;

/** Activités côté amont — ce que fait un fournisseur de la chaîne du froid. */
const FOURNISSEURS = [
  'Import', 'Abattoirs', 'Conserverie', 'Surgelés', 'Pêcherie',
  'Laiterie', 'Minoterie', 'Logistique Froid', 'Négoce International',
] as const;

const ACTIVITES = [
  'Distribution', 'Alimentation Générale', 'Superette', 'Boucherie', 'Restauration',
  'Traiteur', 'Grossiste', 'Hôtellerie', 'Cash & Carry', 'Épicerie Fine',
] as const;

const PRENOMS = [
  'Mohamed', 'Ahmed', 'Karim', 'Yacine', 'Sofiane', 'Bilal', 'Rachid', 'Nabil',
  'Amine', 'Farid', 'Hakim', 'Samir', 'Djamel', 'Reda', 'Anis', 'Toufik',
  'Amina', 'Fatiha', 'Nadia', 'Samia', 'Leila', 'Yasmine', 'Souad', 'Karima',
] as const;

const NOMS = [
  'Benali', 'Boumediene', 'Cherif', 'Hamdani', 'Khelifi', 'Belkacem', 'Mansouri',
  'Zerrouki', 'Bouzid', 'Saidi', 'Meziane', 'Larbi', 'Tounsi', 'Ferhat',
  'Slimani', 'Haddad', 'Brahimi', 'Ouali', 'Boudjemaa', 'Berkane',
] as const;

/** Catalogue orienté chaîne du froid — cohérent avec « Chambre Froide Djelfa ». */
const CATALOGUE: ReadonlyArray<{ nom: string; unite: string; min: number; max: number }> = [
  { nom: 'Poulet entier congelé', unite: 'kg', min: 380, max: 520 },
  { nom: 'Escalope de dinde', unite: 'kg', min: 900, max: 1250 },
  { nom: 'Cuisses de poulet', unite: 'kg', min: 420, max: 560 },
  { nom: 'Viande hachée bovine', unite: 'kg', min: 1400, max: 1900 },
  { nom: 'Épaule d’agneau', unite: 'kg', min: 1600, max: 2200 },
  { nom: 'Merguez', unite: 'kg', min: 850, max: 1150 },
  { nom: 'Sardine congelée', unite: 'kg', min: 300, max: 450 },
  { nom: 'Crevette royale', unite: 'kg', min: 2200, max: 3200 },
  { nom: 'Filet de merlu', unite: 'kg', min: 1100, max: 1600 },
  { nom: 'Calamar nettoyé', unite: 'kg', min: 1300, max: 1800 },
  { nom: 'Petits pois surgelés', unite: 'kg', min: 220, max: 320 },
  { nom: 'Haricots verts surgelés', unite: 'kg', min: 240, max: 340 },
  { nom: 'Frites surgelées', unite: 'sac', min: 480, max: 700 },
  { nom: 'Mélange légumes', unite: 'kg', min: 260, max: 360 },
  { nom: 'Épinards en branches', unite: 'kg', min: 210, max: 300 },
  { nom: 'Pâte feuilletée', unite: 'boîte', min: 320, max: 460 },
  { nom: 'Crème glacée vanille', unite: 'L', min: 380, max: 520 },
  { nom: 'Sorbet citron', unite: 'L', min: 340, max: 470 },
  { nom: 'Beurre plaquette', unite: 'kg', min: 950, max: 1300 },
  { nom: 'Fromage râpé', unite: 'kg', min: 1050, max: 1450 },
  { nom: 'Pâte brisée', unite: 'boîte', min: 300, max: 420 },
  { nom: 'Nuggets de volaille', unite: 'kg', min: 700, max: 980 },
  { nom: 'Cordon bleu', unite: 'kg', min: 820, max: 1150 },
  { nom: 'Pizza surgelée', unite: 'pcs', min: 260, max: 380 },
  { nom: 'Brick de viande', unite: 'boîte', min: 380, max: 540 },
];

const QUALIFS = [
  'Premium', 'Standard', 'Extra', 'Family', 'Pro', 'Gold', 'Select',
  'Calibre 1', 'Calibre 2', 'Origine locale', 'Import', 'Vrac', 'Sachet 1 kg',
  'Sachet 2,5 kg', 'Carton 10 kg', 'Palette', 'Lot économique',
] as const;

const CATEGORIES_DEPENSE = ['loyer', 'utilities', 'transport', 'rh', 'maintenance', 'other'] as const;

const LIBELLES_DEPENSE: Record<string, readonly string[]> = {
  loyer: ['Loyer entrepôt frigorifique', 'Loyer bureau', 'Loyer quai de chargement'],
  utilities: ['Facture Sonelgaz', 'Facture eau (SEAAL)', 'Abonnement internet', 'Groupe électrogène — gasoil'],
  transport: ['Carburant camion frigo', 'Péage et déplacements', 'Location véhicule réfrigéré', 'Entretien flotte'],
  rh: ['Salaires manutention', 'Charges sociales CNAS', 'Prime de rendement', 'Médecine du travail'],
  maintenance: ['Maintenance groupe froid', 'Réparation chambre froide', 'Contrôle thermomètres', 'Pièces compresseur'],
  other: ['Fournitures de bureau', 'Frais bancaires', 'Assurance marchandises', 'Honoraires comptable'],
};

const TVA = 19; // taux standard algérien

// ── Utilitaires ───────────────────────────────────────────────────────────────

const uuid = () => crypto.randomUUID();

/** Date aléatoire dans la fenêtre [aujourd'hui - windowDays, aujourd'hui]. */
function dateInWindow(): Date {
  const d = new Date();
  d.setDate(d.getDate() - ri(0, N.windowDays));
  d.setHours(ri(8, 18), ri(0, 59), 0, 0);
  return d;
}

const isoDate = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);

/**
 * INSERT multi-lignes par lots. PostgreSQL plafonne à 65535 paramètres par
 * requête : on borne la taille de lot en conséquence.
 */
async function insertBatch(
  qr: QueryRunner,
  table: string,
  columns: string[],
  rows: unknown[][],
): Promise<void> {
  if (!rows.length) return;
  const maxRows = Math.max(1, Math.floor(60000 / columns.length));
  const cols = columns.map((c) => `"${c}"`).join(', ');

  for (let start = 0; start < rows.length; start += maxRows) {
    const chunk = rows.slice(start, start + maxRows);
    const params: unknown[] = [];
    const tuples = chunk.map((row) => {
      const ph = row.map((v) => {
        params.push(v);
        return `$${params.length}`;
      });
      return `(${ph.join(', ')})`;
    });
    await qr.query(`INSERT INTO ${table} (${cols}) VALUES ${tuples.join(', ')}`, params);
  }
}

// ── Seed ──────────────────────────────────────────────────────────────────────

const ds = new DataSource({
  type: 'postgres',
  url: DATABASE_URL,
  entities: [__dirname + '/../../**/*.entity{.ts,.js}'],
  synchronize: false,
  ssl: false,
});

async function seedDemo() {
  await ds.initialize();
  const qr = ds.createQueryRunner();
  await qr.connect();
  await qr.startTransaction();

  const t0 = Date.now();

  try {
    // ── Tenant ────────────────────────────────────────────────────────────────
    const [tenant] = await qr.query(`SELECT id, name FROM tenants WHERE slug = $1`, [TENANT_SLUG]);
    if (!tenant) {
      throw new Error(
        `Tenant « ${TENANT_SLUG} » introuvable. Lance d'abord : npm run seed`,
      );
    }
    const tenantId: string = tenant.id;

    const [user] = await qr.query(
      `SELECT email FROM users WHERE "tenantId" = $1 ORDER BY "createdAt" LIMIT 1`,
      [tenantId],
    );
    const author: string = user?.email ?? 'seed-demo';

    console.log(`\nTenant : ${tenant.name} (${tenantId})`);

    // ── Purge des données de démo ─────────────────────────────────────────────
    // Ordre enfants → parents. Les tables tenants/users/plans/subscriptions
    // ne sont jamais touchées.
    //
    // ⚠️ La liste couvre TOUTES les tables qui référencent finished_products
    // ou partners, pas seulement celles que ce seed alimente. Huit tables
    // pointent sur finished_products ; n'en purger que deux faisait échouer
    // la purge dès qu'un achat ou un ordre de production existait — cas
    // rencontré après une campagne e2e, qui en crée. La requête à jour :
    //   SELECT conrelid::regclass, confrelid::regclass FROM pg_constraint
    //   WHERE contype='f' AND confrelid::regclass::text
    //         IN ('finished_products','partners');
    const purge = [
      // stock d'abord : stock_entries référence reception_bls ET
      // finished_products, il doit donc partir avant les deux
      'stock_adjustments', 'stock_entries',
      // achats
      'vendor_payments', 'vendor_bill_items', 'vendor_bills',
      'reception_bls', 'purchase_order_items', 'purchase_orders',
      // production
      'production_movements', 'production_orders', 'bom_lines', 'nomenclatures',
      // ventes
      'payments', 'sales_invoice_items', 'sales_invoices',
      'credit_note_items', 'credit_notes',
      'delivery_note_items', 'delivery_notes',
      'quote_items', 'quotes',
      // tarification : price_list_items référence finished_products ET
      // price_lists, et partners pointe sur price_lists
      'price_list_items', 'price_lists',
      // référentiels
      'expenses', 'partner_contacts', 'finished_products', 'partners',
      // compteurs : ils décrivent les documents qu'on vient d'effacer
      'document_counters',
    ];
    for (const table of purge) {
      await qr.query(`DELETE FROM ${table} WHERE "tenantId" = $1`, [tenantId]);
    }
    console.log(`Purge : ${purge.length} tables vidées pour ce tenant`);

    // ── Clients ───────────────────────────────────────────────────────────────
    const customerIds: string[] = [];
    const customerRows: unknown[][] = [];
    const usedNames = new Set<string>();

    for (let i = 0; i < N.customers; i++) {
      let name = `${pick(FORMES)} ${pick(ENSEIGNES)} ${pick(ACTIVITES)}`;
      while (usedNames.has(name)) name = `${pick(FORMES)} ${pick(ENSEIGNES)} ${pick(ACTIVITES)} ${i + 1}`;
      usedNames.add(name);

      const id = uuid();
      customerIds.push(id);
      const ville = pick(VILLES);
      const contact = `${pick(PRENOMS)} ${pick(NOMS)}`;

      customerRows.push([
        id, tenantId, true, false, name, contact,
        `contact${i + 1}@${slug(name)}.dz`,
        `+213 ${ri(5, 7)}${ri(10, 99)} ${ri(10, 99)} ${ri(10, 99)} ${ri(10, 99)}`,
        String(ri(1, 9)) + digits(14),          // NIF  — 15 chiffres
        `${ri(10, 48)}/00-${digits(7)} B ${ri(15, 26)}`, // RC
        digits(11),                             // AI
        String(ri(1, 9)) + digits(14),          // NIS
        `${ri(1, 250)} ${pick(['Rue', 'Avenue', 'Boulevard', 'Cité'])} ${pick(NOMS)}`,
        ville, 'Algérie',
        rnd() < 0.35 ? `Dépôt ${ri(1, 40)}, Zone d'activité ${ville}` : null,
        rnd() < 0.35 ? ville : null,
        rnd() < 0.2 ? pick(['Client fidèle', 'Paiement à 30 jours', 'Livraison le matin uniquement', 'Vérifier la chaîne du froid']) : null,
        rnd() < 0.95, author, author,
      ]);
    }

    await insertBatch(qr, 'partners', [
      'id', 'tenantId', 'isCustomer', 'isSupplier', 'name', 'contactPerson', 'email', 'phone',
      'nif', 'rc', 'ai', 'nis', 'address', 'city', 'country',
      'shippingAddress', 'shippingCity', 'notes', 'isActive', 'createdBy', 'updatedBy',
    ], customerRows);
    console.log(`Clients   : ${customerRows.length}`);

    // ── Fournisseurs ──────────────────────────────────────────────────────────
    // Un négoce achète avant de vendre : sans fournisseur, le module Achats est
    // inutilisable et l'écran « Nouvelle commande » n'a aucun choix à proposer.
    const supplierIds: string[] = [];
    const supplierRows: unknown[][] = [];

    for (let i = 0; i < N.suppliers; i++) {
      const id = uuid();
      supplierIds.push(id);
      const ville = pick(VILLES);
      const name = `${pick(FORMES)} ${pick(ENSEIGNES)} ${pick(FOURNISSEURS)} ${i + 1}`;

      supplierRows.push([
        id, tenantId, false, true, name, `${pick(PRENOMS)} ${pick(NOMS)}`,
        `achats${i + 1}@${slug(name)}.dz`,
        `+213 ${ri(5, 7)}${ri(10, 99)} ${ri(10, 99)} ${ri(10, 99)} ${ri(10, 99)}`,
        String(ri(1, 9)) + digits(14),
        `${ri(10, 48)}/00-${digits(7)} B ${ri(15, 26)}`,
        digits(11),
        String(ri(1, 9)) + digits(14),
        `${ri(1, 250)} ${pick(['Rue', 'Avenue', 'Zone industrielle'])} ${pick(NOMS)}`,
        ville, 'Algérie', null, null,
        rnd() < 0.25 ? pick(['Livraison sous 48 h', 'Franco à partir de 200 000 DA', 'Paiement à 30 jours fin de mois']) : null,
        true, author, author,
      ]);
    }

    await insertBatch(qr, 'partners', [
      'id', 'tenantId', 'isCustomer', 'isSupplier', 'name', 'contactPerson', 'email', 'phone',
      'nif', 'rc', 'ai', 'nis', 'address', 'city', 'country',
      'shippingAddress', 'shippingCity', 'notes', 'isActive', 'createdBy', 'updatedBy',
    ], supplierRows);
    console.log(`Fournisseurs : ${supplierRows.length}`);

    // ── Produits ──────────────────────────────────────────────────────────────
    const products: Array<{ id: string; unit: string; price: number; cost: number }> = [];
    const productRows: unknown[][] = [];
    const usedCodes = new Set<string>();

    for (let i = 0; i < N.products; i++) {
      const base = CATALOGUE[i % CATALOGUE.length];
      const nom = i < CATALOGUE.length ? base.nom : `${base.nom} — ${pick(QUALIFS)}`;
      const id = uuid();
      const price = money(ri(base.min, base.max));
      const cost = money(price * (0.62 + rnd() * 0.2));

      let code = `PF-${String(i + 1).padStart(4, '0')}`;
      while (usedCodes.has(code)) code = `PF-${String(ri(1, 99999)).padStart(4, '0')}`;
      usedCodes.add(code);

      products.push({ id, unit: base.unite, price, cost });
      productRows.push([
        id, tenantId, nom, code, base.unite, price,
        rnd() < 0.4 ? `${nom} — conservation à ${pick(['-18 °C', '-20 °C', '+2 à +4 °C'])}` : null,
        rnd() < 0.97, 'product', cost,
        // L'agrégat de stock part à zéro : il est recalculé depuis les lots en
        // fin de seed, comme le fait recomputeProductStock. Le tirer au hasard
        // recréait la divergence agrégat/lots à l'origine du bug de stock
        // ressuscité — un jeu de démo ne doit pas naître dans un état que
        // l'application interdit.
        0, 0, 0,
        rnd() < 0.5 ? money(ri(50, 400)) : null,
        author, author,
      ]);
    }

    await insertBatch(qr, 'finished_products', [
      'id', 'tenantId', 'name', 'code', 'unit', 'defaultSalesPrice', 'description',
      'isActive', 'type', 'lastCostPerUnit', 'stockQuantity', 'averageCostPerUnit',
      'totalStockValue', 'alertThreshold', 'createdBy', 'updatedBy',
    ], productRows);
    console.log(`Produits  : ${productRows.length}`);

    // ── Grilles tarifaires ────────────────────────────────────────────────────
    // Sans grilles, l'écran est vide et la fonctionnalité invérifiable. Trois
    // niveaux couvrent le cas réel d'un négoce : remise au volume, tarif de
    // détail, et un tarif export sur une part seulement du catalogue — pour
    // montrer que les articles non tarifés retombent bien sur le prix de base.
    const GRILLES = [
      { nom: 'Grossistes', desc: 'Remise volume', coef: 0.85, couverture: 1 },
      { nom: 'Détaillants', desc: 'Tarif boutique', coef: 0.95, couverture: 1 },
      { nom: 'Export', desc: 'Sélection export', coef: 1.12, couverture: 0.4 },
    ] as const;

    const grilleRows: unknown[][] = [];
    const grilleItemRows: unknown[][] = [];
    const grilleIds: string[] = [];

    for (const g of GRILLES) {
      const id = uuid();
      grilleIds.push(id);
      grilleRows.push([id, tenantId, g.nom, g.desc, true, author, author]);

      for (const p of products) {
        if (rnd() > g.couverture) continue;
        grilleItemRows.push([uuid(), tenantId, id, p.id, money(p.price * g.coef)]);
      }
    }

    await insertBatch(qr, 'price_lists', [
      'id', 'tenantId', 'name', 'description', 'isActive', 'createdBy', 'updatedBy',
    ], grilleRows);
    await insertBatch(qr, 'price_list_items', [
      'id', 'tenantId', 'priceListId', 'finishedProductId', 'unitPrice',
    ], grilleItemRows);

    // 45 % des clients sur une grille : le reste reste au tarif de base, sans
    // quoi on ne verrait jamais le comportement par défaut.
    let affectes = 0;
    for (const cid of customerIds) {
      if (rnd() > 0.45) continue;
      await qr.query(`UPDATE partners SET "priceListId" = $1 WHERE id = $2`, [pick(grilleIds), cid]);
      affectes++;
    }

    console.log(`Grilles   : ${grilleRows.length} (${grilleItemRows.length} prix, ${affectes} clients affectés)`);

    // ── Génération des lignes d'un document ───────────────────────────────────
    // Réplique exactement SalesInvoicesService.computeItem : lineTotal est TTC.
    function buildLines(parentId: string, parentCol: string) {
      const count = ri(1, 6);
      const rows: unknown[][] = [];
      let subtotal = 0;
      let taxTotal = 0;

      for (let k = 0; k < count; k++) {
        const p = pick(products);
        const quantity = money(ri(1, 120) + (rnd() < 0.3 ? 0.5 : 0));
        const unitPrice = money(p.price * (0.92 + rnd() * 0.16));
        const lineHT = quantity * unitPrice;
        const taxAmount1 = Math.round(lineHT * (TVA / 100) * 100) / 100;
        const lineTaxTotal = taxAmount1;
        const lineTotal = money(lineHT + lineTaxTotal);

        subtotal += quantity * unitPrice;
        taxTotal += lineTaxTotal;

        rows.push([
          uuid(), tenantId, parentId, p.id, quantity, p.unit, unitPrice,
          'TVA', TVA, taxAmount1, null, null, 0, lineTaxTotal, lineTotal,
        ]);
      }

      subtotal = money(subtotal);
      taxTotal = money(taxTotal);
      return { rows, subtotal, taxAmount: taxTotal, totalAmount: money(subtotal + taxTotal), parentCol };
    }

    const itemCols = (parentCol: string) => [
      'id', 'tenantId', parentCol, 'finishedProductId', 'quantity', 'unit', 'unitPrice',
      'taxName1', 'taxRate1', 'taxAmount1', 'taxName2', 'taxRate2', 'taxAmount2',
      'lineTaxTotal', 'lineTotal',
    ];

    const yy = String(new Date().getFullYear()).slice(-2);
    const pad = (n: number, width: number) => String(n).padStart(width, '0');

    /**
     * Recopie les lignes d'un document vers un autre.
     *
     * Un BL issu d'un devis porte les mêmes articles aux mêmes prix : sans
     * cette recopie, le lien entre les deux documents serait un mensonge —
     * la page détail afficherait « issu du devis DEV-26-050 » au-dessus
     * d'articles qui n'y figurent pas.
     *
     * Disposition d'une ligne : [id, tenantId, parentId, productId, …].
     */
    const clonerLignes = (source: unknown[][], nouveauParent: string) =>
      source.map((l) => [uuid(), tenantId, nouveauParent, ...l.slice(3)]);

    const auPlusTard = (d: Date) => (d > new Date() ? new Date() : d);

    // ── Devis ─────────────────────────────────────────────────────────────────
    // Les devis ne sont pas insérés tout de suite : leur statut dépend de ce
    // qu'ils deviennent. Un devis n'est « converti » que si un BL ou une
    // facture en est réellement issu — c'est la règle qu'applique l'API, et la
    // version précédente du seed la violait sur 74 devis.
    type Devis = {
      id: string; numero: string; customerId: string; date: Date;
      subtotal: number; taxAmount: number; totalAmount: number;
      lignes: unknown[][]; statut: string; notes: string | null;
      versBl: string | null; versFacture: string | null;
    };
    const devis: Devis[] = [];
    const quoteItemRows: unknown[][] = [];
    const quoteWidth = Math.max(3, String(N.quotes).length);

    for (let i = 0; i < N.quotes; i++) {
      const id = uuid();
      const d = dateInWindow();
      const { rows, subtotal, taxAmount, totalAmount } = buildLines(id, 'quoteId');
      quoteItemRows.push(...rows);

      const age = Math.floor((Date.now() - d.getTime()) / 86400000);
      const statut = age > 45 ? pick(['expired', 'rejected', 'accepted'] as const)
        : pick(['draft', 'sent', 'sent', 'accepted', 'rejected'] as const);

      devis.push({
        id, numero: `DEV-${yy}-${pad(i + 1, quoteWidth)}`, customerId: pick(customerIds),
        date: d, subtotal, taxAmount, totalAmount, lignes: rows, statut,
        notes: rnd() < 0.15 ? 'Offre valable 30 jours, franco de port au-delà de 50 000 DA' : null,
        versBl: null, versFacture: null,
      });
    }

    // Vivier des devis qui peuvent donner une suite : seul un devis accepté se
    // transforme, l'API refuse les autres.
    //
    // Le vivier est PARTAGÉ entre les deux débouchés, sinon les BL le vident
    // et plus aucune facture ne descend directement d'un devis — c'est ce qui
    // s'est produit au premier essai : 113 BL issus d'un devis, 0 facture.
    const devisAcceptes = devis.filter((q) => q.statut === 'accepted').sort(() => rnd() - 0.5);
    const coupure = Math.floor(devisAcceptes.length * 0.7);
    const devisPourBl = devisAcceptes.slice(0, coupure);
    const devisPourFacture = devisAcceptes.slice(coupure);

    // ── Bons de livraison ─────────────────────────────────────────────────────
    const dnRows: unknown[][] = [];
    const dnItemRows: unknown[][] = [];
    const dnWidth = Math.max(3, String(N.deliveryNotes).length);

    // BL qui ont réellement quitté le dépôt : eux seuls consomment du stock.
    // Ils servent à dimensionner les achats, puis à consommer les lots en FIFO.
    const sorties: Array<{ dnId: string; lignes: Array<{ productId: string; quantity: number }> }> = [];

    // Un BL sur quatre prolonge un devis accepté : c'est le parcours que vend
    // le produit, et sans lui la colonne « Origine » des écrans reste vide.
    type Bl = {
      id: string; numero: string; customerId: string; date: Date;
      totalAmount: number; statut: string; versFacture: string | null;
    };
    const bls: Bl[] = [];

    for (let i = 0; i < N.deliveryNotes; i++) {
      const id = uuid();
      const source = rnd() < 0.25 ? devisPourBl.find((q) => !q.versBl) : undefined;

      // Un BL ne peut pas précéder le devis dont il découle.
      const d = source ? auPlusTard(addDays(source.date, ri(1, 12))) : dateInWindow();
      const { rows, subtotal, taxAmount, totalAmount } = source
        ? {
            rows: clonerLignes(source.lignes, id),
            subtotal: source.subtotal,
            taxAmount: source.taxAmount,
            totalAmount: source.totalAmount,
          }
        : buildLines(id, 'deliveryNoteId');
      dnItemRows.push(...rows);

      const status = pick(['delivered', 'delivered', 'delivered', 'signed', 'sent', 'draft', 'cancelled'] as const);
      const signe = status === 'signed' || status === 'delivered';

      if (source) {
        source.versBl = id;
        source.statut = 'converted';
      }

      // Tout BL non annulé consomme ses lots, y compris en brouillon : c'est
      // ce que fait `DeliveriesService.create`, dès la création. Le seed ne
      // sortait que les BL livrés ou signés, si bien que la démonstration
      // n'affichait aucune réservation — un état que l'application ne sait
      // pas produire.
      if (status !== 'cancelled') {
        sorties.push({
          dnId: id,
          // rows suit itemCols : [id, tenantId, parentId, productId, quantity, ...]
          lignes: rows.map((r) => ({ productId: r[3] as string, quantity: r[4] as number })),
        });
      }

      // Un seul tirage du client : deux appels à pick() donneraient au BL un
      // client différent de celui enregistré en mémoire pour la suite.
      const clientId = source ? source.customerId : pick(customerIds);
      const numero = `BL-${yy}-${pad(i + 1, dnWidth)}`;

      bls.push({
        id, numero, customerId: clientId,
        date: d, totalAmount, statut: status, versFacture: null,
      });

      dnRows.push([
        id, tenantId, numero, clientId,
        isoDate(d), status, subtotal, taxAmount, totalAmount,
        signe && rnd() < 0.5 ? `${pick(PRENOMS)} ${pick(NOMS)}` : null,
        signe ? isoDate(d) : null,
        rnd() < 0.12 ? pick(['Livraison partielle', 'Camion frigo n° 3', 'Réception par le chef de dépôt']) : null,
        source?.id ?? null,
        author, author, d, d,
      ]);
    }

    // Les devis sont insérés maintenant : leur statut est arrêté, et la clé
    // étrangère delivery_notes.quoteId exige qu'ils existent d'abord.
    await insertBatch(qr, 'quotes', [
      'id', 'tenantId', 'quoteNumber', 'customerId', 'quoteDate', 'expiryDate', 'status',
      'subtotal', 'taxAmount', 'totalAmount', 'notes', 'convertedToDeliveryNoteId',
      'createdBy', 'updatedBy', 'createdAt', 'updatedAt',
    ], devis.map((q) => [
      q.id, tenantId, q.numero, q.customerId, isoDate(q.date), isoDate(addDays(q.date, 30)),
      q.statut, q.subtotal, q.taxAmount, q.totalAmount, q.notes, q.versBl,
      author, author, q.date, q.date,
    ]));
    await insertBatch(qr, 'quote_items', itemCols('quoteId'), quoteItemRows);
    console.log(`Devis     : ${devis.length} (${quoteItemRows.length} lignes, `
      + `${devis.filter((q) => q.versBl).length} convertis en BL)`);

    await insertBatch(qr, 'delivery_notes', [
      'id', 'tenantId', 'blNumber', 'customerId', 'deliveryDate', 'status',
      'subtotal', 'taxAmount', 'total', 'customerSignature', 'signedDate', 'notes',
      'quoteId', 'createdBy', 'updatedBy', 'createdAt', 'updatedAt',
    ], dnRows);
    await insertBatch(qr, 'delivery_note_items', itemCols('deliveryNoteId'), dnItemRows);
    console.log(`BL        : ${dnRows.length} (${dnItemRows.length} lignes, `
      + `${dnRows.filter((r) => r[12]).length} issus d'un devis)`);

    // ── Achats : commandes, réceptions, lots ──────────────────────────────────
    // Le seed ne créait ni commande, ni réception, ni lot : tout le cycle achat
    // et tout le suivi de stock étaient vides, et `stockQuantity` n'était qu'un
    // nombre tiré au hasard que rien ne justifiait.
    //
    // On reconstitue la chaîne réelle — commande → réception → lot — puis on
    // laisse l'agrégat se recalculer depuis les lots. C'est l'ordre qu'impose
    // le schéma : reception_bls."purchaseOrderId" est NOT NULL, et
    // stock_entries référence la réception.
    //
    // Les réceptions d'approvisionnement sont datées AVANT la fenêtre de vente.
    // On achète avant de vendre : la consommation FIFO qui suit devient
    // chronologiquement cohérente, et le stock ne peut pas passer négatif.

    const besoin = new Map<string, number>();
    for (const s of sorties) {
      for (const l of s.lignes) besoin.set(l.productId, (besoin.get(l.productId) ?? 0) + l.quantity);
    }

    type LigneAchat = { product: typeof products[number]; quantity: number; appro: boolean };

    // Une ligne d'approvisionnement par produit, dimensionnée pour couvrir la
    // demande des BL sortis plus une marge : il doit rester du stock après.
    const lignesAppro: LigneAchat[] = products.map((p) => ({
      product: p,
      quantity: money((besoin.get(p.id) ?? 0) * (1.25 + rnd() * 0.35) + ri(20, 400)),
      appro: true,
    }));

    const lignesRecentes: LigneAchat[] = Array.from({ length: N.recentPurchases }, () => ({
      product: pick(products),
      quantity: money(ri(10, 600) + rnd()),
      appro: false,
    }));

    const poRows: unknown[][] = [];
    const poItemRows: unknown[][] = [];
    const recRows: unknown[][] = [];
    // Lots en mémoire : la consommation FIFO les modifie avant l'insertion.
    type Lot = {
      id: string; productId: string; receptionId: string;
      quantity: number; costPerUnit: number;
      batchNumber: string | null; expiresAt: Date | null; enteredAt: Date;
      status: 'available' | 'sold'; deliveryNoteId: string | null;
    };
    const lots: Lot[] = [];

    // Réceptions retenues pour en dériver les factures fournisseurs : un
    // fournisseur facture ce qu'il a livré.
    const receptions: Array<{
      recId: string; poId: string; supplierId: string; receptionDate: Date;
      lignes: Array<{ productId: string; quantity: number; unit: string; unitPrice: number }>;
    }> = [];

    let poSeq = 0;
    let recSeq = 0;

    function creerCommande(lignes: LigneAchat[], appro: boolean) {
      if (!lignes.length) return;

      const poId = uuid();
      const supplierId = pick(supplierIds);
      // Appro : avant la fenêtre de vente. Récent : dans la fenêtre.
      const orderDate = appro
        ? (() => {
            const d = new Date();
            d.setDate(d.getDate() - ri(N.windowDays + 5, N.windowDays + 95));
            d.setHours(ri(8, 17), ri(0, 59), 0, 0);
            return d;
          })()
        : dateInWindow();

      let subtotal = 0;
      let taxTotal = 0;
      const lignesCommande: Array<{ productId: string; quantity: number; unit: string; unitPrice: number }> = [];

      for (const l of lignes) {
        const unitPrice = money(l.product.cost * (0.9 + rnd() * 0.2));
        const lineHT = money(l.quantity * unitPrice);
        const taxAmount = money(lineHT * (TVA / 100));
        subtotal += lineHT;
        taxTotal += taxAmount;

        lignesCommande.push({
          productId: l.product.id, quantity: l.quantity, unit: l.product.unit, unitPrice,
        });
        poItemRows.push([
          uuid(), tenantId, poId, l.product.id, l.quantity, l.product.unit,
          unitPrice, money(lineHT + taxAmount), TVA, taxAmount,
        ]);
      }

      subtotal = money(subtotal);
      taxTotal = money(taxTotal);

      // Une commande d'appro est toujours réceptionnée : sans cela la demande
      // des BL ne serait pas couverte. Les commandes récentes se répartissent
      // entre les statuts pour que l'écran Achats montre un cycle vivant.
      const recue = appro || rnd() < 0.5;
      const status = recue ? 'received' : pick(['draft', 'sent', 'sent', 'cancelled'] as const);

      poRows.push([
        poId, tenantId, `PO-${yy}-${pad(++poSeq, 3)}`, supplierId, status,
        isoDate(orderDate), isoDate(addDays(orderDate, ri(3, 21))),
        subtotal, taxTotal, money(subtotal + taxTotal),
        rnd() < 0.15 ? pick(['Livraison en camion frigorifique', 'Palettes consignées', 'Contrôle qualité à réception']) : null,
        author, author, orderDate, orderDate,
      ]);

      if (!recue) return;

      const receptionDate = addDays(orderDate, ri(1, 12));
      const recId = uuid();
      let totalRecu = 0;

      for (const l of lignes) {
        totalRecu += l.quantity;
        const costPerUnit = money(l.product.cost * (0.92 + rnd() * 0.16));
        lots.push({
          id: uuid(),
          productId: l.product.id,
          receptionId: recId,
          quantity: l.quantity,
          costPerUnit,
          batchNumber: `LOT-${isoDate(receptionDate).replace(/-/g, '')}-${pad(lots.length + 1, 5)}`,
          // Denrées congelées : une date de péremption est la règle, pas
          // l'exception. Quelques lots courts alimentent les alertes.
          expiresAt: rnd() < 0.85
            ? addDays(receptionDate, rnd() < 0.12 ? ri(5, 30) : ri(120, 540))
            : null,
          enteredAt: receptionDate,
          status: 'available',
          deliveryNoteId: null,
        });
      }

      recRows.push([
        recId, tenantId, `BL-REC-${yy}-${pad(++recSeq, 3)}`, poId,
        isoDate(receptionDate), 'completed', money(totalRecu),
        rnd() < 0.12 ? pick(['Chaîne du froid contrôlée à réception', 'Deux palettes refusées, non facturées', 'Réception conforme']) : null,
        author, author, receptionDate, receptionDate,
      ]);

      receptions.push({ recId, poId, supplierId, receptionDate, lignes: lignesCommande });
    }

    // Regroupement en commandes de 1 à 5 lignes.
    for (const groupe of [lignesAppro, lignesRecentes]) {
      const appro = groupe === lignesAppro;
      for (let i = 0; i < groupe.length; ) {
        const taille = Math.min(ri(1, 5), groupe.length - i);
        creerCommande(groupe.slice(i, i + taille), appro);
        i += taille;
      }
    }

    // ── Consommation FIFO des BL sortis ───────────────────────────────────────
    // Réplique consumeStockFifo : le plus ancien lot part en premier, et un lot
    // entamé est scindé — la part sortie devient un lot `sold` rattaché au BL,
    // le reste demeure disponible. Sans cela le stock ne bougerait jamais malgré
    // des centaines de livraisons.

    const lotsParProduit = new Map<string, Lot[]>();
    for (const lot of lots) {
      const l = lotsParProduit.get(lot.productId) ?? [];
      l.push(lot);
      lotsParProduit.set(lot.productId, l);
    }
    for (const l of lotsParProduit.values()) {
      l.sort((a, b) => a.enteredAt.getTime() - b.enteredAt.getTime());
    }

    const lotsSortis: Lot[] = [];
    let nonCouvert = 0;

    for (const sortie of sorties) {
      for (const ligne of sortie.lignes) {
        let reste = ligne.quantity;
        const dispo = lotsParProduit.get(ligne.productId) ?? [];

        for (const lot of dispo) {
          if (reste <= 0) break;
          if (lot.status !== 'available' || lot.quantity <= 0) continue;

          if (lot.quantity <= reste) {
            reste = money(reste - lot.quantity);
            lot.status = 'sold';
            lot.deliveryNoteId = sortie.dnId;
          } else {
            const consomme = money(reste);
            lot.quantity = money(lot.quantity - consomme);
            lotsSortis.push({
              ...lot, id: uuid(), quantity: consomme,
              status: 'sold', deliveryNoteId: sortie.dnId,
            });
            reste = 0;
          }
        }
        if (reste > 0.01) nonCouvert++;
      }
    }

    const tousLesLots = [...lots, ...lotsSortis];

    await insertBatch(qr, 'purchase_orders', [
      'id', 'tenantId', 'poNumber', 'supplierId', 'status', 'orderDate',
      'expectedDeliveryDate', 'subtotal', 'taxAmount', 'total', 'notes',
      'createdBy', 'updatedBy', 'createdAt', 'updatedAt',
    ], poRows);
    await insertBatch(qr, 'purchase_order_items', [
      'id', 'tenantId', 'purchaseOrderId', 'rawMaterialId', 'quantity', 'unit',
      'unitPrice', 'lineTotal', 'taxRate', 'taxAmount',
    ], poItemRows);
    await insertBatch(qr, 'reception_bls', [
      'id', 'tenantId', 'blNumber', 'purchaseOrderId', 'receptionDate', 'status',
      'totalQuantityReceived', 'notes', 'createdBy', 'updatedBy', 'createdAt', 'updatedAt',
    ], recRows);
    await insertBatch(qr, 'stock_entries', [
      'id', 'tenantId', 'rawMaterialId', 'finishedProductId', 'receptionBlId',
      'quantity', 'costPerUnit', 'totalCost', 'batchNumber', 'expiresAt',
      'status', 'reservedByDeliveryNoteId', 'enteredAt', 'createdBy',
    ], tousLesLots.map((l) => [
      l.id, tenantId, l.productId, l.productId, l.receptionId,
      l.quantity, l.costPerUnit, money(l.quantity * l.costPerUnit),
      l.batchNumber, l.expiresAt, l.status, l.deliveryNoteId, l.enteredAt, author,
    ]));

    console.log(`Commandes : ${poRows.length} (${poItemRows.length} lignes)`);
    console.log(`Réceptions: ${recRows.length}`);
    console.log(`Lots      : ${tousLesLots.length} (${lotsSortis.length + lots.filter(l => l.status === 'sold').length} sortis)`);
    if (nonCouvert > 0) console.log(`  ⚠️  ${nonCouvert} ligne(s) de BL non couverte(s) par le stock`);

    // ── Agrégat de stock recalculé depuis les lots ────────────────────────────
    // Même règle que recomputeProductStock, en une passe ensembliste : l'agrégat
    // est un cache de lecture, jamais une donnée d'origine.
    await qr.query(
      `UPDATE finished_products fp
       SET "stockQuantity"          = COALESCE(a.qte, 0),
           "totalStockValue"        = COALESCE(a.valeur, 0),
           "averageCostPerUnit"     = CASE WHEN COALESCE(a.qte, 0) > 0
                                           THEN round(a.valeur / a.qte, 2) ELSE 0 END,
           "earliestExpirationDate" = a.peremption
       FROM (
         SELECT p.id,
                SUM(se.quantity)    AS qte,
                SUM(se."totalCost") AS valeur,
                MIN(se."expiresAt") AS peremption
         FROM finished_products p
         LEFT JOIN stock_entries se
           ON se."finishedProductId" = p.id
          AND se.status = 'available'
          AND se."deletedAt" IS NULL
         WHERE p."tenantId" = $1
         GROUP BY p.id
       ) a
       WHERE fp.id = a.id AND fp."tenantId" = $1`,
      [tenantId],
    );

    // lastCostPerUnit : coût du dernier lot entré, comme le fait la réception.
    await qr.query(
      `UPDATE finished_products fp
       SET "lastCostPerUnit" = d."costPerUnit"
       FROM (
         SELECT DISTINCT ON ("finishedProductId") "finishedProductId", "costPerUnit"
         FROM stock_entries
         WHERE "tenantId" = $1
         ORDER BY "finishedProductId", "enteredAt" DESC
       ) d
       WHERE fp.id = d."finishedProductId" AND fp."tenantId" = $1`,
      [tenantId],
    );

    // ── Factures fournisseurs et règlements ───────────────────────────────────
    // C'est le bout du cycle achat que ni Invoice Ninja ni Erplain ne couvrent
    // (cf. docs/BENCHMARK.md) : la dette fournisseur. Le laisser vide privait la
    // démo de ce qui nous distingue.
    //
    // Une facture par réception : le fournisseur facture ce qu'il a livré. Les
    // lignes reprennent celles de la commande, et la facture porte le lien vers
    // la commande ET la réception, comme le fait createVendorBill.

    const vbRows: unknown[][] = [];
    const vbItemRows: unknown[][] = [];
    const vpRows: unknown[][] = [];
    let vbSeq = 0;

    for (const rec of receptions) {
      const billId = uuid();
      // Le fournisseur facture quelques jours après la livraison.
      const billDate = addDays(rec.receptionDate, ri(0, 12));
      const dueDate = addDays(billDate, pick([30, 30, 45, 60] as const));

      let subtotal = 0;
      let taxTotal = 0;

      for (const l of rec.lignes) {
        const lineHT = money(l.quantity * l.unitPrice);
        const taxAmount = money(lineHT * (TVA / 100));
        subtotal += lineHT;
        taxTotal += taxAmount;

        vbItemRows.push([
          uuid(), tenantId, billId, l.productId, null,
          l.quantity, l.unit, l.unitPrice, TVA, taxAmount, money(lineHT + taxAmount),
        ]);
      }

      subtotal = money(subtotal);
      taxTotal = money(taxTotal);
      const totalAmount = money(subtotal + taxTotal);

      // Répartition : la majorité est réglée, une part reste due — dont des
      // factures échues, sans quoi la notion de dette fournisseur ne se voit
      // nulle part. `draft` couvre les factures saisies mais pas encore
      // validées ; elles ne peuvent pas recevoir de règlement (recordVendorPayment
      // n'accepte que validated et partial).
      const echue = dueDate.getTime() < Date.now();
      const statut = rnd() < 0.06
        ? pick(['draft', 'cancelled'] as const)
        : echue
          // Une entreprise qui tourne solde l'essentiel de ses anciennes
          // factures : le retard doit rester une minorité visible, pas la règle.
          ? pick(['paid', 'paid', 'paid', 'paid', 'paid', 'paid', 'partial', 'validated'] as const)
          : pick(['paid', 'partial', 'validated', 'validated'] as const);

      let amountPaid = 0;
      if (statut === 'paid') {
        amountPaid = totalAmount;
      } else if (statut === 'partial') {
        // Strictement entre 0 et le total : sinon le statut contredirait le solde.
        amountPaid = money(totalAmount * (0.2 + rnd() * 0.5));
        if (amountPaid <= 0 || amountPaid >= totalAmount) amountPaid = money(totalAmount / 2);
      }
      const amountDue = money(totalAmount - amountPaid);

      // Les règlements sont générés à partir du montant réglé, jamais l'inverse :
      // c'est leur somme qui doit faire amountPaid, comme côté ventes.
      if (amountPaid > 0) {
        const nb = statut === 'paid' && rnd() < 0.35 ? 2 : 1;
        let reste = amountPaid;
        for (let k = 0; k < nb; k++) {
          const montant = k === nb - 1 ? money(reste) : money(amountPaid * (0.3 + rnd() * 0.3));
          if (montant <= 0) continue;
          reste = money(reste - montant);
          const pDate = addDays(billDate, ri(2, 55));
          vpRows.push([
            uuid(), tenantId, billId, montant, isoDate(pDate),
            pick(['bank_transfer', 'bank_transfer', 'cheque', 'cash', 'other'] as const),
            rnd() < 0.7 ? `${pick(['VIR', 'CHQ', 'ESP'])}-${digits(8)}` : null,
            author, pDate,
          ]);
        }
      }

      vbRows.push([
        billId, tenantId, `FAC-ACH-${yy}-${pad(++vbSeq, 3)}`, rec.supplierId,
        rec.poId, rec.recId, isoDate(billDate), isoDate(dueDate),
        subtotal, taxTotal, totalAmount, amountPaid, amountDue, statut,
        rnd() < 0.12 ? pick(['Facture reçue par courrier', 'Escompte 2 % appliqué', 'À rapprocher du BL de réception']) : null,
        author, author, billDate, billDate,
      ]);

    }

    await insertBatch(qr, 'vendor_bills', [
      'id', 'tenantId', 'billNumber', 'supplierId', 'purchaseOrderId', 'receptionBlId',
      'billDate', 'dueDate', 'subtotal', 'taxAmount', 'totalAmount', 'amountPaid',
      'amountDue', 'status', 'notes', 'createdBy', 'updatedBy', 'createdAt', 'updatedAt',
    ], vbRows);
    await insertBatch(qr, 'vendor_bill_items', [
      'id', 'tenantId', 'vendorBillId', 'finishedProductId', 'description',
      'quantity', 'unit', 'unitPrice', 'taxRate', 'taxAmount', 'lineTotal',
    ], vbItemRows);
    await insertBatch(qr, 'vendor_payments', [
      'id', 'tenantId', 'vendorBillId', 'amount', 'paymentDate', 'method',
      'reference', 'createdBy', 'createdAt',
    ], vpRows);

    // Facturer une commande la fait passer en `invoiced` (createVendorBill), et
    // annuler la facture la ramène à `received` (patchVendorBillStatus). Laisser
    // toutes les commandes en `received` aurait donné une démo que
    // l'application elle-même n'aurait jamais produite.
    await qr.query(
      `UPDATE purchase_orders po
       SET status = 'invoiced', "updatedAt" = NOW()
       WHERE po."tenantId" = $1
         AND EXISTS (SELECT 1 FROM vendor_bills b
                     WHERE b."purchaseOrderId" = po.id AND b.status <> 'cancelled')`,
      [tenantId],
    );

    // La dette exclut les factures annulées : elles ne sont dues à personne.
    const dette = vbRows
      .filter((r) => r[13] !== 'cancelled')
      .reduce((s, r) => s + (r[12] as number), 0);
    console.log(`Fact. four: ${vbRows.length} (${vbItemRows.length} lignes, ${vpRows.length} règlements)`);
    console.log(`  Dette fournisseur : ${money(dette).toLocaleString('fr-DZ')} DA`);

    // ── Factures ──────────────────────────────────────────────────────────────
    // Les paiements sont générés d'abord, puis amountPaid en découle : c'est ce
    // qui garantit que Σ paiements == amountPaid, invariant vérifié plus bas.
    type Inv = {
      id: string; number: string; customerId: string; date: Date; due: Date;
      subtotal: number; taxAmount: number; totalAmount: number;
      blId: string | null; devisId: string | null;
    };
    const invoices: Inv[] = [];
    const invItemRows: unknown[][] = [];
    const invWidth = Math.max(3, String(N.invoices).length);

    // Un BL livré ou signé se facture ; un devis accepté peut être facturé
    // directement, sans passer par un BL. Les deux parcours existent dans
    // l'application, les deux doivent exister dans la démonstration.
    const blsFacturables = bls
      .filter((b) => b.statut === 'delivered' || b.statut === 'signed')
      .sort(() => rnd() - 0.5);
    let curseurBl = 0;

    for (let i = 0; i < N.invoices; i++) {
      const id = uuid();

      const depuisBl = rnd() < 0.3 && curseurBl < blsFacturables.length
        ? blsFacturables[curseurBl++]
        : undefined;
      const depuisDevis = !depuisBl && rnd() < 0.4
        ? devisPourFacture.find((q) => !q.versFacture)
        : undefined;

      const sourceLignes = depuisBl
        ? dnItemRows.filter((l) => l[2] === depuisBl.id)
        : depuisDevis?.lignes;

      const d = depuisBl ? auPlusTard(addDays(depuisBl.date, ri(0, 7)))
        : depuisDevis ? auPlusTard(addDays(depuisDevis.date, ri(1, 15)))
        : dateInWindow();

      const { rows, subtotal, taxAmount, totalAmount } = sourceLignes
        ? {
            rows: clonerLignes(sourceLignes, id),
            // Les totaux sont recopiés de la source : les recalculer ferait
            // apparaître un écart d'arrondi entre le BL et sa facture, que
            // personne ne saurait expliquer.
            subtotal: depuisBl
              ? Number(dnRows.find((r) => r[0] === depuisBl.id)![6])
              : depuisDevis!.subtotal,
            taxAmount: depuisBl
              ? Number(dnRows.find((r) => r[0] === depuisBl.id)![7])
              : depuisDevis!.taxAmount,
            totalAmount: depuisBl ? depuisBl.totalAmount : depuisDevis!.totalAmount,
          }
        : buildLines(id, 'salesInvoiceId');

      invItemRows.push(...rows);

      if (depuisBl) depuisBl.versFacture = id;
      if (depuisDevis) { depuisDevis.versFacture = id; depuisDevis.statut = 'converted'; }

      invoices.push({
        id, number: `FAC-${yy}-${pad(i + 1, invWidth)}`,
        customerId: depuisBl?.customerId ?? depuisDevis?.customerId ?? pick(customerIds),
        date: d, due: addDays(d, pick([15, 30, 30, 45, 60])),
        subtotal, taxAmount, totalAmount,
        blId: depuisBl?.id ?? null, devisId: depuisDevis?.id ?? null,
      });
    }

    // Paiements — répartis sur un sous-ensemble de factures
    const paymentRows: unknown[][] = [];
    const paid = new Map<string, number>();
    const payable = [...invoices].sort(() => rnd() - 0.5);

    let emitted = 0;
    for (const inv of payable) {
      if (emitted >= N.payments) break;
      const nb = rnd() < 0.25 ? 2 : 1;
      const full = rnd() < 0.7;
      let remaining = full ? inv.totalAmount : money(inv.totalAmount * (0.2 + rnd() * 0.5));
      let sum = 0;

      for (let k = 0; k < nb && emitted < N.payments; k++) {
        const last = k === nb - 1;
        const amount = last ? money(remaining - sum) : money(remaining * (0.4 + rnd() * 0.2));
        if (amount <= 0) break;
        sum += amount;
        emitted++;

        const pd = new Date(inv.date.getTime() + ri(1, 40) * 86400000);
        const payDate = pd > new Date() ? new Date() : pd;
        const method = pick(['cash', 'bank_transfer', 'bank_transfer', 'cheque', 'other'] as const);

        paymentRows.push([
          uuid(), tenantId, inv.id, amount, isoDate(payDate), method,
          method === 'cheque' ? `CHQ-${digits(7)}`
            : method === 'bank_transfer' ? `VIR-${digits(9)}` : null,
          null, author, author, payDate, payDate,
        ]);
      }
      if (sum > 0) paid.set(inv.id, money((paid.get(inv.id) ?? 0) + sum));
    }

    const now = new Date();

    // ── Avoirs ────────────────────────────────────────────────────────────────
    // Un avoir imputé éteint une part de la facture : creditedAmount monte,
    // amountDue baisse d'autant. Les avoirs sont donc calculés AVANT les lignes
    // de factures, comme les paiements — c'est le document qui fait le solde,
    // jamais l'inverse.
    //
    // On ne crédite que des factures émises et encore dues : `issue` refuse le
    // brouillon et refuse de dépasser le solde restant.
    const cnRows: unknown[][] = [];
    const cnItemRows: unknown[][] = [];
    const credite = new Map<string, number>();
    let cnSeq = 0;

    const creditables = invoices
      .filter((inv) => money(inv.totalAmount - (paid.get(inv.id) ?? 0)) > 1)
      .sort(() => rnd() - 0.5)
      .slice(0, N.creditNotes);

    for (const inv of creditables) {
      const soldeDu = money(inv.totalAmount - (paid.get(inv.id) ?? 0));
      const cnId = uuid();
      const d = new Date(Math.min(inv.date.getTime() + ri(2, 45) * 86400000, now.getTime()));

      // Le TTC de l'avoir est plafonné au solde dû ; on part du HT pour que
      // subtotal + TVA retombe exactement dessus.
      const partTTC = money(soldeDu * (rnd() < 0.3 ? 1 : 0.15 + rnd() * 0.5));
      const ht = money(partTTC / (1 + TVA / 100));
      const taxe = money(partTTC - ht);
      const motif = pick([
        'Retour marchandise non conforme',
        'Erreur de facturation',
        'Rupture de chaîne du froid constatée',
        'Remise commerciale exceptionnelle',
        'Casse constatée à la livraison',
      ] as const);

      // 8 % restent en brouillon ou annulés : eux n'ont aucun effet sur le solde.
      const statut = rnd() < 0.08 ? pick(['draft', 'cancelled'] as const) : 'applied';
      if (statut === 'applied') credite.set(inv.id, partTTC);

      cnItemRows.push([
        uuid(), tenantId, cnId, motif, 1, 'unité', ht, 'TVA', TVA, taxe, taxe, partTTC,
      ]);
      cnRows.push([
        cnId, tenantId, `AV-${yy}-${pad(++cnSeq, 3)}`, inv.customerId, inv.id,
        isoDate(d), motif,
        rnd() < 0.2 ? 'Avoir établi après contrôle contradictoire' : null,
        ht, taxe, partTTC, statut, author, author, d, d,
      ]);
    }

    await insertBatch(qr, 'credit_notes', [
      'id', 'tenantId', 'creditNoteNumber', 'customerId', 'salesInvoiceId',
      'creditNoteDate', 'reason', 'notes', 'subtotal', 'taxAmount', 'totalAmount',
      'status', 'createdBy', 'updatedBy', 'createdAt', 'updatedAt',
    ], cnRows);
    await insertBatch(qr, 'credit_note_items', [
      'id', 'tenantId', 'creditNoteId', 'description', 'quantity', 'unit',
      'unitPrice', 'taxName1', 'taxRate1', 'taxAmount1', 'lineTaxTotal', 'lineTotal',
    ], cnItemRows);

    const totalCredite = [...credite.values()].reduce((s, v) => s + v, 0);
    console.log(`Avoirs    : ${cnRows.length} (${credite.size} imputés, ${money(totalCredite).toLocaleString('fr-DZ')} DA)`);

    const invRows = invoices.map((inv) => {
      const amountPaid = money(paid.get(inv.id) ?? 0);
      const creditedAmount = money(credite.get(inv.id) ?? 0);
      const amountDue = money(inv.totalAmount - amountPaid - creditedAmount);

      let status: string;
      if (amountDue <= 0) status = 'paid';
      else if (amountPaid > 0 || creditedAmount > 0) status = 'partial';
      else if (inv.due < now) status = 'overdue';
      else status = pick(['sent', 'sent', 'draft'] as const);

      return [
        inv.id, tenantId, inv.number, inv.customerId, inv.date, isoDate(inv.due), status,
        inv.subtotal, inv.taxAmount, inv.totalAmount, amountPaid, creditedAmount, amountDue,
        rnd() < 0.1 ? 'Facture émise au titre du contrat annuel' : null,
        inv.blId, inv.devisId,
        author, author, inv.date, inv.date,
      ];
    });

    await insertBatch(qr, 'sales_invoices', [
      'id', 'tenantId', 'invoiceNumber', 'customerId', 'invoiceDate', 'dueDate', 'status',
      'subtotal', 'taxAmount', 'totalAmount', 'amountPaid', 'creditedAmount', 'amountDue', 'notes',
      'deliveryNoteId', 'quoteId',
      'createdBy', 'updatedBy', 'createdAt', 'updatedAt',
    ], invRows);
    await insertBatch(qr, 'sales_invoice_items', itemCols('salesInvoiceId'), invItemRows);

    // Le retour BL → facture et devis → facture ne peut être posé qu'ici : les
    // deux tables se référencent mutuellement, l'une des deux flèches doit
    // forcément attendre. L'API procède exactement ainsi lorsqu'elle facture
    // un BL.
    const versFacture = invoices.filter((inv) => inv.blId);
    for (const inv of versFacture) {
      await qr.query(
        `UPDATE delivery_notes SET "convertedToInvoiceId" = $1 WHERE id = $2 AND "tenantId" = $3`,
        [inv.id, inv.blId, tenantId],
      );
    }
    const devisFactures = invoices.filter((inv) => inv.devisId);
    for (const inv of devisFactures) {
      await qr.query(
        `UPDATE quotes SET "convertedToInvoiceId" = $1, status = 'converted'
         WHERE id = $2 AND "tenantId" = $3`,
        [inv.id, inv.devisId, tenantId],
      );
    }

    console.log(`Factures  : ${invRows.length} (${invItemRows.length} lignes, `
      + `${versFacture.length} issues d'un BL, ${devisFactures.length} d'un devis)`);

    await insertBatch(qr, 'payments', [
      'id', 'tenantId', 'salesInvoiceId', 'amount', 'paymentDate', 'paymentMethod',
      'reference', 'notes', 'createdBy', 'updatedBy', 'createdAt', 'updatedAt',
    ], paymentRows);
    console.log(`Paiements : ${paymentRows.length}`);

    // ── Dépenses ──────────────────────────────────────────────────────────────
    const expenseRows: unknown[][] = [];
    for (let i = 0; i < N.expenses; i++) {
      const cat = pick(CATEGORIES_DEPENSE);
      const d = dateInWindow();
      const approuve = rnd() < 0.75;
      expenseRows.push([
        uuid(), tenantId, isoDate(d), pick(LIBELLES_DEPENSE[cat]), cat,
        money(ri(3000, 480000)),
        rnd() < 0.15 ? 'Justificatif archivé' : null,
        approuve, approuve ? author : null, approuve ? d : null,
        author, author, d, d,
      ]);
    }

    await insertBatch(qr, 'expenses', [
      'id', 'tenantId', 'expenseDate', 'description', 'category', 'amount', 'notes',
      'isApproved', 'approvedBy', 'approvedAt', 'createdBy', 'updatedBy',
      'createdAt', 'updatedAt',
    ], expenseRows);
    console.log(`Dépenses  : ${expenseRows.length}`);

    // ── Compteurs de documents ────────────────────────────────────────────────
    // Le seed écrit les numéros directement, sans passer par le service de
    // numérotation. Sans ce rattrapage, le premier document créé depuis
    // l'application repartirait à 1 et heurterait l'index unique — panne
    // garantie à la première démonstration.
    const compteurs: [string, string, string][] = [
      ['invoice', 'sales_invoices', 'invoiceNumber'],
      ['delivery_note', 'delivery_notes', 'blNumber'],
      ['quote', 'quotes', 'quoteNumber'],
      ['purchase_order', 'purchase_orders', 'poNumber'],
      ['reception', 'reception_bls', 'blNumber'],
      ['vendor_bill', 'vendor_bills', 'billNumber'],
      ['credit_note', 'credit_notes', 'creditNoteNumber'],
    ];
    for (const [kind, table, colonne] of compteurs) {
      await qr.query(
        `INSERT INTO document_counters ("tenantId", "kind", "year", "lastValue")
         SELECT "tenantId", '${kind}', EXTRACT(YEAR FROM "createdAt")::int,
                MAX(regexp_replace("${colonne}", '^.*-', '')::int)
         FROM "${table}"
         WHERE "tenantId" = $1 AND "${colonne}" ~ '-[0-9]+$'
         GROUP BY "tenantId", EXTRACT(YEAR FROM "createdAt")
         ON CONFLICT ("tenantId", "kind", "year") DO UPDATE
           SET "lastValue" = GREATEST(document_counters."lastValue", EXCLUDED."lastValue")`,
        [tenantId],
      );
    }
    const [{ n: nbCompteurs }] = await qr.query(
      `SELECT count(*)::int AS n FROM document_counters WHERE "tenantId" = $1`,
      [tenantId],
    );
    console.log(`Compteurs : ${nbCompteurs}`);

    // ── Contrôles d'intégrité avant commit ────────────────────────────────────
    const checks: Array<{ label: string; sql: string }> = [
      {
        label: 'Factures : subtotal + taxAmount = totalAmount',
        sql: `SELECT count(*)::int AS n FROM sales_invoices
              WHERE "tenantId" = $1
                AND round("subtotal" + "taxAmount", 2) <> round("totalAmount", 2)`,
      },
      {
        // L'invariant intègre désormais les avoirs : un avoir imputé éteint une
        // part de la facture sans qu'aucun encaissement n'ait eu lieu.
        label: 'Factures : amountPaid + creditedAmount + amountDue = totalAmount',
        sql: `SELECT count(*)::int AS n FROM sales_invoices
              WHERE "tenantId" = $1
                AND round("amountPaid" + "creditedAmount" + "amountDue", 2)
                    <> round("totalAmount", 2)`,
      },
      // On ne compare pas totalAmount à Σ lineTotal : chaque ligne arrondit
      // (HT + taxe) séparément, alors que computeTotals fait round(Σ HT) + round(Σ taxes).
      // Les deux diffèrent légitimement de quelques centimes. On vérifie donc les
      // deux invariants que l'application garantit réellement.
      {
        label: 'Factures : subtotal = Σ (quantité × prix unitaire)',
        sql: `SELECT count(*)::int AS n FROM (
                SELECT i.id
                FROM sales_invoices i
                JOIN sales_invoice_items it ON it."salesInvoiceId" = i.id
                WHERE i."tenantId" = $1
                GROUP BY i.id, i."subtotal"
                HAVING abs(sum(it."quantity" * it."unitPrice") - i."subtotal") > 0.01
              ) x`,
      },
      {
        label: 'Factures : taxAmount = Σ lineTaxTotal',
        sql: `SELECT count(*)::int AS n FROM (
                SELECT i.id
                FROM sales_invoices i
                JOIN sales_invoice_items it ON it."salesInvoiceId" = i.id
                WHERE i."tenantId" = $1
                GROUP BY i.id, i."taxAmount"
                HAVING abs(sum(it."lineTaxTotal") - i."taxAmount") > 0.01
              ) x`,
      },
      {
        label: 'Lignes : lineTotal = HT + taxes',
        sql: `SELECT count(*)::int AS n FROM sales_invoice_items
              WHERE "tenantId" = $1
                AND abs(("quantity" * "unitPrice" + "lineTaxTotal") - "lineTotal") > 0.01`,
      },
      {
        label: 'Toute facture a au moins une ligne',
        sql: `SELECT count(*)::int AS n FROM sales_invoices i
              WHERE i."tenantId" = $1
                AND NOT EXISTS (
                  SELECT 1 FROM sales_invoice_items it WHERE it."salesInvoiceId" = i.id
                )`,
      },

      // ── Chaîne devis → BL → facture ──────────────────────────────────────
      // La version précédente du seed produisait 74 devis « convertis » qui ne
      // pointaient vers rien, et pas une seule facture rattachée à son BL.
      {
        label: 'Chaîne : un devis converti a une suite',
        sql: `SELECT count(*)::int AS n FROM quotes
              WHERE "tenantId" = $1 AND status = 'converted'
                AND "convertedToInvoiceId" IS NULL
                AND "convertedToDeliveryNoteId" IS NULL`,
      },
      {
        label: 'Chaîne : un devis avec une suite est au statut converti',
        sql: `SELECT count(*)::int AS n FROM quotes
              WHERE "tenantId" = $1 AND status <> 'converted'
                AND ("convertedToInvoiceId" IS NOT NULL
                     OR "convertedToDeliveryNoteId" IS NOT NULL)`,
      },
      {
        label: 'Chaîne : la facture et son BL portent le même client',
        sql: `SELECT count(*)::int AS n FROM sales_invoices i
              JOIN delivery_notes bl ON bl.id = i."deliveryNoteId"
              WHERE i."tenantId" = $1 AND i."customerId" <> bl."customerId"`,
      },
      {
        label: 'Chaîne : le BL et son devis portent le même client',
        sql: `SELECT count(*)::int AS n FROM delivery_notes bl
              JOIN quotes q ON q.id = bl."quoteId"
              WHERE bl."tenantId" = $1 AND bl."customerId" <> q."customerId"`,
      },
      {
        label: 'Chaîne : la facture et son BL portent le même total',
        sql: `SELECT count(*)::int AS n FROM sales_invoices i
              JOIN delivery_notes bl ON bl.id = i."deliveryNoteId"
              WHERE i."tenantId" = $1
                AND abs(i."totalAmount" - bl."total") > 0.01`,
      },
      {
        label: 'Chaîne : le retour BL → facture est réciproque',
        sql: `SELECT count(*)::int AS n FROM sales_invoices i
              JOIN delivery_notes bl ON bl.id = i."deliveryNoteId"
              WHERE i."tenantId" = $1 AND bl."convertedToInvoiceId" IS DISTINCT FROM i.id`,
      },
      {
        label: 'Chaîne : un document ne précède pas celui dont il découle',
        sql: `SELECT count(*)::int AS n FROM sales_invoices i
              JOIN delivery_notes bl ON bl.id = i."deliveryNoteId"
              WHERE i."tenantId" = $1 AND i."invoiceDate"::date < bl."deliveryDate"`,
      },
      {
        label: 'Chaîne : un BL n\'est facturé qu\'une fois',
        sql: `SELECT count(*)::int AS n FROM (
                SELECT "deliveryNoteId" FROM sales_invoices
                WHERE "tenantId" = $1 AND "deliveryNoteId" IS NOT NULL
                GROUP BY "deliveryNoteId" HAVING count(*) > 1
              ) x`,
      },
      {
        label: 'Chaîne : au moins une facture est issue d\'un BL',
        sql: `SELECT CASE WHEN count(*) > 0 THEN 0 ELSE 1 END::int AS n
              FROM sales_invoices
              WHERE "tenantId" = $1 AND "deliveryNoteId" IS NOT NULL`,
      },
      {
        label: 'Paiements : somme par facture = amountPaid',
        sql: `SELECT count(*)::int AS n FROM (
                SELECT i.id
                FROM sales_invoices i
                JOIN payments p ON p."salesInvoiceId" = i.id
                WHERE i."tenantId" = $1
                GROUP BY i.id, i."amountPaid"
                HAVING round(sum(p.amount), 2) <> round(i."amountPaid", 2)
              ) x`,
      },
      {
        label: 'Statuts cohérents avec le solde',
        sql: `SELECT count(*)::int AS n FROM sales_invoices
              WHERE "tenantId" = $1
                AND (("status" = 'paid' AND "amountDue" > 0)
                  OR ("status" = 'partial'
                      AND (("amountPaid" <= 0 AND "creditedAmount" <= 0) OR "amountDue" <= 0))
                  OR ("status" IN ('sent','draft','overdue')
                      AND ("amountPaid" > 0 OR "creditedAmount" > 0)))`,
      },
      {
        label: 'Aucun document orphelin (client inexistant)',
        sql: `SELECT count(*)::int AS n FROM sales_invoices i
              WHERE i."tenantId" = $1
                AND NOT EXISTS (SELECT 1 FROM partners p WHERE p.id = i."customerId")`,
      },
      // ── Stock ──────────────────────────────────────────────────────────────
      // L'invariant central : l'agrégat n'est qu'un cache des lots disponibles.
      // C'est sa violation qui avait fait ressusciter du stock déjà livré.
      {
        label: 'Stock : stockQuantity = Σ lots disponibles',
        sql: `SELECT count(*)::int AS n FROM (
                SELECT p.id
                FROM finished_products p
                LEFT JOIN stock_entries se
                  ON se."finishedProductId" = p.id
                 AND se.status = 'available' AND se."deletedAt" IS NULL
                WHERE p."tenantId" = $1
                GROUP BY p.id, p."stockQuantity"
                HAVING abs(COALESCE(sum(se.quantity), 0) - p."stockQuantity") > 0.01
              ) x`,
      },
      {
        label: 'Stock : totalStockValue = Σ coût des lots disponibles',
        sql: `SELECT count(*)::int AS n FROM (
                SELECT p.id
                FROM finished_products p
                LEFT JOIN stock_entries se
                  ON se."finishedProductId" = p.id
                 AND se.status = 'available' AND se."deletedAt" IS NULL
                WHERE p."tenantId" = $1
                GROUP BY p.id, p."totalStockValue"
                HAVING abs(COALESCE(sum(se."totalCost"), 0) - p."totalStockValue") > 0.01
              ) x`,
      },
      {
        label: 'Stock : aucune quantité négative ou nulle sur un lot',
        sql: `SELECT count(*)::int AS n FROM stock_entries
              WHERE "tenantId" = $1 AND quantity <= 0`,
      },
      {
        label: 'Stock : totalCost = quantité × coût unitaire',
        sql: `SELECT count(*)::int AS n FROM stock_entries
              WHERE "tenantId" = $1
                AND abs(quantity * "costPerUnit" - "totalCost") > 0.01`,
      },
      {
        label: 'Stock : les deux colonnes produit sont renseignées et égales',
        sql: `SELECT count(*)::int AS n FROM stock_entries
              WHERE "tenantId" = $1
                AND ("rawMaterialId" IS DISTINCT FROM "finishedProductId"
                  OR "finishedProductId" IS NULL)`,
      },
      {
        label: 'Stock : tout lot sorti est rattaché à un BL',
        sql: `SELECT count(*)::int AS n FROM stock_entries se
              WHERE se."tenantId" = $1 AND se.status = 'sold'
                AND (se."reservedByDeliveryNoteId" IS NULL
                  OR NOT EXISTS (SELECT 1 FROM delivery_notes dn
                                 WHERE dn.id = se."reservedByDeliveryNoteId"))`,
      },
      {
        // `invoiced` autant que `received` : une commande facturée reste une
        // commande reçue, elle a seulement avancé d'un cran dans le cycle.
        label: 'Achats : toute réception porte sur une commande reçue ou facturée',
        sql: `SELECT count(*)::int AS n FROM reception_bls r
              WHERE r."tenantId" = $1
                AND NOT EXISTS (SELECT 1 FROM purchase_orders po
                                WHERE po.id = r."purchaseOrderId"
                                  AND po.status IN ('received', 'invoiced'))`,
      },
      {
        label: 'Achats : toute commande a au moins une ligne',
        sql: `SELECT count(*)::int AS n FROM purchase_orders po
              WHERE po."tenantId" = $1
                AND NOT EXISTS (SELECT 1 FROM purchase_order_items i
                                WHERE i."purchaseOrderId" = po.id)`,
      },
      {
        label: 'Achats : toute commande reçue ou facturée a une réception',
        sql: `SELECT count(*)::int AS n FROM purchase_orders po
              WHERE po."tenantId" = $1 AND po.status IN ('received', 'invoiced')
                AND NOT EXISTS (SELECT 1 FROM reception_bls r
                                WHERE r."purchaseOrderId" = po.id)`,
      },
      {
        label: 'Achats : subtotal + taxAmount = total',
        sql: `SELECT count(*)::int AS n FROM purchase_orders
              WHERE "tenantId" = $1
                AND abs("subtotal" + "taxAmount" - "total") > 0.01`,
      },
      // ── Factures fournisseurs ──────────────────────────────────────────────
      {
        label: 'Fact. four. : amountPaid + amountDue = totalAmount',
        sql: `SELECT count(*)::int AS n FROM vendor_bills
              WHERE "tenantId" = $1
                AND abs("amountPaid" + "amountDue" - "totalAmount") > 0.01`,
      },
      {
        label: 'Fact. four. : subtotal + taxAmount = totalAmount',
        sql: `SELECT count(*)::int AS n FROM vendor_bills
              WHERE "tenantId" = $1
                AND abs("subtotal" + "taxAmount" - "totalAmount") > 0.01`,
      },
      {
        label: 'Fact. four. : totalAmount = Σ lineTotal',
        sql: `SELECT count(*)::int AS n FROM (
                SELECT b.id
                FROM vendor_bills b
                JOIN vendor_bill_items i ON i."vendorBillId" = b.id
                WHERE b."tenantId" = $1
                GROUP BY b.id, b."totalAmount"
                HAVING abs(sum(i."lineTotal") - b."totalAmount") > 0.01
              ) x`,
      },
      {
        label: 'Fact. four. : règlements = amountPaid',
        sql: `SELECT count(*)::int AS n FROM (
                SELECT b.id
                FROM vendor_bills b
                JOIN vendor_payments p ON p."vendorBillId" = b.id
                WHERE b."tenantId" = $1
                GROUP BY b.id, b."amountPaid"
                HAVING abs(sum(p.amount) - b."amountPaid") > 0.01
              ) x`,
      },
      {
        label: 'Fact. four. : statut cohérent avec le solde',
        sql: `SELECT count(*)::int AS n FROM vendor_bills
              WHERE "tenantId" = $1
                AND (("status" = 'paid'      AND "amountDue" > 0.01)
                  OR ("status" = 'partial'   AND ("amountPaid" <= 0 OR "amountDue" <= 0))
                  OR ("status" IN ('draft','validated','cancelled') AND "amountPaid" > 0))`,
      },
      {
        label: 'Fact. four. : aucun règlement sur une facture non réglable',
        sql: `SELECT count(*)::int AS n FROM vendor_payments p
              JOIN vendor_bills b ON b.id = p."vendorBillId"
              WHERE p."tenantId" = $1 AND b.status NOT IN ('partial','paid')`,
      },
      {
        label: 'Fact. four. : rattachée à une réception et à sa commande',
        sql: `SELECT count(*)::int AS n FROM vendor_bills b
              WHERE b."tenantId" = $1
                AND (NOT EXISTS (SELECT 1 FROM reception_bls r WHERE r.id = b."receptionBlId")
                  OR NOT EXISTS (SELECT 1 FROM purchase_orders po WHERE po.id = b."purchaseOrderId")
                  OR NOT EXISTS (SELECT 1 FROM partners s
                                 WHERE s.id = b."supplierId" AND s."isSupplier"))`,
      },
      {
        label: 'Fact. four. : toute facture a au moins une ligne',
        sql: `SELECT count(*)::int AS n FROM vendor_bills b
              WHERE b."tenantId" = $1
                AND NOT EXISTS (SELECT 1 FROM vendor_bill_items i
                                WHERE i."vendorBillId" = b.id)`,
      },
      {
        label: 'Fact. four. : la commande facturée est bien au statut invoiced',
        sql: `SELECT count(*)::int AS n FROM vendor_bills b
              JOIN purchase_orders po ON po.id = b."purchaseOrderId"
              WHERE b."tenantId" = $1 AND b.status <> 'cancelled'
                AND po.status <> 'invoiced'`,
      },
      // ── Avoirs ─────────────────────────────────────────────────────────────
      {
        label: 'Avoirs : creditedAmount = Σ avoirs imputés',
        sql: `SELECT count(*)::int AS n FROM (
                SELECT i.id, i."creditedAmount",
                       COALESCE((SELECT sum(cn."totalAmount") FROM credit_notes cn
                                 WHERE cn."salesInvoiceId" = i.id AND cn.status = 'applied'
                                   AND cn."deletedAt" IS NULL), 0) AS impute
                FROM sales_invoices i
                WHERE i."tenantId" = $1
              ) x WHERE abs(impute - "creditedAmount") > 0.01`,
      },
      {
        label: 'Avoirs : aucun avoir ne dépasse le total de sa facture',
        sql: `SELECT count(*)::int AS n FROM credit_notes cn
              JOIN sales_invoices i ON i.id = cn."salesInvoiceId"
              WHERE cn."tenantId" = $1 AND cn.status = 'applied'
                AND cn."totalAmount" > i."totalAmount" + 0.01`,
      },
      {
        label: 'Avoirs : subtotal + taxAmount = totalAmount',
        sql: `SELECT count(*)::int AS n FROM credit_notes
              WHERE "tenantId" = $1
                AND abs("subtotal" + "taxAmount" - "totalAmount") > 0.01`,
      },
      {
        label: 'Avoirs : aucun avoir imputé sur une facture en brouillon',
        sql: `SELECT count(*)::int AS n FROM credit_notes cn
              JOIN sales_invoices i ON i.id = cn."salesInvoiceId"
              WHERE cn."tenantId" = $1 AND cn.status = 'applied'
                AND i.status IN ('draft', 'cancelled')`,
      },
      {
        label: 'Avoirs : tout avoir a au moins une ligne',
        sql: `SELECT count(*)::int AS n FROM credit_notes cn
              WHERE cn."tenantId" = $1
                AND NOT EXISTS (SELECT 1 FROM credit_note_items it
                                WHERE it."creditNoteId" = cn.id)`,
      },
      // ── Grilles tarifaires ─────────────────────────────────────────────────
      {
        label: 'Grilles : un seul prix par article et par grille',
        sql: `SELECT count(*)::int AS n FROM (
                SELECT "priceListId", "finishedProductId"
                FROM price_list_items WHERE "tenantId" = $1
                GROUP BY 1, 2 HAVING count(*) > 1
              ) x`,
      },
      {
        label: 'Grilles : aucun prix négatif',
        sql: `SELECT count(*)::int AS n FROM price_list_items
              WHERE "tenantId" = $1 AND "unitPrice" < 0`,
      },
      {
        label: 'Grilles : tout prix porte sur un article existant',
        sql: `SELECT count(*)::int AS n FROM price_list_items i
              WHERE i."tenantId" = $1
                AND NOT EXISTS (SELECT 1 FROM finished_products p
                                WHERE p.id = i."finishedProductId" AND p."deletedAt" IS NULL)`,
      },
      {
        label: 'Grilles : la grille d’un client existe et est active',
        sql: `SELECT count(*)::int AS n FROM partners p
              WHERE p."tenantId" = $1 AND p."priceListId" IS NOT NULL
                AND NOT EXISTS (SELECT 1 FROM price_lists pl
                                WHERE pl.id = p."priceListId"
                                  AND pl."deletedAt" IS NULL AND pl."isActive")`,
      },
      {
        label: 'Fact. four. : numéro unique',
        sql: `SELECT count(*)::int AS n FROM (
                SELECT "billNumber" FROM vendor_bills
                WHERE "tenantId" = $1
                GROUP BY "billNumber" HAVING count(*) > 1
              ) x`,
      },
      {
        // Un BL annulé ne doit retenir aucun lot : sa marchandise est
        // retournée au stock, et la compter comme réservée la rendrait
        // invendable pour toujours.
        label: 'Stock : aucun lot retenu par un BL annulé',
        sql: `SELECT count(*)::int AS n
              FROM stock_entries se
              JOIN delivery_notes bl ON bl.id = se."reservedByDeliveryNoteId"
              WHERE se."tenantId" = $1 AND bl.status = 'cancelled'`,
      },
      {
        // Le disponible ne peut pas être négatif dans un jeu cohérent : s'il
        // l'était, c'est que le seed aurait promis plus qu'il n'a acheté.
        label: 'Stock : aucun disponible négatif',
        sql: `SELECT count(*)::int AS n FROM finished_products
              WHERE "tenantId" = $1 AND "deletedAt" IS NULL
                AND ("stockQuantity" - "reservedQuantity") < -0.01`,
      },
      {
        // Ce qu'un BL non livré retient en lots doit correspondre à ce qu'il
        // porte en lignes : sinon la réserve affichée ne veut rien dire.
        label: 'Stock : la réserve d\'un BL correspond à ses lignes',
        sql: `SELECT count(*)::int AS n FROM (
                SELECT bl.id
                FROM delivery_notes bl
                JOIN LATERAL (
                  SELECT COALESCE(SUM(quantity), 0) AS q FROM delivery_note_items
                  WHERE "deliveryNoteId" = bl.id
                ) lignes ON TRUE
                JOIN LATERAL (
                  SELECT COALESCE(SUM(quantity), 0) AS q FROM stock_entries
                  WHERE "reservedByDeliveryNoteId" = bl.id AND status = 'sold'
                    AND "deletedAt" IS NULL
                ) lots ON TRUE
                WHERE bl."tenantId" = $1 AND bl."deletedAt" IS NULL
                  AND bl.status IN ('draft', 'sent')
                  AND abs(lignes.q - lots.q) > 0.01
              ) x`,
      },
      {
        // Sans ce contrôle, le seed pourrait de nouveau laisser les compteurs
        // en arrière et l'on ne s'en apercevrait qu'en créant un document.
        label: 'Compteurs : au moins aussi hauts que les numéros émis',
        sql: `SELECT count(*)::int AS n FROM (
                SELECT c."kind"
                FROM document_counters c
                JOIN LATERAL (
                  SELECT MAX(regexp_replace("invoiceNumber", '^.*-', '')::int) AS m
                  FROM sales_invoices
                  WHERE "tenantId" = c."tenantId"
                    AND EXTRACT(YEAR FROM "createdAt")::int = c."year"
                ) f ON c."kind" = 'invoice'
                WHERE c."tenantId" = $1 AND c."lastValue" < f.m
              ) x`,
      },
    ];

    console.log('\nContrôles d’intégrité :');
    let ko = 0;
    for (const c of checks) {
      const [row] = await qr.query(c.sql, [tenantId]);
      const n = Number(row.n);
      if (n > 0) ko++;
      console.log(`  ${n === 0 ? '✅' : '❌'} ${c.label}${n === 0 ? '' : ` — ${n} anomalie(s)`}`);
    }
    if (ko > 0) throw new Error(`${ko} contrôle(s) d'intégrité en échec — rollback`);

    await qr.commitTransaction();

    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`\n✅ Seed de démo terminé en ${secs} s\n`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`  Tenant   : ${tenant.name}`);
    console.log(`  Email    : ${author}`);
    console.log(`  Password : admin1234`);
    console.log(`  Fenêtre  : ${N.windowDays} derniers jours`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  } catch (err) {
    await qr.rollbackTransaction();
    console.error('\n❌ Seed de démo échoué :', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  } finally {
    await qr.release();
    await ds.destroy();
  }
}

function digits(n: number): string {
  let s = '';
  for (let i = 0; i < n; i++) s += ri(0, 9);
  return s;
}

function slug(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 30);
}

seedDemo();
