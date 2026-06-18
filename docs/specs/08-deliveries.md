# 08 — Deliveries (Bons de Livraison)

> **Invariants concernés :** R001, R002, R005, R007, R008, R010, R011, R013, R014, R015, R016, R018, R019

---

## Entities

### DeliveryNote

```typescript
@Entity('delivery_notes')
export class DeliveryNote {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  tenantId: string;

  @Column({ type: 'varchar', length: 20 })
  blNumber: string; // unique per tenant — format BL-YY-###, generated with advisory lock (R013)

  @Column({ type: 'uuid' })
  customerId: string;

  @Column({ type: 'date' })
  deliveryDate: Date;

  @Column({
    type: 'enum',
    enum: ['draft', 'sent', 'signed', 'delivered'],
    default: 'draft',
  })
  status: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  subtotal: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  taxAmount: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  total: number;

  @Column({ type: 'text', nullable: true })
  customerSignature?: string; // base64

  @Column({ type: 'date', nullable: true })
  signedDate?: Date;

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

  @OneToMany(() => DeliveryNoteItem, (item) => item.deliveryNote, { cascade: true })
  items: DeliveryNoteItem[];

  @OneToOne(() => SalesInvoice, (invoice) => invoice.deliveryNote, { nullable: true })
  invoice?: SalesInvoice;
}
```

**Contraintes DB :**
```sql
UNIQUE ("tenantId", "blNumber")
INDEX IDX_delivery_notes_tenant_id       ON delivery_notes (tenantId)
INDEX IDX_delivery_notes_customer_id     ON delivery_notes (customerId)
INDEX IDX_delivery_notes_status          ON delivery_notes (status)
INDEX IDX_delivery_notes_delivery_date   ON delivery_notes (deliveryDate)
INDEX IDX_delivery_notes_deleted_at      ON delivery_notes (deletedAt)
```

---

### DeliveryNoteItem

```typescript
@Entity('delivery_note_items')
export class DeliveryNoteItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  tenantId: string;

  @Column({ type: 'uuid' })
  deliveryNoteId: string;

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
  taxName1?: string; // e.g. "TVA"

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  taxRate1?: number; // e.g. 19.00

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  taxAmount1: number; // quantity × unitPrice × (taxRate1 / 100)

  // Tax 2
  @Column({ type: 'varchar', length: 50, nullable: true })
  taxName2?: string;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  taxRate2?: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  taxAmount2: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  lineTaxTotal: number; // taxAmount1 + taxAmount2

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  lineTotal: number; // (quantity × unitPrice) + lineTaxTotal

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  // Relations
  @ManyToOne(() => DeliveryNote, (dn) => dn.items)
  @JoinColumn({ name: 'deliveryNoteId' })
  deliveryNote: DeliveryNote;

  @ManyToOne(() => FinishedProduct)
  @JoinColumn({ name: 'finishedProductId' })
  finishedProduct: FinishedProduct;
}
```

**Contraintes DB :**
```sql
INDEX IDX_delivery_note_items_delivery_note_id  ON delivery_note_items (deliveryNoteId)
INDEX IDX_delivery_note_items_tenant_id          ON delivery_note_items (tenantId)
INDEX IDX_delivery_note_items_product_id         ON delivery_note_items (finishedProductId)
```

---

## Calcul des montants (backend uniquement — R008)

```
taxAmount1   = quantity × unitPrice × (taxRate1 / 100)
taxAmount2   = quantity × unitPrice × (taxRate2 / 100)
lineTaxTotal = taxAmount1 + taxAmount2
lineTotal    = (quantity × unitPrice) + lineTaxTotal
subtotal     = SUM(quantity × unitPrice)          ← HT uniquement
taxAmount    = SUM(lineTaxTotal) across all items
total        = subtotal + taxAmount
```

---

## Numérotation automatique (R013)

Format par défaut : `BL-YY-###` (configurable dans Settings)

```typescript
// Génération avec advisory lock PostgreSQL dans une transaction
await queryRunner.query(`SELECT pg_advisory_xact_lock(2)`); // lock id distinct par type
const last = await queryRunner.manager
  .createQueryBuilder(DeliveryNote, 'dn')
  .where('dn.tenantId = :tenantId', { tenantId })
  .andWhere('EXTRACT(YEAR FROM dn.createdAt) = :year', { year })
  .andWhere('dn.deletedAt IS NULL')
  .orderBy('dn.blNumber', 'DESC')
  .limit(1)
  .getOne();
const seq = last ? parseInt(last.blNumber.split('-')[2]) + 1 : 1;
return `BL-${String(year).slice(-2)}-${String(seq).padStart(3, '0')}`;
// Exemples : BL-24-001, BL-24-002, BL-25-001
```

---

## Endpoints

### POST /api/v1/deliveries/delivery-notes

Crée un BL en statut `draft`. Décrémente le stock FIFO dans une transaction (R005, R015).

**Side effects obligatoires (transaction unique) :**
1. Génération du `blNumber` avec advisory lock
2. Sauvegarde du `DeliveryNote` et de ses `items`
3. Décrémentation FIFO des `StockEntry` (status `available → reserved`)

**Request :**
```json
POST /api/v1/deliveries/delivery-notes
Authorization: Bearer <token>

{
  "customerId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "deliveryDate": "2024-06-15",
  "notes": "Livraison urgente",
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
    },
    {
      "finishedProductId": "7cb1a3e2-1234-4abc-9def-000000000002",
      "quantity": 5.00,
      "unit": "unité",
      "unitPrice": 1200.00,
      "taxName1": "TVA",
      "taxRate1": 19.00,
      "taxName2": "Timbre",
      "taxRate2": 1.00
    }
  ]
}
```

**Response 201 :**
```json
{
  "data": {
    "id": "a1b2c3d4-0000-0000-0000-000000000001",
    "tenantId": "tenant-uuid",
    "blNumber": "BL-24-001",
    "customerId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    "deliveryDate": "2024-06-15",
    "status": "draft",
    "subtotal": 8500.00,
    "taxAmount": 1633.00,
    "total": 10133.00,
    "notes": "Livraison urgente",
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
      },
      {
        "id": "item-uuid-2",
        "finishedProductId": "7cb1a3e2-1234-4abc-9def-000000000002",
        "quantity": 5.00,
        "unit": "unité",
        "unitPrice": 1200.00,
        "taxName1": "TVA",
        "taxRate1": 19.00,
        "taxAmount1": 1140.00,
        "taxName2": "Timbre",
        "taxRate2": 1.00,
        "taxAmount2": 60.00,
        "lineTaxTotal": 1200.00,
        "lineTotal": 7200.00
      }
    ],
    "createdAt": "2024-06-15T08:30:00Z",
    "updatedAt": "2024-06-15T08:30:00Z"
  }
}
```

**Erreurs possibles :**
- `400` — stock insuffisant pour un ou plusieurs produits
- `404` — client ou produit introuvable (ou appartient à un autre tenant)
- `409` — conflit de numéro BL (rare, géré par le lock)

---

### GET /api/v1/deliveries/delivery-notes

**Query params :** `page`, `limit`, `status`, `customerId`, `dateFrom`, `dateTo`

**Response 200 :**
```json
{
  "data": [
    {
      "id": "a1b2c3d4-0000-0000-0000-000000000001",
      "blNumber": "BL-24-001",
      "customerId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
      "customer": { "id": "...", "name": "Client SARL" },
      "deliveryDate": "2024-06-15",
      "status": "draft",
      "subtotal": 8500.00,
      "taxAmount": 1633.00,
      "total": 10133.00,
      "createdAt": "2024-06-15T08:30:00Z"
    }
  ],
  "pagination": {
    "total": 42,
    "page": 1,
    "limit": 20
  }
}
```

---

### GET /api/v1/deliveries/delivery-notes/:id

**Response 200 :** objet complet avec `items`, `customer`, `invoice` (si lié).

```json
{
  "data": {
    "id": "a1b2c3d4-0000-0000-0000-000000000001",
    "blNumber": "BL-24-001",
    "status": "signed",
    "customer": { "id": "...", "name": "Client SARL", "address": "..." },
    "items": [ /* ... voir POST response */ ],
    "subtotal": 8500.00,
    "taxAmount": 1633.00,
    "total": 10133.00,
    "customerSignature": null,
    "signedDate": null,
    "invoice": null,
    "createdAt": "2024-06-15T08:30:00Z",
    "updatedAt": "2024-06-15T08:30:00Z"
  }
}
```

---

### PUT /api/v1/deliveries/delivery-notes/:id

Modification complète. **Uniquement si `status = draft`.**

Recalcule tous les montants. Si les items changent, recalcule le stock FIFO dans une transaction (annule l'ancienne réservation, applique la nouvelle).

**Request :** même format que POST (items complets).

**Response 200 :** objet mis à jour (même format que GET /:id).

**Erreurs :**
- `409` — BL non en statut draft

---

### PATCH /api/v1/deliveries/delivery-notes/:id/status

**Request :**
```json
{ "status": "sent" }
```

**Transitions autorisées :**
```
draft    → sent
sent     → signed
signed   → delivered
```

**Response 200 :**
```json
{ "data": { "id": "...", "blNumber": "BL-24-001", "status": "sent" } }
```

---

### PATCH /api/v1/deliveries/delivery-notes/:id/signature

Enregistre la signature électronique du client. Passe automatiquement le statut à `signed`.

**Request :**
```json
{
  "customerSignature": "data:image/png;base64,iVBORw0KGgoAAAANS...",
  "signedDate": "2024-06-15"
}
```

**Response 200 :**
```json
{
  "data": {
    "id": "a1b2c3d4-0000-0000-0000-000000000001",
    "blNumber": "BL-24-001",
    "status": "signed",
    "signedDate": "2024-06-15",
    "customerSignature": "data:image/png;base64,iVBORw0KGgoAAAANS..."
  }
}
```

---

### GET /api/v1/deliveries/delivery-notes/:id/pdf

Retourne le PDF en binaire. Génère si absent, sert depuis le cache sinon.

**Archivage (R014) :**
```
ARCHIVES/2024/06/BL/BL-24-001.pdf
```

**Response :**
```
HTTP 200
Content-Type: application/pdf
Content-Disposition: attachment; filename="BL-24-001.pdf"
<binary stream>
```

---

### POST /api/v1/deliveries/delivery-notes/:id/send-email

Génère le PDF, l'attache à un email, l'envoie au client. Passe le statut à `sent`.

**Request :**
```json
{
  "recipientEmail": "client@exemple.dz",
  "subject": "Bon de livraison BL-24-001",
  "message": "Veuillez trouver ci-joint votre bon de livraison."
}
```

**Response 200 :**
```json
{ "data": { "sent": true, "to": "client@exemple.dz", "status": "sent" } }
```

---

### DELETE /api/v1/deliveries/delivery-notes/:id

Soft delete (R011). **Uniquement si `status = draft`** (un BL envoyé ou signé ne peut pas être supprimé).

Annule les réservations stock dans une transaction.

**Response 204 :** no content.

---

## Workflow complet

```
draft ──(email/print)──► sent ──(signature)──► signed ──(remise physique)──► delivered
                                                                                   │
                                                                    ┌──────────────┘
                                                                    ▼
                                                         POST /invoices/sales-invoices
                                                         { deliveryNoteId: "..." }
```

| Statut | Modification | Suppression | Signature | Créer facture |
|--------|-------------|-------------|-----------|---------------|
| draft | ✅ | ✅ | ❌ | ❌ |
| sent | ❌ | ❌ | ✅ | ❌ |
| signed | ❌ | ❌ | ❌ | ✅ |
| delivered | ❌ | ❌ | ❌ | ✅ |

---

## Sécurité & Multi-tenancy

- Toutes les queries filtrent `tenantId` depuis le JWT (R003)
- Guards : `@UseGuards(JwtGuard, RolesGuard)` sur tous les endpoints
- Roles : OWNER, MANAGER → tout ; AGENT → create/view uniquement
- Toute tentative d'accès à un BL d'un autre tenant retourne `404` (pas `403`)
