# 06 — Customers & Finished Products

> **Module :** `src/customers/` et `src/products/`
> **Invariants concernés :** R001, R002, R007, R010, R011, R016, R018, R019

---

## 1. Entités

### 1.1 Customer

```typescript
@Entity('customers')
export class Customer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  tenantId: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  contactPerson: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  phone: string | null;

  @Column({ type: 'text', nullable: true })
  address: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  city: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  country: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

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

  @OneToMany(() => DeliveryNote, (dn) => dn.customer)
  deliveryNotes: DeliveryNote[];

  @OneToMany(() => SalesInvoice, (inv) => inv.customer)
  invoices: SalesInvoice[];

  @OneToMany(() => Quote, (q) => q.customer)
  quotes: Quote[];
}


---

### 1.2 FinishedProduct

Représente un **produit fini vendable** (à distinguer des matières premières du module stock).

```typescript
@Entity('finished_products')
export class FinishedProduct {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  tenantId: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 100 })
  code: string; // unique per tenant

  @Column({ type: 'varchar', length: 50 })
  unit: string; // ex: kg, L, pièce, carton

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  defaultSalesPrice: number;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

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

  @OneToMany(() => DeliveryNoteItem, (item) => item.finishedProduct)
  deliveryNoteItems: DeliveryNoteItem[];

  @OneToMany(() => SalesInvoiceItem, (item) => item.finishedProduct)
  invoiceItems: SalesInvoiceItem[];

  @OneToMany(() => QuoteItem, (item) => item.finishedProduct)
  quoteItems: QuoteItem[];
}


**Contrainte unique (migration) :**
```sql
ALTER TABLE "finished_products"
  ADD CONSTRAINT "UQ_finished_products_code_tenant"
  UNIQUE ("code", "tenantId");


---

## 2. Indexes (R016)

```sql
-- customers
CREATE INDEX "IDX_customers_tenant_id"   ON "customers" ("tenantId");
CREATE INDEX "IDX_customers_is_active"   ON "customers" ("isActive");
CREATE INDEX "IDX_customers_deleted_at"  ON "customers" ("deletedAt");
CREATE INDEX "IDX_customers_email"       ON "customers" ("email");

-- finished_products
CREATE INDEX "IDX_finished_products_tenant_id"  ON "finished_products" ("tenantId");
CREATE INDEX "IDX_finished_products_is_active"  ON "finished_products" ("isActive");
CREATE INDEX "IDX_finished_products_deleted_at" ON "finished_products" ("deletedAt");


---

## 3. Endpoints — Customers

| Méthode | Route | Rôles | Description |
|---------|-------|-------|-------------|
| `POST` | `/customers` | owner, manager | Créer un client |
| `GET` | `/customers` | owner, manager, agent | Lister avec pagination et filtres |
| `GET` | `/customers/:id` | owner, manager, agent | Détail + historique |
| `PUT` | `/customers/:id` | owner, manager | Modifier |
| `DELETE` | `/customers/:id` | owner | Soft delete |

**Query params GET /customers :**

page      int       défaut 1
limit     int       défaut 20
search    string    cherche dans name, contactPerson, email, phone (ILIKE)
isActive  boolean   filtre par statut actif/inactif


**GET /customers/:id** retourne le client avec son historique :
- 5 derniers BL de livraison (numéro, date, montant, statut)
- 5 dernières factures (numéro, date, montant, statut)
- Revenu total (SUM des factures payées)
- Nombre total de commandes

---

## 4. Endpoints — Finished Products

| Méthode | Route | Rôles | Description |
|---------|-------|-------|-------------|
| `POST` | `/products` | owner, manager | Créer un produit fini |
| `GET` | `/products` | owner, manager, agent | Lister avec pagination |
| `GET` | `/products/:id` | owner, manager, agent | Détail |
| `PUT` | `/products/:id` | owner, manager | Modifier |
| `DELETE` | `/products/:id` | owner | Soft delete (interdit si utilisé dans un BL ou facture actif) |

**Query params GET /products :**

page      int       défaut 1
limit     int       défaut 20
search    string    cherche dans name, code
isActive  boolean


---

## 5. Exemples JSON

### POST /customers

**Request :**
```json
{
  "name": "Laiterie du Plateau SPA",
  "contactPerson": "Mme Zineb Boucherit",
  "email": "commandes@laiterie-plateau.dz",
  "phone": "+213 21 55 44 33",
  "address": "Zone Industrielle, Lot 12",
  "city": "Médéa",
  "country": "Algérie",
  "notes": "Client prioritaire, paiement à 30 jours"
}


**Response 201 :**
```json
{
  "data": {
    "id": "cust-uuid-001",
    "tenantId": "tenant-uuid",
    "name": "Laiterie du Plateau SPA",
    "contactPerson": "Mme Zineb Boucherit",
    "email": "commandes@laiterie-plateau.dz",
    "phone": "+213 21 55 44 33",
    "address": "Zone Industrielle, Lot 12",
    "city": "Médéa",
    "country": "Algérie",
    "notes": "Client prioritaire, paiement à 30 jours",
    "isActive": true,
    "createdAt": "2026-06-18T10:00:00.000Z"
  }
}


---

### GET /customers/:id (avec historique)

**Response 200 :**
```json
{
  "data": {
    "id": "cust-uuid-001",
    "tenantId": "tenant-uuid",
    "name": "Laiterie du Plateau SPA",
    "contactPerson": "Mme Zineb Boucherit",
    "email": "commandes@laiterie-plateau.dz",
    "phone": "+213 21 55 44 33",
    "address": "Zone Industrielle, Lot 12",
    "city": "Médéa",
    "country": "Algérie",
    "notes": "Client prioritaire, paiement à 30 jours",
    "isActive": true,
    "createdAt": "2026-01-10T08:00:00.000Z",
    "history": {
      "totalRevenue": 4875000.00,
      "totalOrders": 23,
      "lastDeliveryNotes": [
        {
          "id": "dn-uuid-010",
          "blNumber": "BL-26-023",
          "date": "2026-06-15",
          "total": 187500.00,
          "status": "delivered"
        },
        {
          "id": "dn-uuid-009",
          "blNumber": "BL-26-019",
          "date": "2026-06-01",
          "total": 220000.00,
          "status": "delivered"
        }
      ],
      "lastInvoices": [
        {
          "id": "inv-uuid-015",
          "invoiceNumber": "FAC-26-015",
          "date": "2026-06-15",
          "total": 223125.00,
          "amountDue": 0,
          "status": "paid"
        },
        {
          "id": "inv-uuid-012",
          "invoiceNumber": "FAC-26-012",
          "date": "2026-06-01",
          "total": 261800.00,
          "amountDue": 261800.00,
          "status": "sent"
        }
      ]
    }
  }
}


---

### POST /products

**Request :**
```json
{
  "name": "Fromage frais 250g",
  "code": "FF-250",
  "unit": "pièce",
  "defaultSalesPrice": 195.00,
  "description": "Fromage frais nature, emballage sous vide 250g"
}


**Response 201 :**
```json
{
  "data": {
    "id": "prod-uuid-001",
    "tenantId": "tenant-uuid",
    "name": "Fromage frais 250g",
    "code": "FF-250",
    "unit": "pièce",
    "defaultSalesPrice": 195.00,
    "description": "Fromage frais nature, emballage sous vide 250g",
    "isActive": true,
    "createdAt": "2026-06-18T10:30:00.000Z"
  }
}


---

## 6. Règles métier

- Un client soft-deleté n'apparaît plus dans les listes (`deletedAt IS NULL` — R011), mais ses BLs et factures historiques restent accessibles via les routes de détail.
- Un produit ne peut être soft-deleté que s'il n'est lié à aucun BL ou facture avec statut autre que `cancelled`. Sinon → HTTP 422 avec message i18n.
- Le champ `defaultSalesPrice` est une **suggestion** : chaque ligne de BL ou facture peut avoir son propre `unitPrice`. Le calcul reste backend (R008).
- `tenantId` est toujours injecté depuis le JWT — jamais envoyé dans le body de la requête.


---

