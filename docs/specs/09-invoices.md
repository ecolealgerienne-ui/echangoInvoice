# 09 — Sales Invoices (Factures de vente)

> **Invariants concernés :** R001, R002, R005, R007, R008, R010, R011, R013, R014, R016, R018, R019

---

## Entities

### SalesInvoice

```typescript
@Entity('sales_invoices')
export class SalesInvoice {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  tenantId: string;

  @Column({ type: 'varchar', length: 20 })
  invoiceNumber: string; // unique per tenant — format FAC-YY-###, advisory lock (R013)

  @Column({ type: 'uuid' })
  customerId: string;

  @Column({ type: 'uuid', nullable: true })
  deliveryNoteId?: string; // lien optionnel vers un BL

  @Column({ type: 'uuid', nullable: true })
  quoteId?: string; // lien optionnel vers un devis

  @Column({ type: 'date' })
  invoiceDate: Date;

  @Column({ type: 'date', nullable: true })
  dueDate?: Date;

  @Column({
    type: 'enum',
    enum: ['draft', 'sent', 'partial', 'paid', 'overdue', 'cancelled'],
    default: 'draft',
  })
  status: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  subtotal: number; // SUM(quantity × unitPrice) — HT uniquement

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  taxAmount: number; // SUM(lineTaxTotal) across all items

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  totalAmount: number; // subtotal + taxAmount

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  amountPaid: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amountDue: number; // totalAmount - amountPaid

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @Column({ type: 'varchar', nullable: true })
  createdBy?: string;

  @Column({ type: 'varchar', nullable: true })
  updatedBy?: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ type: 'timestamptz', nullable: true })
  deletedAt?: Date;

  // Relations
  @ManyToOne(() => Customer)
  @JoinColumn({ name: 'customerId' })
  customer: Customer;

  @OneToOne(() => DeliveryNote, (dn) => dn.invoice, { nullable: true })
  @JoinColumn({ name: 'deliveryNoteId' })
  deliveryNote?: DeliveryNote;

  @ManyToOne(() => Quote, { nullable: true })
  @JoinColumn({ name: 'quoteId' })
  quote?: Quote;

  @OneToMany(() => SalesInvoiceItem, (item) => item.salesInvoice, { cascade: true })
  items: SalesInvoiceItem[];

  @OneToMany(() => Payment, (p) => p.salesInvoice)
  payments: Payment[];
}
```

**Contraintes DB :**
```sql
UNIQUE ("tenantId", "invoiceNumber")
INDEX IDX_sales_invoices_tenant_id       ON sales_invoices (tenantId)
INDEX IDX_sales_invoices_customer_id     ON sales_invoices (customerId)
INDEX IDX_sales_invoices_delivery_note   ON sales_invoices (deliveryNoteId)
INDEX IDX_sales_invoices_quote_id        ON sales_invoices (quoteId)
INDEX IDX_sales_invoices_status          ON sales_invoices (status)
INDEX IDX_sales_invoices_invoice_date    ON sales_invoices (invoiceDate)
INDEX IDX_sales_invoices_due_date        ON sales_invoices (dueDate)
INDEX IDX_sales_invoices_deleted_at      ON sales_invoices (deletedAt)
```

---

### SalesInvoiceItem

```typescript
@Entity('sales_invoice_items')
export class SalesInvoiceItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  tenantId: string;

  @Column({ type: 'uuid' })
  salesInvoiceId: string;

  @Column({ type: 'uuid' })
  finishedProductId: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  quantity: number;

  @Column({ type: 'varchar', length: 50 })
  unit: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  unitPrice: number;

  // Tax 1
  @Column({ type: 'varchar', length: 50, nullable: true })
  taxName1?: string;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  taxRate1?: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  taxAmount1: number; // quantity × unitPrice × (taxRate1 / 100)

  // Tax 2
  @Column({ type: 'varchar', length: 50, nullable: true })
  taxName2?: string;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  taxRate2?: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  taxAmount2: number; // quantity × unitPrice × (taxRate2 / 100)

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  lineTaxTotal: number; // taxAmount1 + taxAmount2

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  lineTotal: number; // (quantity × unitPrice) + lineTaxTotal

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  // Relations
  @ManyToOne(() => SalesInvoice, (inv) => inv.items)
  @JoinColumn({ name: 'salesInvoiceId' })
  salesInvoice: SalesInvoice;

  @ManyToOne(() => FinishedProduct)
  @JoinColumn({ name: 'finishedProductId' })
  finishedProduct: FinishedProduct;
}
```

**Contraintes DB :**
```sql
INDEX IDX_sales_invoice_items_invoice_id  ON sales_invoice_items (salesInvoiceId)
INDEX IDX_sales_invoice_items_tenant_id   ON sales_invoice_items (tenantId)
INDEX IDX_sales_invoice_items_product_id  ON sales_invoice_items (finishedProductId)
```

---

## Calcul des montants (backend uniquement — R008)

```
// Par ligne :
taxAmount1   = quantity × unitPrice × (taxRate1 / 100)
taxAmount2   = quantity × unitPrice × (taxRate2 / 100)
lineTaxTotal = taxAmount1 + taxAmount2
lineTotal    = (quantity × unitPrice) + lineTaxTotal

// Totaux facture :
subtotal     = SUM(quantity × unitPrice)           ← HT uniquement, sans taxes
taxAmount    = SUM(lineTaxTotal) across all items
totalAmount  = subtotal + taxAmount
amountDue    = totalAmount - amountPaid
```

Implémentation TypeScript (service) :

```typescript
private calculateTotals(items: CreateSalesInvoiceItemDto[]): InvoiceTotals {
  let subtotal = 0;
  let taxAmount = 0;

  const calculatedItems = items.map((item) => {
    const lineHT = item.quantity * item.unitPrice;
    const ta1 = item.taxRate1 ? lineHT * (item.taxRate1 / 100) : 0;
    const ta2 = item.taxRate2 ? lineHT * (item.taxRate2 / 100) : 0;
    const lineTaxTotal = ta1 + ta2;

    subtotal += lineHT;
    taxAmount += lineTaxTotal;

    return {
      ...item,
      taxAmount1: Math.round(ta1 * 100) / 100,
      taxAmount2: Math.round(ta2 * 100) / 100,
      lineTaxTotal: Math.round(lineTaxTotal * 100) / 100,
      lineTotal: Math.round((lineHT + lineTaxTotal) * 100) / 100,
    };
  });

  return {
    items: calculatedItems,
    subtotal: Math.round(subtotal * 100) / 100,
    taxAmount: Math.round(taxAmount * 100) / 100,
    totalAmount: Math.round((subtotal + taxAmount) * 100) / 100,
  };
}
```

---

## Numérotation automatique (R013)

Format par défaut : `FAC-YY-###` (configurable dans Settings)

```typescript
await queryRunner.query(`SELECT pg_advisory_xact_lock(3)`); // lock id 3 = invoices
const last = await queryRunner.manager
  .createQueryBuilder(SalesInvoice, 'inv')
  .where('inv.tenantId = :tenantId', { tenantId })
  .andWhere('EXTRACT(YEAR FROM inv.createdAt) = :year', { year })
  .andWhere('inv.deletedAt IS NULL')
  .orderBy('inv.invoiceNumber', 'DESC')
  .limit(1)
  .getOne();
const seq = last ? parseInt(last.invoiceNumber.split('-')[2]) + 1 : 1;
return `FAC-${String(year).slice(-2)}-${String(seq).padStart(3, '0')}`;
```

---

## Freemium guard

Avant toute création de facture, vérifier la limite du plan :

```typescript
// Dans SalesInvoicesService.create()
const subscription = await this.subscriptionService.getByTenantId(tenantId);
if (subscription.invoicesThisMonth >= subscription.invoiceLimit) {
  throw new ForbiddenException('INVOICE_LIMIT_REACHED'); // → HTTP 403
}
```

Side effect après création réussie :
```typescript
await this.subscriptionService.incrementInvoicesThisMonth(tenantId, queryRunner);
```

---

## Endpoints

### POST /api/v1/invoices/sales-invoices

Trois modes de création :

**Mode 1 — Standalone (sans BL ni devis) :**
```json
POST /api/v1/invoices/sales-invoices
Authorization: Bearer <token>

{
  "customerId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "invoiceDate": "2024-06-15",
  "dueDate": "2024-07-15",
  "notes": "Paiement à 30 jours",
  "items": [
    {
      "finishedProductId": "7cb1a3e2-1234-4abc-9def-000000000001",
      "quantity": 10.00,
      "unit": "kg",
      "unitPrice": 250.00,
      "taxName1": "TVA",
      "taxRate1": 19.00,
      "taxName2": null,
      "taxRate2": null
    }
  ]
}
```

**Mode 2 — Depuis un BL (conversion) :**
```json
{
  "deliveryNoteId": "a1b2c3d4-0000-0000-0000-000000000001",
  "invoiceDate": "2024-06-15",
  "dueDate": "2024-07-15",
  "notes": "Facture issue du BL-24-001"
  // items copiés automatiquement depuis le BL
}
```

**Mode 3 — Depuis un devis (conversion) :**
```json
{
  "quoteId": "q1b2c3d4-0000-0000-0000-000000000001",
  "invoiceDate": "2024-06-15",
  "dueDate": "2024-07-15"
  // items copiés automatiquement depuis le devis
}
```

**Response 201 :**
```json
{
  "data": {
    "id": "f1b2c3d4-0000-0000-0000-000000000001",
    "tenantId": "tenant-uuid",
    "invoiceNumber": "FAC-24-001",
    "customerId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    "deliveryNoteId": null,
    "quoteId": null,
    "invoiceDate": "2024-06-15",
    "dueDate": "2024-07-15",
    "status": "draft",
    "subtotal": 2500.00,
    "taxAmount": 475.00,
    "totalAmount": 2975.00,
    "amountPaid": 0.00,
    "amountDue": 2975.00,
    "items": [
      {
        "id": "item-uuid-1",
        "finishedProductId": "7cb1a3e2-1234-4abc-9def-000000000001",
        "quantity": 10.00,
        "unit": "kg",
        "unitPrice": 250.00,
        "taxName1": "TVA",
        "taxRate1": 19.00,
        "taxAmount1": 475.00,
        "taxName2": null,
        "taxRate2": null,
        "taxAmount2": 0.00,
        "lineTaxTotal": 475.00,
        "lineTotal": 2975.00
      }
    ],
    "payments": [],
    "createdAt": "2024-06-15T09:00:00Z",
    "updatedAt": "2024-06-15T09:00:00Z"
  }
}
```

**Erreurs possibles :**
- `403` — limite de factures du mois atteinte (`INVOICE_LIMIT_REACHED`)
- `404` — client, produit, BL ou devis introuvable
- `409` — BL ou devis déjà lié à une facture

---

### GET /api/v1/invoices/sales-invoices

**Query params :** `page`, `limit`, `status`, `customerId`, `dateFrom`, `dateTo`

**Response 200 :**
```json
{
  "data": [
    {
      "id": "f1b2c3d4-0000-0000-0000-000000000001",
      "invoiceNumber": "FAC-24-001",
      "customer": { "id": "...", "name": "Client SARL" },
      "invoiceDate": "2024-06-15",
      "dueDate": "2024-07-15",
      "status": "sent",
      "totalAmount": 2975.00,
      "amountPaid": 0.00,
      "amountDue": 2975.00,
      "createdAt": "2024-06-15T09:00:00Z"
    }
  ],
  "pagination": {
    "total": 38,
    "page": 1,
    "limit": 20
  }
}
```

---

### GET /api/v1/invoices/sales-invoices/:id

**Response 200 :** objet complet avec `items`, `payments`, `customer`, `deliveryNote`, `quote`.

```json
{
  "data": {
    "id": "f1b2c3d4-0000-0000-0000-000000000001",
    "invoiceNumber": "FAC-24-001",
    "status": "partial",
    "customer": { "id": "...", "name": "Client SARL", "address": "..." },
    "deliveryNote": { "id": "...", "blNumber": "BL-24-001" },
    "quote": null,
    "items": [ /* ... */ ],
    "payments": [
      {
        "id": "pay-uuid-1",
        "amount": 1000.00,
        "paymentDate": "2024-06-20",
        "paymentMethod": "bank_transfer",
        "reference": "VIR-2024-001"
      }
    ],
    "subtotal": 2500.00,
    "taxAmount": 475.00,
    "totalAmount": 2975.00,
    "amountPaid": 1000.00,
    "amountDue": 1975.00,
    "invoiceDate": "2024-06-15",
    "dueDate": "2024-07-15",
    "notes": "Paiement à 30 jours",
    "createdAt": "2024-06-15T09:00:00Z",
    "updatedAt": "2024-06-20T14:00:00Z"
  }
}
```

---

### PUT /api/v1/invoices/sales-invoices/:id

Modification complète. **Uniquement si `status = draft`.**

Recalcule tous les montants. `amountDue` est recalculé depuis `totalAmount - amountPaid`.

**Request :** même format que POST (items complets).

**Response 200 :** objet mis à jour.

**Erreurs :**
- `409` — facture non en statut draft

---

### PATCH /api/v1/invoices/sales-invoices/:id/status

Modification manuelle du statut (cas d'usage : annulation, marquer overdue via cron).

**Request :**
```json
{ "status": "cancelled" }
```

**Transitions autorisées (manuelles) :**
```
draft      → sent | cancelled
sent       → cancelled
partial    → cancelled
overdue    → cancelled
```

Les transitions `→ partial`, `→ paid` sont automatiques via les paiements.

**Response 200 :**
```json
{ "data": { "id": "...", "invoiceNumber": "FAC-24-001", "status": "cancelled" } }
```

---

### GET /api/v1/invoices/sales-invoices/:id/pdf

Retourne la facture en PDF. Génère si absent, sert depuis le cache sinon.

**Archivage (R014) :**
```
ARCHIVES/2024/06/FACTURES/FAC-24-001.pdf
```

**Response :**
```
HTTP 200
Content-Type: application/pdf
Content-Disposition: attachment; filename="FAC-24-001.pdf"
<binary stream>
```

---

### POST /api/v1/invoices/sales-invoices/:id/send-email

Génère le PDF, l'envoie par email au client, passe le statut à `sent`.

**Request :**
```json
{
  "recipientEmail": "client@exemple.dz",
  "subject": "Facture FAC-24-001",
  "message": "Veuillez trouver ci-joint votre facture."
}
```

**Response 200 :**
```json
{ "data": { "sent": true, "to": "client@exemple.dz", "status": "sent" } }
```

---

### DELETE /api/v1/invoices/sales-invoices/:id

Soft delete. **Uniquement si `status = draft`.**

**Response 204 :** no content.

---

## Workflow statuts

```
draft ──(send email/print)──► sent ──(paiement partiel)──► partial ──(solde)──► paid
  │                             │                              │
  └──(annulation)──► cancelled  └──(échéance dépassée)──► overdue
                                     (via cron job quotidien)
```

| Statut | PUT | DELETE | Envoyer email | Enregistrer paiement |
|--------|-----|--------|---------------|----------------------|
| draft | ✅ | ✅ | ❌ | ❌ |
| sent | ❌ | ❌ | ✅ | ✅ |
| partial | ❌ | ❌ | ✅ | ✅ |
| paid | ❌ | ❌ | ✅ | ❌ |
| overdue | ❌ | ❌ | ✅ | ✅ |
| cancelled | ❌ | ❌ | ❌ | ❌ |

---

## Cron job — Détection des factures échues

```typescript
// Tâche planifiée quotidienne à 00:01
@Cron('1 0 * * *')
async markOverdueInvoices(): Promise<void> {
  await this.dataSource
    .createQueryBuilder()
    .update(SalesInvoice)
    .set({ status: 'overdue' })
    .where('status IN (:...statuses)', { statuses: ['sent', 'partial'] })
    .andWhere('dueDate < :today', { today: new Date() })
    .andWhere('amountDue > 0')
    .andWhere('deletedAt IS NULL')
    .execute();
  // Découpage par tenant non nécessaire ici : opération globale sûre
}
```

---

## Sécurité & Multi-tenancy

- Toutes les queries filtrent `tenantId` depuis le JWT
- Guards : `@UseGuards(JwtGuard, RolesGuard)` sur tous les endpoints
- Roles : OWNER, MANAGER → tout ; AGENT → create/view uniquement
- Toute tentative d'accès à une facture d'un autre tenant retourne `404`
