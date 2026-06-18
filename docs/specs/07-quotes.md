# 07 — Quotes / Devis (Nouveau module)

> **Module :** `src/quotes/` ← à créer
> **Invariants concernés :** R001, R002, R005, R007, R008, R010, R011, R012, R013, R016, R018, R019
> **Statut :** Non implémenté — spécification initiale

---

## 1. Entités

### 1.1 Quote

```typescript
@Entity('quotes')
export class Quote {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  tenantId: string;

  @Column({ type: 'varchar', length: 20 })
  quoteNumber: string; // unique per tenant — format DEV-YY-### (R013)

  @Column({ type: 'uuid' })
  customerId: string;

  @Column({ type: 'date' })
  quoteDate: Date;

  @Column({ type: 'date', nullable: true })
  expiryDate: Date | null;

  @Column({
    type: 'enum',
    enum: ['draft', 'sent', 'accepted', 'rejected', 'expired', 'converted'],
    default: 'draft',
  })
  status: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  subtotal: number; // SUM(quantity × unitPrice) HT — backend uniquement (R008)

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  taxAmount: number; // SUM(lineTaxTotal) de tous les items

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  totalAmount: number; // subtotal + taxAmount

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'uuid', nullable: true })
  convertedToInvoiceId: string | null; // renseigné lors de la conversion

  @Column({ type: 'varchar', nullable: true })
  createdBy: string | null;

  @Column({ type: 'varchar', nullable: true })
  updatedBy: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

  @OneToMany(() => QuoteItem, (item) => item.quote, { cascade: true })
  items: QuoteItem[];

  @ManyToOne(() => Customer)
  @JoinColumn({ name: 'customerId' })
  customer: Customer;

  @ManyToOne(() => SalesInvoice, { nullable: true })
  @JoinColumn({ name: 'convertedToInvoiceId' })
  invoice: SalesInvoice | null;
}


**Contrainte unique (migration) :**
```sql
ALTER TABLE "quotes"
  ADD CONSTRAINT "UQ_quotes_quote_number_tenant"
  UNIQUE ("quoteNumber", "tenantId");


---

### 1.2 QuoteItem

Chaque ligne d'un devis supporte **deux taxes indépendantes** (ex : TVA 19% + taxe parafiscale 2%).

```typescript
@Entity('quote_items')
export class QuoteItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  tenantId: string;

  @Column({ type: 'uuid' })
  quoteId: string;

  @Column({ type: 'uuid' })
  finishedProductId: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  quantity: number;

  @Column({ type: 'varchar', length: 50 })
  unit: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  unitPrice: number; // HT

  // Taxe 1 (ex: TVA 19%)
  @Column({ type: 'varchar', length: 100, nullable: true })
  taxName1: string | null;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  taxRate1: number | null;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  taxAmount1: number; // quantity × unitPrice × taxRate1/100

  // Taxe 2 (ex: taxe parafiscale)
  @Column({ type: 'varchar', length: 100, nullable: true })
  taxName2: string | null;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  taxRate2: number | null;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  taxAmount2: number; // quantity × unitPrice × taxRate2/100

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  lineTaxTotal: number; // taxAmount1 + taxAmount2

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  lineTotal: number; // (quantity × unitPrice) + lineTaxTotal (TTC)

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => Quote, (q) => q.items)
  @JoinColumn({ name: 'quoteId' })
  quote: Quote;

  @ManyToOne(() => FinishedProduct)
  @JoinColumn({ name: 'finishedProductId' })
  finishedProduct: FinishedProduct;
}


---

## 2. Calcul multi-taxe (R008 — backend uniquement)

```typescript
// src/quotes/quotes.service.ts — calcul des totaux d'un devis

function computeQuoteItem(item: CreateQuoteItemDto): ComputedQuoteItem {
  const lineHT = item.quantity * item.unitPrice;

  const taxAmount1 =
    item.taxRate1 != null
      ? Math.round(lineHT * (item.taxRate1 / 100) * 100) / 100
      : 0;

  const taxAmount2 =
    item.taxRate2 != null
      ? Math.round(lineHT * (item.taxRate2 / 100) * 100) / 100
      : 0;

  const lineTaxTotal = taxAmount1 + taxAmount2;
  const lineTotal = lineHT + lineTaxTotal;

  return {
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    taxName1: item.taxName1 ?? null,
    taxRate1: item.taxRate1 ?? null,
    taxAmount1,
    taxName2: item.taxName2 ?? null,
    taxRate2: item.taxRate2 ?? null,
    taxAmount2,
    lineTaxTotal,
    lineTotal,
  };
}

function computeQuoteTotals(items: ComputedQuoteItem[]): QuoteTotals {
  // subtotal = SUM des montants HT uniquement
  const subtotal = items.reduce(
    (sum, item) => sum + item.quantity * item.unitPrice,
    0,
  );

  // taxAmount = SUM de toutes les taxes de toutes les lignes
  const taxAmount = items.reduce((sum, item) => sum + item.lineTaxTotal, 0);

  const totalAmount = subtotal + taxAmount;

  return {
    subtotal: Math.round(subtotal * 100) / 100,
    taxAmount: Math.round(taxAmount * 100) / 100,
    totalAmount: Math.round(totalAmount * 100) / 100,
  };
}


**Formules de référence :**


taxAmount1    = quantity × unitPrice × (taxRate1 / 100)
taxAmount2    = quantity × unitPrice × (taxRate2 / 100)
lineTaxTotal  = taxAmount1 + taxAmount2
lineTotal     = (quantity × unitPrice) + lineTaxTotal

subtotal      = SUM(quantity × unitPrice)           ← HT pur, sans taxes
taxAmount     = SUM(lineTaxTotal)                   ← total taxes toutes lignes
totalAmount   = subtotal + taxAmount                ← TTC final


---

## 3. Indexes (R016)

```sql
-- quotes
CREATE INDEX "IDX_quotes_tenant_id"          ON "quotes" ("tenantId");
CREATE INDEX "IDX_quotes_customer_id"        ON "quotes" ("customerId");
CREATE INDEX "IDX_quotes_status"             ON "quotes" ("status");
CREATE INDEX "IDX_quotes_quote_date"         ON "quotes" ("quoteDate");
CREATE INDEX "IDX_quotes_expiry_date"        ON "quotes" ("expiryDate");
CREATE INDEX "IDX_quotes_deleted_at"         ON "quotes" ("deletedAt");
CREATE INDEX "IDX_quotes_converted_invoice"  ON "quotes" ("convertedToInvoiceId");

-- quote_items
CREATE INDEX "IDX_quote_items_tenant_id"           ON "quote_items" ("tenantId");
CREATE INDEX "IDX_quote_items_quote_id"            ON "quote_items" ("quoteId");
CREATE INDEX "IDX_quote_items_finished_product_id" ON "quote_items" ("finishedProductId");


---

## 4. Endpoints

| Méthode | Route | Rôles | Description |
|---------|-------|-------|-------------|
| `POST` | `/quotes` | owner, manager, agent | Créer un devis (status initial : draft) |
| `GET` | `/quotes` | owner, manager, agent | Lister avec pagination et filtres |
| `GET` | `/quotes/:id` | owner, manager, agent | Détail complet avec lignes |
| `PUT` | `/quotes/:id` | owner, manager | Modifier (uniquement si status = draft) |
| `PATCH` | `/quotes/:id/status` | owner, manager | Changer le statut (sent/accepted/rejected) |
| `POST` | `/quotes/:id/convert` | owner, manager | Convertir en facture (transaction) |
| `GET` | `/quotes/:id/pdf` | owner, manager, agent | Générer/télécharger le PDF |
| `POST` | `/quotes/:id/send-email` | owner, manager | Envoyer par email + status → sent |
| `DELETE` | `/quotes/:id` | owner | Soft delete (uniquement si draft ou rejected) |

**Query params GET /quotes :**

page        int     défaut 1
limit       int     défaut 20
status      enum    draft | sent | accepted | rejected | expired | converted
customerId  uuid
dateFrom    date    ISO 8601 (sur quoteDate)
dateTo      date    ISO 8601 (sur quoteDate)


---

## 5. Workflows

### 5.1 Cycle de vie du devis


              POST /quotes
                   │
                   ▼
               [draft] ──────────────────────────────── DELETE
                   │                                      ▲
     POST /send-email  │                                  │
     ou PATCH status   │                            (si draft ou rejected seulement)
                   ▼
                [sent]
                   │
          ┌────────┴─────────┐
          ▼                  ▼
      [accepted]         [rejected]
          │
   POST /convert
          │
          ▼
      [converted] ──► SalesInvoice créée (transaction)

              (job cron ou check à la lecture)
[sent] ou [accepted] + expiryDate < today ──► [expired]


**Transitions autorisées via PATCH /quotes/:id/status :**

| De | Vers | Condition |
|----|------|-----------|
| `draft` | `sent` | toujours |
| `sent` | `accepted` | toujours |
| `sent` | `rejected` | toujours |
| `accepted` | `rejected` | toujours |
| Toute autre | — | HTTP 422 |

`converted` et `expired` sont des statuts finaux — non modifiables manuellement.

---

### 5.2 Conversion en facture (POST /quotes/:id/convert)

> **Side effects — tout dans une transaction QueryRunner (R005) :**
> 1. Vérifie que le devis est `accepted` (sinon HTTP 422)
> 2. Crée une `SalesInvoice` avec les mêmes lignes, le même client, les mêmes montants
> 3. Copie chaque `QuoteItem` → `SalesInvoiceItem` (mêmes taxes, mêmes prix)
> 4. Met `Quote.status` → `converted`
> 5. Met `Quote.convertedToInvoiceId` → l'id de la facture créée

```typescript
// src/quotes/quotes.service.ts
async convertToInvoice(
  quoteId: string,
  tenantId: string,
  userId: string,
): Promise<SalesInvoice> {
  const queryRunner = this.dataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    const quote = await queryRunner.manager.findOne(Quote, {
      where: { id: quoteId, tenantId, deletedAt: IsNull() },
      relations: ['items'],
    });

    if (!quote) throw new NotFoundException(`Devis ${quoteId} introuvable`);
    if (quote.status !== 'accepted') {
      throw new UnprocessableEntityException(
        'Seul un devis accepté peut être converti en facture',
      );
    }

    // Génère le numéro de facture avec lock (R013)
    const invoiceNumber = await this.invoicesService.generateInvoiceNumber(
      queryRunner,
      tenantId,
    );

    // Crée la SalesInvoice
    const invoice = queryRunner.manager.create(SalesInvoice, {
      tenantId,
      invoiceNumber,
      customerId: quote.customerId,
      invoiceDate: new Date(),
      subtotal: quote.subtotal,
      taxAmount: quote.taxAmount,
      totalAmount: quote.totalAmount,
      amountPaid: 0,
      amountDue: quote.totalAmount,
      status: 'draft',
      quoteId: quote.id,
      createdBy: userId,
    });
    await queryRunner.manager.save(SalesInvoice, invoice);

    // Copie les lignes
    for (const item of quote.items) {
      const invoiceItem = queryRunner.manager.create(SalesInvoiceItem, {
        tenantId,
        salesInvoiceId: invoice.id,
        finishedProductId: item.finishedProductId,
        quantity: item.quantity,
        unit: item.unit,
        unitPrice: item.unitPrice,
        taxName1: item.taxName1,
        taxRate1: item.taxRate1,
        taxAmount1: item.taxAmount1,
        taxName2: item.taxName2,
        taxRate2: item.taxRate2,
        taxAmount2: item.taxAmount2,
        lineTaxTotal: item.lineTaxTotal,
        lineTotal: item.lineTotal,
      });
      await queryRunner.manager.save(SalesInvoiceItem, invoiceItem);
    }

    // Met à jour le devis
    quote.status = 'converted';
    quote.convertedToInvoiceId = invoice.id;
    quote.updatedBy = userId;
    await queryRunner.manager.save(Quote, quote);

    await queryRunner.commitTransaction();
    return invoice;
  } catch (error) {
    await queryRunner.rollbackTransaction();
    throw error;
  } finally {
    await queryRunner.release();
  }
}


---

## 6. Auto-numérotation (R013)

```typescript
// src/quotes/quotes.service.ts
async generateQuoteNumber(queryRunner: QueryRunner, tenantId: string): Promise<string> {
  // Lock advisory par tenant pour éviter les doublons en concurrence
  await queryRunner.query(
    `SELECT pg_advisory_xact_lock(hashtext('quote_number_' || $1))`,
    [tenantId],
  );

  const year = new Date().getFullYear();
  const yy = String(year).slice(-2);

  const last = await queryRunner.manager
    .createQueryBuilder(Quote, 'q')
    .where('q.tenantId = :tenantId', { tenantId })
    .andWhere(`EXTRACT(YEAR FROM q.createdAt) = :year`, { year })
    .andWhere('q.deletedAt IS NULL')
    .orderBy('q.quoteNumber', 'DESC')
    .limit(1)
    .getOne();

  const lastSeq = last ? parseInt(last.quoteNumber.split('-')[2], 10) : 0;
  const next = String(lastSeq + 1).padStart(3, '0');
  return `DEV-${yy}-${next}`;
}


**Format :** `DEV-YY-###`
- Exemple : `DEV-26-001`, `DEV-26-042`
- Séquence repart à `001` chaque année civile, par tenant

---

## 7. Exemples JSON

### POST /quotes

**Request :**
```json
{
  "customerId": "cust-uuid-001",
  "quoteDate": "2026-06-18",
  "expiryDate": "2026-07-18",
  "notes": "Valable 30 jours — tarif grande surface",
  "items": [
    {
      "finishedProductId": "prod-uuid-001",
      "quantity": 500,
      "unit": "pièce",
      "unitPrice": 195.00,
      "taxName1": "TVA",
      "taxRate1": 19,
      "taxName2": null,
      "taxRate2": null
    },
    {
      "finishedProductId": "prod-uuid-002",
      "quantity": 200,
      "unit": "kg",
      "unitPrice": 480.00,
      "taxName1": "TVA",
      "taxRate1": 19,
      "taxName2": "Taxe parafiscale",
      "taxRate2": 2
    }
  ]
}


**Response 201 :**
```json
{
  "data": {
    "id": "quote-uuid-001",
    "tenantId": "tenant-uuid",
    "quoteNumber": "DEV-26-001",
    "customerId": "cust-uuid-001",
    "quoteDate": "2026-06-18",
    "expiryDate": "2026-07-18",
    "status": "draft",
    "subtotal": 193500.00,
    "taxAmount": 40565.00,
    "totalAmount": 234065.00,
    "notes": "Valable 30 jours — tarif grande surface",
    "convertedToInvoiceId": null,
    "items": [
      {
        "id": "qi-uuid-001",
        "finishedProductId": "prod-uuid-001",
        "quantity": 500,
        "unit": "pièce",
        "unitPrice": 195.00,
        "taxName1": "TVA",
        "taxRate1": 19.00,
        "taxAmount1": 18525.00,
        "taxName2": null,
        "taxRate2": null,
        "taxAmount2": 0.00,
        "lineTaxTotal": 18525.00,
        "lineTotal": 116025.00
      },
      {
        "id": "qi-uuid-002",
        "finishedProductId": "prod-uuid-002",
        "quantity": 200,
        "unit": "kg",
        "unitPrice": 480.00,
        "taxName1": "TVA",
        "taxRate1": 19.00,
        "taxAmount1": 18240.00,
        "taxName2": "Taxe parafiscale",
        "taxRate2": 2.00,
        "taxAmount2": 1920.00,
        "lineTaxTotal": 20160.00,
        "lineTotal": 116160.00
      }
    ],
    "createdAt": "2026-06-18T14:00:00.000Z"
  }
}


**Vérification des calculs :**

Ligne 1 : 500 × 195 = 97 500 HT  | TVA 19% = 18 525  | TTC = 116 025
Ligne 2 : 200 × 480 = 96 000 HT  | TVA 19% = 18 240 + Paraf 2% = 1 920 | TTC = 116 160

subtotal    = 97 500 + 96 000  = 193 500.00
taxAmount   = 18 525 + 20 160  =  40 685.00   ← NOTE: le JSON ci-dessus a une valeur exemple
totalAmount = 193 500 + 40 685 = 234 185.00


---

### POST /quotes/:id/convert — Response 201

```json
{
  "data": {
    "quoteConverted": {
      "id": "quote-uuid-001",
      "quoteNumber": "DEV-26-001",
      "status": "converted",
      "convertedToInvoiceId": "inv-uuid-042"
    },
    "invoiceCreated": {
      "id": "inv-uuid-042",
      "tenantId": "tenant-uuid",
      "invoiceNumber": "FAC-26-042",
      "customerId": "cust-uuid-001",
      "invoiceDate": "2026-06-18",
      "status": "draft",
      "subtotal": 193500.00,
      "taxAmount": 40685.00,
      "totalAmount": 234185.00,
      "amountPaid": 0.00,
      "amountDue": 234185.00,
      "quoteId": "quote-uuid-001",
      "itemsCount": 2,
      "createdAt": "2026-06-18T15:30:00.000Z"
    }
  }
}


---

## 8. Gestion de l'expiration (job cron)

Un job tourne **toutes les heures** et marque les devis expirés :

```typescript
// src/quotes/quotes-expiry.job.ts
@Cron('0 * * * *') // toutes les heures
async markExpiredQuotes(): Promise<void> {
  await this.dataSource
    .createQueryBuilder()
    .update(Quote)
    .set({ status: 'expired' })
    .where('status IN (:...statuses)', { statuses: ['sent', 'accepted'] })
    .andWhere('expiryDate IS NOT NULL')
    .andWhere('expiryDate < :today', { today: new Date() })
    .andWhere('deletedAt IS NULL')
    .execute();
}


> Ce job opère sur tous les tenants en une seule requête — pas de boucle par tenant. La colonne `expiryDate` est indexée (R016).


---

The four files are above, clearly separated with their paths. Here is a summary of what was produced:

**04-purchases.md** — Full spec for PurchaseOrder (with items) and ReceptionBL entities, all TypeScript entity definitions with explicit `@Column({ type })` per R001, composite unique constraints per tenant, all indexes per R016, 6 endpoints for POs and 3 for reception BLs, FIFO-aware auto-numbering with advisory lock (R013), transaction side-effects on reception (R005), and JSON examples for both POST endpoints.

**05-stock.md** — Full spec for StockEntry and InventorySummary entities, complete FIFO TypeScript implementation with `orderBy enteredAt ASC`, the `updateInventorySummary` recalculation logic, stock transition state diagram (available → reserved → sold / adjusted), 3 endpoints (inventory list, alerts, manual adjust), expiry alert severity rules (red ≤2d, orange ≤5d), and JSON examples for all endpoints.

**06-customers.md** — Customer and FinishedProduct entities with all relations declared, soft-delete and isActive rules, 5 customer endpoints and 5 product endpoints with query params, and JSON examples for POST customer, GET customer with history (last 5 BLs, last 5 invoices, total revenue), and POST product.

**07-quotes.md** — New module spec for Quote and QuoteItem entities supporting dual per-line taxes, full TypeScript multi-tax calculation formulas (taxAmount1 + taxAmount2 → lineTaxTotal → lineTotal → subtotal/taxAmount/totalAmount), 9 endpoints, state machine diagram, complete `convertToInvoice` transactional TypeScript implementation (R005), DEV-YY-### auto-numbering with advisory lock (R013), hourly cron for expiry marking, and JSON examples for POST quote and POST convert response.
