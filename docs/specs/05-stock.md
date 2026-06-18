# 05 — Stock (StockEntry & InventorySummary)

> **Module :** `src/stock/`
> **Invariants concernés :** R001, R002, R005, R007, R010, R011, R015, R016, R019

---

## 1. Entités

### 1.1 StockEntry

Chaque ligne représente **un lot de matière première reçue** à un instant T, avec son coût unitaire propre. Le FIFO consomme les entrées les plus anciennes en premier.

```typescript
@Entity('stock_entries')
export class StockEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  tenantId: string;

  @Column({ type: 'uuid' })
  rawMaterialId: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  quantity: number; // quantité restante dans ce lot (décrémentée au fil des livraisons)

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  costPerUnit: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  totalCost: number; // quantity initiale × costPerUnit — non mis à jour lors des décrément

  @Column({ type: 'timestamptz' })
  enteredAt: Date; // date de réception — clé du tri FIFO

  @Column({ type: 'date', nullable: true })
  expiresAt: Date | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  batchNumber: string | null;

  @Column({
    type: 'enum',
    enum: ['available', 'reserved', 'sold', 'adjusted'],
    default: 'available',
  })
  status: string;

  @Column({ type: 'uuid', nullable: true })
  receptionBLId: string | null;

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

  @ManyToOne(() => RawMaterial)
  @JoinColumn({ name: 'rawMaterialId' })
  rawMaterial: RawMaterial;

  @ManyToOne(() => ReceptionBL, (bl) => bl.stockEntries, { nullable: true })
  @JoinColumn({ name: 'receptionBLId' })
  receptionBL: ReceptionBL | null;
}


---

### 1.2 InventorySummary

Vue agrégée **par matière première et par tenant** — mise à jour à chaque réception ou livraison. Evite les recalculs coûteux à la volée.

```typescript
@Entity('inventory_summaries')
export class InventorySummary {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  tenantId: string;

  @Column({ type: 'uuid' })
  rawMaterialId: string; // unique per tenant (contrainte composite)

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  totalQuantity: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  averageCostPerUnit: number; // moyenne pondérée des lots disponibles

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  totalValue: number; // totalQuantity × averageCostPerUnit

  @Column({ type: 'date' })
  lastUpdated: Date;

  @Column({ type: 'date', nullable: true })
  earliestExpirationDate: Date | null; // min(expiresAt) parmi les lots available

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => RawMaterial)
  @JoinColumn({ name: 'rawMaterialId' })
  rawMaterial: RawMaterial;
}


**Contrainte unique (migration) :**
```sql
ALTER TABLE "inventory_summaries"
  ADD CONSTRAINT "UQ_inventory_summaries_material_tenant"
  UNIQUE ("rawMaterialId", "tenantId");


---

## 2. Indexes (R016)

```sql
-- stock_entries
CREATE INDEX "IDX_stock_entries_tenant_id"        ON "stock_entries" ("tenantId");
CREATE INDEX "IDX_stock_entries_raw_material_id"  ON "stock_entries" ("rawMaterialId");
CREATE INDEX "IDX_stock_entries_status"           ON "stock_entries" ("status");
CREATE INDEX "IDX_stock_entries_entered_at"       ON "stock_entries" ("enteredAt");
CREATE INDEX "IDX_stock_entries_expires_at"       ON "stock_entries" ("expiresAt");
CREATE INDEX "IDX_stock_entries_reception_bl_id"  ON "stock_entries" ("receptionBLId");
CREATE INDEX "IDX_stock_entries_deleted_at"       ON "stock_entries" ("deletedAt");

-- inventory_summaries
CREATE INDEX "IDX_inventory_summaries_tenant_id"       ON "inventory_summaries" ("tenantId");
CREATE INDEX "IDX_inventory_summaries_raw_material_id" ON "inventory_summaries" ("rawMaterialId");


---

## 3. Logique FIFO (R015)

### 3.1 Décrément FIFO lors d'un DeliveryNote

```typescript
// src/stock/stock.service.ts

async decrementFIFO(
  queryRunner: QueryRunner,
  tenantId: string,
  materialId: string,
  quantityNeeded: number,
): Promise<void> {
  // Récupère les lots disponibles, plus anciens en premier (FIFO)
  const entries = await queryRunner.manager
    .createQueryBuilder(StockEntry, 'se')
    .where('se.tenantId = :tenantId', { tenantId })
    .andWhere('se.rawMaterialId = :materialId', { materialId })
    .andWhere('se.status = :status', { status: 'available' })
    .andWhere('se.deletedAt IS NULL')
    .orderBy('se.enteredAt', 'ASC') // FIFO : les plus anciens d'abord
    .getMany();

  let remaining = quantityNeeded;

  for (const entry of entries) {
    if (remaining <= 0) break;

    if (entry.quantity <= remaining) {
      // Ce lot est entièrement consommé
      remaining -= entry.quantity;
      entry.quantity = 0;
      entry.status = 'reserved'; // transition: available → reserved
    } else {
      // Ce lot est partiellement consommé
      entry.quantity -= remaining;
      remaining = 0;
      // Le lot reste 'available' car il a encore de la quantité
    }

    await queryRunner.manager.save(StockEntry, entry);
  }

  if (remaining > 0) {
    throw new BadRequestException(
      `Stock insuffisant pour la matière ${materialId} : manque ${remaining} unités`,
    );
  }

  // Mise à jour de l'InventorySummary
  await this.updateInventorySummary(queryRunner, tenantId, materialId);
}


### 3.2 Mise à jour InventorySummary

```typescript
// src/stock/stock.service.ts

async updateInventorySummary(
  queryRunner: QueryRunner,
  tenantId: string,
  materialId: string,
): Promise<void> {
  // Recalcule à partir des lots disponibles uniquement
  const availableEntries = await queryRunner.manager
    .createQueryBuilder(StockEntry, 'se')
    .where('se.tenantId = :tenantId', { tenantId })
    .andWhere('se.rawMaterialId = :materialId', { materialId })
    .andWhere('se.status = :status', { status: 'available' })
    .andWhere('se.deletedAt IS NULL')
    .getMany();

  const totalQuantity = availableEntries.reduce((sum, e) => sum + Number(e.quantity), 0);
  const totalCost = availableEntries.reduce(
    (sum, e) => sum + Number(e.quantity) * Number(e.costPerUnit),
    0,
  );
  const averageCostPerUnit = totalQuantity > 0 ? totalCost / totalQuantity : 0;
  const totalValue = totalQuantity * averageCostPerUnit;

  const expiringEntries = availableEntries
    .filter((e) => e.expiresAt !== null)
    .sort((a, b) => new Date(a.expiresAt!).getTime() - new Date(b.expiresAt!).getTime());

  const earliestExpirationDate =
    expiringEntries.length > 0 ? expiringEntries[0].expiresAt : null;

  const existing = await queryRunner.manager.findOne(InventorySummary, {
    where: { tenantId, rawMaterialId: materialId },
  });

  if (existing) {
    existing.totalQuantity = totalQuantity;
    existing.averageCostPerUnit = averageCostPerUnit;
    existing.totalValue = totalValue;
    existing.lastUpdated = new Date();
    existing.earliestExpirationDate = earliestExpirationDate;
    await queryRunner.manager.save(InventorySummary, existing);
  } else {
    const summary = queryRunner.manager.create(InventorySummary, {
      tenantId,
      rawMaterialId: materialId,
      totalQuantity,
      averageCostPerUnit,
      totalValue,
      lastUpdated: new Date(),
      earliestExpirationDate,
    });
    await queryRunner.manager.save(InventorySummary, summary);
  }
}


---

## 4. Transitions de statut StockEntry


                    ┌─────────────────────────────────────┐
                    │                                     │
               [available] ──────────────────────► [adjusted]
                    │          POST /stock/adjust         │
                    │          (ajustement manuel)        │
                    │                                     │
                    ▼                                     │
               [reserved]   ◄── DeliveryNote créé        │
                    │                                     │
                    ▼                                     │
                 [sold]      ◄── Payment reçu (amountDue = 0)


**Règles :**
- `available → reserved` : lors de la création d'un `DeliveryNote` (FIFO, transaction R005)
- `reserved → sold` : lors de l'enregistrement d'un `Payment` qui solde la facture
- `available → adjusted` : via `POST /stock/adjust`, crée une entrée d'audit
- Aucune autre transition n'est autorisée → HTTP 422

---

## 5. Endpoints

### 5.1 GET /stock/inventory


page          int       défaut 1
limit         int       défaut 20
materialId    uuid      filtre par matière première
lowStockOnly  boolean   retourne uniquement les matières sous le seuil d'alerte
expiringSoon  boolean   retourne uniquement les matières avec expiresAt ≤ 5 jours


**Response 200 :**
```json
{
  "data": [
    {
      "rawMaterialId": "mat-uuid-001",
      "rawMaterialName": "Lait entier",
      "unit": "L",
      "totalQuantity": 1250.00,
      "averageCostPerUnit": 95.50,
      "totalValue": 119375.00,
      "lastUpdated": "2026-06-18",
      "earliestExpirationDate": "2026-06-20",
      "expiryAlert": "red",
      "lowStockAlert": false,
      "stockThreshold": 500
    },
    {
      "rawMaterialId": "mat-uuid-002",
      "rawMaterialName": "Crème fraîche",
      "unit": "kg",
      "totalQuantity": 85.50,
      "averageCostPerUnit": 210.00,
      "totalValue": 17955.00,
      "lastUpdated": "2026-06-17",
      "earliestExpirationDate": "2026-06-23",
      "expiryAlert": "orange",
      "lowStockAlert": true,
      "stockThreshold": 100
    }
  ],
  "pagination": {
    "total": 12,
    "page": 1,
    "limit": 20
  }
}


---

### 5.2 GET /stock/alerts

Retourne les alertes actives du tenant, sans pagination (liste courte par nature).

**Response 200 :**
```json
{
  "data": {
    "expiringSoon": [
      {
        "rawMaterialId": "mat-uuid-001",
        "rawMaterialName": "Lait entier",
        "expiresAt": "2026-06-20",
        "daysUntilExpiry": 2,
        "quantityAtRisk": 300.00,
        "severity": "red"
      },
      {
        "rawMaterialId": "mat-uuid-003",
        "rawMaterialName": "Yaourt nature",
        "expiresAt": "2026-06-22",
        "daysUntilExpiry": 4,
        "quantityAtRisk": 150.00,
        "severity": "orange"
      }
    ],
    "lowStock": [
      {
        "rawMaterialId": "mat-uuid-002",
        "rawMaterialName": "Crème fraîche",
        "totalQuantity": 85.50,
        "stockThreshold": 100,
        "unit": "kg"
      }
    ],
    "summary": {
      "totalExpiringSoon": 2,
      "totalLowStock": 1,
      "criticalCount": 1
    }
  }
}


**Règles d'alerte expiration :**
- `red` : `expiresAt ≤ aujourd'hui + 2 jours`
- `orange` : `expiresAt > aujourd'hui + 2 jours` ET `expiresAt ≤ aujourd'hui + 5 jours`

**Calcul :** basé sur `earliestExpirationDate` de l'`InventorySummary`, confirmé par les `StockEntry` individuels.

---

### 5.3 POST /stock/adjust

Ajustement manuel du stock (inventaire physique, perte, casse).

> **Rôles :** owner, manager uniquement

**Request :**
```json
{
  "rawMaterialId": "mat-uuid-002",
  "quantityAdjustment": -15.50,
  "reason": "loss",
  "notes": "Fuite détectée dans le bac de stockage — lot LOT-2026-05-B"
}


`quantityAdjustment` : positif = ajout, négatif = retrait.

**Side effects (transaction R005) :**
1. Crée une `StockEntry` avec `status = adjusted` et la quantité d'ajustement
2. Met à jour `InventorySummary`
3. Logge l'événement dans la table `stock_adjustments` (audit trail)

**Response 200 :**
```json
{
  "data": {
    "rawMaterialId": "mat-uuid-002",
    "quantityAdjustment": -15.50,
    "reason": "loss",
    "notes": "Fuite détectée dans le bac de stockage — lot LOT-2026-05-B",
    "newTotalQuantity": 70.00,
    "adjustmentEntryId": "se-adj-uuid-001",
    "adjustedAt": "2026-06-18T11:30:00.000Z"
  }
}


**Valeurs autorisées pour `reason` :** `loss`, `breakage`, `physical_count`, `correction`, `other`

---

## 6. Règle de cohérence

À tout moment, pour chaque `(tenantId, rawMaterialId)` :


InventorySummary.totalQuantity
  = SUM(StockEntry.quantity WHERE status = 'available' AND deletedAt IS NULL)

InventorySummary.totalValue
  = SUM(StockEntry.quantity × StockEntry.costPerUnit WHERE status = 'available' AND deletedAt IS NULL)


Cette invariante est maintenue par le service via `updateInventorySummary()` appelé dans chaque transaction qui modifie des `StockEntry`.


---

