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
  products: int(process.env.DEMO_PRODUCTS, 200),
  invoices: int(process.env.DEMO_INVOICES, 1000),
  deliveryNotes: int(process.env.DEMO_DELIVERY_NOTES, 800),
  payments: int(process.env.DEMO_PAYMENTS, 600),
  quotes: int(process.env.DEMO_QUOTES, 400),
  expenses: int(process.env.DEMO_EXPENSES, 150),
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
    const purge = [
      'payments', 'sales_invoice_items', 'sales_invoices',
      'delivery_note_items', 'delivery_notes',
      'quote_items', 'quotes',
      'expenses', 'finished_products', 'partners',
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

    // ── Produits ──────────────────────────────────────────────────────────────
    const products: Array<{ id: string; unit: string; price: number }> = [];
    const productRows: unknown[][] = [];
    const usedCodes = new Set<string>();

    for (let i = 0; i < N.products; i++) {
      const base = CATALOGUE[i % CATALOGUE.length];
      const nom = i < CATALOGUE.length ? base.nom : `${base.nom} — ${pick(QUALIFS)}`;
      const id = uuid();
      const price = money(ri(base.min, base.max));
      const cost = money(price * (0.62 + rnd() * 0.2));
      const stock = money(ri(0, 2500) + rnd());

      let code = `PF-${String(i + 1).padStart(4, '0')}`;
      while (usedCodes.has(code)) code = `PF-${String(ri(1, 99999)).padStart(4, '0')}`;
      usedCodes.add(code);

      products.push({ id, unit: base.unite, price });
      productRows.push([
        id, tenantId, nom, code, base.unite, price,
        rnd() < 0.4 ? `${nom} — conservation à ${pick(['-18 °C', '-20 °C', '+2 à +4 °C'])}` : null,
        rnd() < 0.97, 'product', cost, stock, cost, money(stock * cost),
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

    // ── Devis ─────────────────────────────────────────────────────────────────
    const quoteRows: unknown[][] = [];
    const quoteItemRows: unknown[][] = [];
    const quoteWidth = Math.max(3, String(N.quotes).length);

    for (let i = 0; i < N.quotes; i++) {
      const id = uuid();
      const d = dateInWindow();
      const { rows, subtotal, taxAmount, totalAmount } = buildLines(id, 'quoteId');
      quoteItemRows.push(...rows);

      const age = Math.floor((Date.now() - d.getTime()) / 86400000);
      const status = age > 45 ? pick(['expired', 'rejected', 'converted'] as const)
        : pick(['draft', 'sent', 'sent', 'accepted', 'rejected'] as const);

      quoteRows.push([
        id, tenantId, `DEV-${yy}-${pad(i + 1, quoteWidth)}`, pick(customerIds),
        isoDate(d), isoDate(addDays(d, 30)), status,
        subtotal, taxAmount, totalAmount,
        rnd() < 0.15 ? 'Offre valable 30 jours, franco de port au-delà de 50 000 DA' : null,
        author, author, d, d,
      ]);
    }

    await insertBatch(qr, 'quotes', [
      'id', 'tenantId', 'quoteNumber', 'customerId', 'quoteDate', 'expiryDate', 'status',
      'subtotal', 'taxAmount', 'totalAmount', 'notes', 'createdBy', 'updatedBy',
      'createdAt', 'updatedAt',
    ], quoteRows);
    await insertBatch(qr, 'quote_items', itemCols('quoteId'), quoteItemRows);
    console.log(`Devis     : ${quoteRows.length} (${quoteItemRows.length} lignes)`);

    // ── Bons de livraison ─────────────────────────────────────────────────────
    const dnRows: unknown[][] = [];
    const dnItemRows: unknown[][] = [];
    const dnWidth = Math.max(3, String(N.deliveryNotes).length);

    for (let i = 0; i < N.deliveryNotes; i++) {
      const id = uuid();
      const d = dateInWindow();
      const { rows, subtotal, taxAmount, totalAmount } = buildLines(id, 'deliveryNoteId');
      dnItemRows.push(...rows);

      const status = pick(['delivered', 'delivered', 'delivered', 'signed', 'sent', 'draft', 'cancelled'] as const);
      const signe = status === 'signed' || status === 'delivered';

      dnRows.push([
        id, tenantId, `BL-${yy}-${pad(i + 1, dnWidth)}`, pick(customerIds),
        isoDate(d), status, subtotal, taxAmount, totalAmount,
        signe && rnd() < 0.5 ? `${pick(PRENOMS)} ${pick(NOMS)}` : null,
        signe ? isoDate(d) : null,
        rnd() < 0.12 ? pick(['Livraison partielle', 'Camion frigo n° 3', 'Réception par le chef de dépôt']) : null,
        author, author, d, d,
      ]);
    }

    await insertBatch(qr, 'delivery_notes', [
      'id', 'tenantId', 'blNumber', 'customerId', 'deliveryDate', 'status',
      'subtotal', 'taxAmount', 'total', 'customerSignature', 'signedDate', 'notes',
      'createdBy', 'updatedBy', 'createdAt', 'updatedAt',
    ], dnRows);
    await insertBatch(qr, 'delivery_note_items', itemCols('deliveryNoteId'), dnItemRows);
    console.log(`BL        : ${dnRows.length} (${dnItemRows.length} lignes)`);

    // ── Factures ──────────────────────────────────────────────────────────────
    // Les paiements sont générés d'abord, puis amountPaid en découle : c'est ce
    // qui garantit que Σ paiements == amountPaid, invariant vérifié plus bas.
    type Inv = {
      id: string; number: string; customerId: string; date: Date; due: Date;
      subtotal: number; taxAmount: number; totalAmount: number;
    };
    const invoices: Inv[] = [];
    const invItemRows: unknown[][] = [];
    const invWidth = Math.max(3, String(N.invoices).length);

    for (let i = 0; i < N.invoices; i++) {
      const id = uuid();
      const d = dateInWindow();
      const { rows, subtotal, taxAmount, totalAmount } = buildLines(id, 'salesInvoiceId');
      invItemRows.push(...rows);
      invoices.push({
        id, number: `FAC-${yy}-${pad(i + 1, invWidth)}`, customerId: pick(customerIds),
        date: d, due: addDays(d, pick([15, 30, 30, 45, 60])),
        subtotal, taxAmount, totalAmount,
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
    const invRows = invoices.map((inv) => {
      const amountPaid = money(paid.get(inv.id) ?? 0);
      const amountDue = money(inv.totalAmount - amountPaid);

      let status: string;
      if (amountDue <= 0) status = 'paid';
      else if (amountPaid > 0) status = 'partial';
      else if (inv.due < now) status = 'overdue';
      else status = pick(['sent', 'sent', 'draft'] as const);

      return [
        inv.id, tenantId, inv.number, inv.customerId, inv.date, isoDate(inv.due), status,
        inv.subtotal, inv.taxAmount, inv.totalAmount, amountPaid, amountDue,
        rnd() < 0.1 ? 'Facture émise au titre du contrat annuel' : null,
        author, author, inv.date, inv.date,
      ];
    });

    await insertBatch(qr, 'sales_invoices', [
      'id', 'tenantId', 'invoiceNumber', 'customerId', 'invoiceDate', 'dueDate', 'status',
      'subtotal', 'taxAmount', 'totalAmount', 'amountPaid', 'amountDue', 'notes',
      'createdBy', 'updatedBy', 'createdAt', 'updatedAt',
    ], invRows);
    await insertBatch(qr, 'sales_invoice_items', itemCols('salesInvoiceId'), invItemRows);
    console.log(`Factures  : ${invRows.length} (${invItemRows.length} lignes)`);

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

    // ── Contrôles d'intégrité avant commit ────────────────────────────────────
    const checks: Array<{ label: string; sql: string }> = [
      {
        label: 'Factures : subtotal + taxAmount = totalAmount',
        sql: `SELECT count(*)::int AS n FROM sales_invoices
              WHERE "tenantId" = $1
                AND round("subtotal" + "taxAmount", 2) <> round("totalAmount", 2)`,
      },
      {
        label: 'Factures : amountPaid + amountDue = totalAmount',
        sql: `SELECT count(*)::int AS n FROM sales_invoices
              WHERE "tenantId" = $1
                AND round("amountPaid" + "amountDue", 2) <> round("totalAmount", 2)`,
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
                  OR ("status" = 'partial' AND ("amountPaid" <= 0 OR "amountDue" <= 0))
                  OR ("status" IN ('sent','draft','overdue') AND "amountPaid" > 0))`,
      },
      {
        label: 'Aucun document orphelin (client inexistant)',
        sql: `SELECT count(*)::int AS n FROM sales_invoices i
              WHERE i."tenantId" = $1
                AND NOT EXISTS (SELECT 1 FROM partners p WHERE p.id = i."customerId")`,
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
