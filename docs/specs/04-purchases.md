# 04 — Purchases (Purchase Orders & Reception BLs)

> **Module :** `src/purchases/`
> **Invariants concernés :** R001, R002, R005, R007, R010, R011, R012, R013, R015, R016, R019

---

## 1. Entités

### 1.1 PurchaseOrder

```typescript
@Entity('purchase_orders')
export class PurchaseOrder {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  tenantId: string;

  @Column({ type: 'varchar', length: 20 })
  poNumber: string; // unique per tenant — format PO-YY-### (R013)

  @Column({ type: 'uuid' })
  supplierId: string;

  @Column({
    type: 'enum',
    enum: ['draft', 'sent', 'received', 'cancelled'],
    default: 'draft',
  })
  status: string;

  @Column({ type: 'date' })
  orderDate: Date;

  @Column({ type: 'date', nullable: true })
  expectedDeliveryDate: Date | null;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  subtotal: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  taxAmount: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  total: number;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

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

  @OneToMany(() => PurchaseOrderItem, (item) => item.purchaseOrder, { cascade: true })
  items: PurchaseOrderItem[];

  @OneToMany(() => ReceptionBL, (bl) => bl.purchaseOrder)
  receptions: ReceptionBL[];

  @ManyToOne(() => Supplier)
  @JoinColumn({ name: 'supplierId' })
  supplier: Supplier;
}


**Contrainte unique (migration) :**
```sql
ALTER TABLE "purchase_orders"
  ADD CONSTRAINT "UQ_purchase_orders_po_number_tenant"
  UNIQUE ("poNumber", "tenantId");


---

### 1.2 PurchaseOrderItem

```typescript
@Entity('purchase_order_items')
export class PurchaseOrderItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  tenantId: string;

  @Column({ type: 'uuid' })
  purchaseOrderId: string;

  @Column({ type: 'uuid' })
  rawMaterialId: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  quantity: number;

  @Column({ type: 'varchar', length: 50 })
  unit: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  unitPrice: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  lineTotal: number; // quantity × unitPrice — calculé backend (R008)

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => PurchaseOrder, (po) => po.items)
  @JoinColumn({ name: 'purchaseOrderId' })
  purchaseOrder: PurchaseOrder;

  @ManyToOne(() => RawMaterial)
  @JoinColumn({ name: 'rawMaterialId' })
  rawMaterial: RawMaterial;
}


---

### 1.3 ReceptionBL

```typescript
@Entity('reception_bls')
export class ReceptionBL {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  tenantId: string;

  @Column({ type: 'varchar', length: 30 })
  blNumber: string; // unique per tenant — format BL-REC-YY-### (R013)

  @Column({ type: 'uuid' })
  purchaseOrderId: string;

  @Column({ type: 'date' })
  receptionDate: Date;

  @Column({
    type: 'enum',
    enum: ['pending', 'partial', 'completed'],
    default: 'pending',
  })
  status: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  totalQuantityReceived: number;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

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

  @OneToMany(() => StockEntry, (se) => se.receptionBL)
  stockEntries: StockEntry[];

  @ManyToOne(() => PurchaseOrder, (po) => po.receptions)
  @JoinColumn({ name: 'purchaseOrderId' })
  purchaseOrder: PurchaseOrder;
}


**Contrainte unique (migration) :**
```sql
ALTER TABLE "reception_bls"
  ADD CONSTRAINT "UQ_reception_bls_bl_number_tenant"
  UNIQUE ("blNumber", "tenantId");


---

## 2. Indexes (R016)

```sql
-- purchase_orders
CREATE INDEX "IDX_purchase_orders_tenant_id"    ON "purchase_orders" ("tenantId");
CREATE INDEX "IDX_purchase_orders_supplier_id"  ON "purchase_orders" ("supplierId");
CREATE INDEX "IDX_purchase_orders_status"       ON "purchase_orders" ("status");
CREATE INDEX "IDX_purchase_orders_order_date"   ON "purchase_orders" ("orderDate");
CREATE INDEX "IDX_purchase_orders_deleted_at"   ON "purchase_orders" ("deletedAt");

-- purchase_order_items
CREATE INDEX "IDX_po_items_purchase_order_id"   ON "purchase_order_items" ("purchaseOrderId");
CREATE INDEX "IDX_po_items_tenant_id"           ON "purchase_order_items" ("tenantId");
CREATE INDEX "IDX_po_items_raw_material_id"     ON "purchase_order_items" ("rawMaterialId");

-- reception_bls
CREATE INDEX "IDX_reception_bls_tenant_id"          ON "reception_bls" ("tenantId");
CREATE INDEX "IDX_reception_bls_purchase_order_id"  ON "reception_bls" ("purchaseOrderId");
CREATE INDEX "IDX_reception_bls_status"             ON "reception_bls" ("status");
CREATE INDEX "IDX_reception_bls_deleted_at"         ON "reception_bls" ("deletedAt");


---

## 3. Endpoints

### 3.1 Purchase Orders

| Méthode | Route | Rôles | Description |
|---------|-------|-------|-------------|
| `POST` | `/purchases/purchase-orders` | owner, manager | Créer un bon de commande avec ses lignes |
| `GET` | `/purchases/purchase-orders` | owner, manager, agent | Lister avec pagination et filtres |
| `GET` | `/purchases/purchase-orders/:id` | owner, manager, agent | Détail d'un bon de commande |
| `PUT` | `/purchases/purchase-orders/:id` | owner, manager | Modifier (uniquement si status = draft) |
| `PATCH` | `/purchases/purchase-orders/:id/status` | owner, manager | Changer le statut |
| `DELETE` | `/purchases/purchase-orders/:id` | owner | Soft delete (uniquement si draft ou cancelled) |

**Query params GET liste :**

page        int     défaut 1
limit       int     défaut 20, max 100
status      enum    draft | sent | received | cancelled
supplierId  uuid
dateFrom    date    ISO 8601
dateTo      date    ISO 8601


**tenantId :** toujours extrait du JWT, jamais de l'URL (R003 / sécurité multi-tenant).

---

### 3.2 Reception BLs

| Méthode | Route | Rôles | Description |
|---------|-------|-------|-------------|
| `POST` | `/purchases/reception-bls` | owner, manager | Créer un BL de réception (side effects en transaction) |
| `GET` | `/purchases/reception-bls` | owner, manager, agent | Lister avec pagination |
| `GET` | `/purchases/reception-bls/:id` | owner, manager, agent | Détail avec stock entries |

**Query params GET liste :**

page    int     défaut 1
limit   int     défaut 20
status  enum    pending | partial | completed


---

## 4. Exemples JSON

### POST /purchases/purchase-orders

**Request :**
```json
{
  "supplierId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "orderDate": "2026-06-18",
  "expectedDeliveryDate": "2026-06-25",
  "notes": "Commande urgente — stock bas",
  "items": [
    {
      "rawMaterialId": "mat-uuid-001",
      "quantity": 500,
      "unit": "kg",
      "unitPrice": 120.50
    },
    {
      "rawMaterialId": "mat-uuid-002",
      "quantity": 200,
      "unit": "L",
      "unitPrice": 85.00
    }
  ]
}


**Response 201 :**
```json
{
  "data": {
    "id": "po-uuid-001",
    "tenantId": "tenant-uuid",
    "poNumber": "PO-26-001",
    "supplierId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "status": "draft",
    "orderDate": "2026-06-18",
    "expectedDeliveryDate": "2026-06-25",
    "subtotal": 77250.00,
    "taxAmount": 14677.50,
    "total": 91927.50,
    "notes": "Commande urgente — stock bas",
    "items": [
      {
        "id": "poi-uuid-001",
        "rawMaterialId": "mat-uuid-001",
        "quantity": 500,
        "unit": "kg",
        "unitPrice": 120.50,
        "lineTotal": 60250.00
      },
      {
        "id": "poi-uuid-002",
        "rawMaterialId": "mat-uuid-002",
        "quantity": 200,
        "unit": "L",
        "unitPrice": 85.00,
        "lineTotal": 17000.00
      }
    ],
    "createdAt": "2026-06-18T08:00:00.000Z"
  }
}


---

### POST /purchases/reception-bls

> **Side effects (R005) — tout dans une seule transaction QueryRunner :**
> 1. Crée le `ReceptionBL`
> 2. Crée un `StockEntry` par ligne reçue (status = `available`)
> 3. Met à jour `InventorySummary` : `totalQuantity +=`, `averageCostPerUnit` recalculé, `totalValue` recalculé, `earliestExpirationDate` recalculé
> 4. Met à jour le statut du `PurchaseOrder` → `received` si toutes les quantités sont reçues, sinon reste `sent`

**Request :**
```json
{
  "purchaseOrderId": "po-uuid-001",
  "receptionDate": "2026-06-20",
  "notes": "Livraison conforme, emballage intact",
  "items": [
    {
      "rawMaterialId": "mat-uuid-001",
      "quantityReceived": 500,
      "costPerUnit": 120.50,
      "batchNumber": "LOT-2026-06-A",
      "expiresAt": "2026-12-31"
    },
    {
      "rawMaterialId": "mat-uuid-002",
      "quantityReceived": 200,
      "costPerUnit": 85.00,
      "batchNumber": null,
      "expiresAt": null
    }
  ]
}


**Response 201 :**
```json
{
  "data": {
    "id": "rbl-uuid-001",
    "tenantId": "tenant-uuid",
    "blNumber": "BL-REC-26-001",
    "purchaseOrderId": "po-uuid-001",
    "receptionDate": "2026-06-20",
    "status": "completed",
    "totalQuantityReceived": 700,
    "notes": "Livraison conforme, emballage intact",
    "stockEntriesCreated": [
      {
        "id": "se-uuid-001",
        "rawMaterialId": "mat-uuid-001",
        "quantity": 500,
        "costPerUnit": 120.50,
        "totalCost": 60250.00,
        "batchNumber": "LOT-2026-06-A",
        "expiresAt": "2026-12-31",
        "status": "available"
      },
      {
        "id": "se-uuid-002",
        "rawMaterialId": "mat-uuid-002",
        "quantity": 200,
        "costPerUnit": 85.00,
        "totalCost": 17000.00,
        "batchNumber": null,
        "expiresAt": null,
        "status": "available"
      }
    ],
    "inventorySummaryUpdated": [
      { "rawMaterialId": "mat-uuid-001", "newTotalQuantity": 750 },
      { "rawMaterialId": "mat-uuid-002", "newTotalQuantity": 350 }
    ],
    "createdAt": "2026-06-20T09:15:00.000Z"
  }
}


---

## 5. Workflow


Fournisseur identifié
        │
        ▼
PurchaseOrder [draft]
        │  PATCH /status { status: "sent" }
        ▼
PurchaseOrder [sent]  ──────────────────── PATCH /status { status: "cancelled" }
        │  POST /reception-bls                       │
        ▼                                            ▼
ReceptionBL créé                          PurchaseOrder [cancelled]
        │
        ├─ StockEntry × N  (status: available)
        ├─ InventorySummary mis à jour
        └─ PurchaseOrder → [received] si complet, sinon reste [sent]


**Règle de transition de statut PurchaseOrder :**
- `draft` → `sent` : toujours autorisé
- `sent` → `received` : automatique lors de la création d'un ReceptionBL complet
- `sent` → `cancelled` : autorisé si aucun ReceptionBL existant
- `draft` → `cancelled` : toujours autorisé
- Toute autre transition → HTTP 422

---

## 6. Auto-numérotation (R013)

```typescript
// src/purchases/purchase-orders/purchase-orders.service.ts
async generatePoNumber(queryRunner: QueryRunner, tenantId: string): Promise<string> {
  await queryRunner.query(`SELECT pg_advisory_xact_lock(hashtext('po_number_' || $1))`, [tenantId]);

  const year = new Date().getFullYear();
  const yy = String(year).slice(-2);

  const last = await queryRunner.manager
    .createQueryBuilder(PurchaseOrder, 'po')
    .where('po.tenantId = :tenantId', { tenantId })
    .andWhere(`EXTRACT(YEAR FROM po.createdAt) = :year`, { year })
    .andWhere('po.deletedAt IS NULL')
    .orderBy('po.poNumber', 'DESC')
    .limit(1)
    .getOne();

  const lastSeq = last ? parseInt(last.poNumber.split('-')[2], 10) : 0;
  const next = String(lastSeq + 1).padStart(3, '0');
  return `PO-${yy}-${next}`;
}


Le même pattern s'applique pour `blNumber` avec le préfixe `BL-REC-YY-###` et le lock `'bl_rec_number_' || tenantId`.


---

