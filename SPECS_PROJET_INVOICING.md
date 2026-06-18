# 📋 SPÉCIFICATIONS DÉTAILLÉES - SYSTÈME D'INVOICING CHAMBRE FROIDE

**Projet:** Chambre Froide Djelfa - Solution Invoicing SaaS  
**Stack:** NestJS + PostgreSQL + React + TypeScript  
**Inspiration:** Invoice Ninja V5 (patterns, workflows, architecture)  
**Nouveau:** Technologies modernes (pas PHP)  
**Scope:** Web + Backend UNIQUEMENT (mobile = phase 2)

---

## **TABLE DES MATIÈRES**

1. [Vue d'ensemble](#vue-densemble)
2. [Architecture générale](#architecture-générale)
3. [Database Schema (15 Entities TypeORM)](#database-schema)
4. [API Endpoints (NestJS)](#api-endpoints)
5. [Features Détaillées](#features-détaillées)
6. [Workflows](#workflows)
7. [Interface Web (React)](#interface-web-react)
8. [Authentification & Autorisation](#authentification--autorisation)
9. [Validations & Erreurs](#validations--erreurs)
10. [Déploiement](#déploiement)

---

## **VUE D'ENSEMBLE**

### Objectif

Créer une plateforme invoicing SaaS **freemium** pour le marché algérien, optimisée pour:
- **Gestion fournisseurs & matière première** (cycle achat)
- **Gestion clients & produits finis** (cycle vente)
- **Suivi des frais & coûts**
- **Dashboards & rapports** en temps réel
- **Auto-numérotation & auto-calculs**

### Cas d'usage principal

Agent en chambre froide:
1. ✅ Crée BL de vente (sélectionne client + produits)
2. ✅ Stock baisse **automatiquement**
3. ✅ Génère PDF (imprime pour client)
4. ✅ Crée facture (depuis BL)
5. ✅ TVA 19% auto-calculée
6. ✅ Manager voit tout en temps réel (dashboard)

### Modèle économique

```
Freemium:
├─ 10 factures/mois gratuit
├─ 5 utilisateurs max
└─ Features de base

Pro:
├─ Illimité factures
├─ Utilisateurs illimités
└─ 500 DZD/mois
```

---

## **ARCHITECTURE GÉNÉRALE**

### Stack technique

```
┌─────────────────────────────────────────────┐
│         ARCHITECTURE 3-TIERS                │
├─────────────────────────────────────────────┤
│                                             │
│  FRONTEND (Web)                             │
│  ├─ React 19 + TypeScript                  │
│  ├─ Vite (bundler)                         │
│  ├─ TailwindCSS (styling)                  │
│  ├─ react-query (API client)               │
│  ├─ Zustand (state management)             │
│  └─ 8 onglets principaux                   │
│                                             │
│  ↓ HTTP REST API ↓                         │
│                                             │
│  BACKEND (API)                              │
│  ├─ NestJS 10+ (Node.js runtime)           │
│  ├─ TypeORM (ORM)                          │
│  ├─ JWT (authentication)                   │
│  ├─ OpenAPI/Swagger (documentation)        │
│  ├─ Class-validator (validation)           │
│  └─ 15 modules (features)                  │
│                                             │
│  ↓ SQL Queries ↓                           │
│                                             │
│  DATABASE                                   │
│  ├─ PostgreSQL 14+                         │
│  ├─ 15 tables TypeORM                      │
│  ├─ Migrations (auto)                      │
│  ├─ Indexes (performance)                  │
│  └─ Soft deletes (audit)                   │
│                                             │
│  STORAGE                                    │
│  ├─ S3 ou Local (PDFs, images)             │
│  └─ Archive: YYYY/MM/TYPE/filename.pdf     │
│                                             │
└─────────────────────────────────────────────┘
```

### Dossier structure (NestJS)

```
src/
├─ main.ts                           ← Entry point
├─ app.module.ts                     ← Root module
│
├─ auth/                             ← Module authentication
│  ├─ auth.module.ts
│  ├─ auth.controller.ts
│  ├─ auth.service.ts
│  ├─ jwt.strategy.ts
│  └─ guards/jwt.guard.ts
│
├─ users/                            ← Module users
│  ├─ users.module.ts
│  ├─ users.controller.ts
│  ├─ users.service.ts
│  ├─ dto/create-user.dto.ts
│  └─ entities/user.entity.ts
│
├─ suppliers/                        ← Module fournisseurs
│  ├─ suppliers.module.ts
│  ├─ suppliers.controller.ts
│  ├─ suppliers.service.ts
│  ├─ dto/create-supplier.dto.ts
│  └─ entities/supplier.entity.ts
│
├─ raw-materials/                    ← Module matière première
│  ├─ raw-materials.module.ts
│  ├─ raw-materials.controller.ts
│  ├─ raw-materials.service.ts
│  └─ entities/raw-material.entity.ts
│
├─ purchases/                        ← Module achats
│  ├─ purchase-orders/
│  │  ├─ purchase-orders.controller.ts
│  │  ├─ purchase-orders.service.ts
│  │  └─ entities/purchase-order.entity.ts
│  │
│  ├─ purchase-order-items/
│  │  └─ entities/purchase-order-item.entity.ts
│  │
│  ├─ reception-bls/
│  │  ├─ reception-bls.controller.ts
│  │  ├─ reception-bls.service.ts
│  │  └─ entities/reception-bl.entity.ts
│  │
│  └─ purchases.module.ts
│
├─ stock/                           ← Module stock
│  ├─ stock.module.ts
│  ├─ stock.controller.ts
│  ├─ stock.service.ts
│  ├─ entities/stock-entry.entity.ts
│  ├─ entities/inventory-summary.entity.ts
│  └─ stock.service.ts (logique FIFO)
│
├─ customers/                       ← Module clients
│  ├─ customers.module.ts
│  ├─ customers.controller.ts
│  ├─ customers.service.ts
│  └─ entities/customer.entity.ts
│
├─ deliveries/                      ← Module bons livraison
│  ├─ delivery-notes/
│  │  ├─ delivery-notes.controller.ts
│  │  ├─ delivery-notes.service.ts
│  │  └─ entities/delivery-note.entity.ts
│  │
│  ├─ delivery-note-items/
│  │  └─ entities/delivery-note-item.entity.ts
│  │
│  ├─ pdf.service.ts                ← Génération PDF
│  └─ deliveries.module.ts
│
├─ invoices/                        ← Module factures
│  ├─ sales-invoices/
│  │  ├─ sales-invoices.controller.ts
│  │  ├─ sales-invoices.service.ts
│  │  └─ entities/sales-invoice.entity.ts
│  │
│  ├─ sales-invoice-items/
│  │  └─ entities/sales-invoice-item.entity.ts
│  │
│  ├─ payments/
│  │  ├─ payments.controller.ts
│  │  ├─ payments.service.ts
│  │  └─ entities/payment.entity.ts
│  │
│  ├─ pdf.service.ts                ← Génération PDF facture
│  ├─ email.service.ts              ← Email client
│  └─ invoices.module.ts
│
├─ expenses/                        ← Module frais
│  ├─ expenses.module.ts
│  ├─ expenses.controller.ts
│  ├─ expenses.service.ts
│  ├─ dto/create-expense.dto.ts
│  └─ entities/expense.entity.ts
│
├─ dashboard/                       ← Module dashboard
│  ├─ dashboard.module.ts
│  ├─ dashboard.controller.ts
│  ├─ dashboard.service.ts          ← Calcule KPI, charts
│  └─ dto/dashboard-stats.dto.ts
│
├─ reports/                         ← Module rapports
│  ├─ reports.module.ts
│  ├─ reports.controller.ts
│  ├─ reports.service.ts
│  ├─ csv.service.ts
│  └─ pdf.service.ts
│
├─ settings/                        ← Module paramètres
│  ├─ settings.module.ts
│  ├─ settings.controller.ts
│  ├─ settings.service.ts
│  └─ entities/settings.entity.ts
│
├─ common/
│  ├─ constants.ts                 ← Constantes (TVA, formats)
│  ├─ decorators/
│  │  └─ current-user.decorator.ts
│  ├─ filters/
│  │  └─ exception.filter.ts
│  ├─ guards/
│  │  └─ roles.guard.ts
│  └─ pipes/
│     └─ validation.pipe.ts
│
├─ database/
│  ├─ migrations/                  ← TypeORM migrations
│  └─ seeds/                       ← Données initiales
│
└─ config/
   ├─ database.config.ts
   ├─ jwt.config.ts
   ├─ storage.config.ts
   └─ email.config.ts
```

---

## **DATABASE SCHEMA**

### 15 Entities TypeORM

#### **CYCLE ACHAT (Matière Première)**

##### 1. Supplier (Fournisseurs)

```typescript
// src/suppliers/entities/supplier.entity.ts

@Entity('suppliers')
export class Supplier {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;                    // "AGRI Sidi Aissa"

  @Column({ nullable: true })
  contactPerson: string;           // "Ahmed Sidi"

  @Column({ nullable: true })
  email: string;

  @Column({ nullable: true })
  phone: string;                   // "+213 555 111111"

  @Column({ nullable: true })
  address: string;

  @Column({ nullable: true })
  city: string;

  @Column({ nullable: true })
  country: string;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt: Date;                 // Soft delete

  // Relations
  @OneToMany(() => RawMaterial, material => material.supplier)
  rawMaterials: RawMaterial[];

  @OneToMany(() => PurchaseOrder, po => po.supplier)
  purchaseOrders: PurchaseOrder[];
}
```

##### 2. RawMaterial (Matière Première)

```typescript
@Entity('raw_materials')
export class RawMaterial {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;                    // "Tomate Fraîche"

  @Column()
  code: string;                    // "TOM-01"

  @Column()
  unit: string;                    // "kg"

  @Column('decimal', { precision: 10, scale: 2, default: 0 })
  lastCostPerUnit: number;         // Dernier coût

  @ManyToOne(() => Supplier)
  @JoinColumn()
  supplier: Supplier;

  @Column({ nullable: true })
  supplierId: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt: Date;

  // Relations
  @OneToMany(() => PurchaseOrderItem, item => item.rawMaterial)
  purchaseOrderItems: PurchaseOrderItem[];

  @OneToMany(() => StockEntry, entry => entry.rawMaterial)
  stockEntries: StockEntry[];
}
```

##### 3. PurchaseOrder (Commandes Achat)

```typescript
@Entity('purchase_orders')
export class PurchaseOrder {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  poNumber: string;                // "PO-24-001"

  @ManyToOne(() => Supplier)
  @JoinColumn()
  supplier: Supplier;

  @Column()
  supplierId: string;

  @Column({ type: 'enum', enum: ['draft', 'sent', 'received', 'cancelled'] })
  status: string;                  // draft → sent → received

  @Column({ type: 'date' })
  orderDate: Date;

  @Column({ type: 'date', nullable: true })
  expectedDeliveryDate: Date;

  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  subtotal: number;

  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  taxAmount: number;

  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  total: number;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt: Date;

  // Relations
  @OneToMany(() => PurchaseOrderItem, item => item.purchaseOrder, { cascade: true })
  items: PurchaseOrderItem[];

  @OneToOne(() => ReceptionBL, reception => reception.purchaseOrder)
  reception: ReceptionBL;
}
```

##### 4. PurchaseOrderItem (Lignes Commande)

```typescript
@Entity('purchase_order_items')
export class PurchaseOrderItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => PurchaseOrder, po => po.items, { onDelete: 'CASCADE' })
  @JoinColumn()
  purchaseOrder: PurchaseOrder;

  @Column()
  purchaseOrderId: string;

  @ManyToOne(() => RawMaterial)
  @JoinColumn()
  rawMaterial: RawMaterial;

  @Column()
  rawMaterialId: string;

  @Column('decimal', { precision: 10, scale: 2 })
  quantity: number;

  @Column()
  unit: string;                    // "kg"

  @Column('decimal', { precision: 10, scale: 2 })
  unitPrice: number;

  @Column('decimal', { precision: 12, scale: 2 })
  lineTotal: number;               // quantity × unitPrice

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
```

##### 5. ReceptionBL (BL d'Achat/Réception)

```typescript
@Entity('reception_bls')
export class ReceptionBL {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  blNumber: string;                // "BL-REC-24-001"

  @OneToOne(() => PurchaseOrder)
  @JoinColumn()
  purchaseOrder: PurchaseOrder;

  @Column()
  purchaseOrderId: string;

  @Column({ type: 'date' })
  receptionDate: Date;

  @Column({ type: 'enum', enum: ['pending', 'completed', 'partial'] })
  status: string;

  @Column('decimal', { precision: 10, scale: 2 })
  totalQuantityReceived: number;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt: Date;

  // Relations
  @OneToMany(() => StockEntry, entry => entry.receptionBL)
  stockEntries: StockEntry[];
}
```

##### 6. StockEntry (Entrées Stock)

```typescript
@Entity('stock_entries')
export class StockEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => RawMaterial)
  @JoinColumn()
  rawMaterial: RawMaterial;

  @Column()
  rawMaterialId: string;

  @Column('decimal', { precision: 10, scale: 2 })
  quantity: number;                // Quantité

  @Column('decimal', { precision: 10, scale: 2 })
  costPerUnit: number;             // Coût unitaire d'achat

  @Column('decimal', { precision: 12, scale: 2 })
  totalCost: number;               // quantity × costPerUnit

  @Column({ type: 'date' })
  enteredAt: Date;

  @Column({ type: 'date' })
  expiresAt: Date;                 // Date d'expiration

  @Column({ nullable: true })
  batchNumber: string;             // Numéro de lot (optionnel)

  @Column({ type: 'enum', enum: ['available', 'reserved', 'sold'] })
  status: string;                  // Statut stock

  @ManyToOne(() => ReceptionBL)
  @JoinColumn()
  receptionBL: ReceptionBL;

  @Column({ nullable: true })
  receptionBLId: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt: Date;
}
```

##### 7. InventorySummary (Résumé Stock)

```typescript
@Entity('inventory_summaries')
export class InventorySummary {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => RawMaterial)
  @JoinColumn()
  rawMaterial: RawMaterial;

  @Column()
  rawMaterialId: string;

  @Column('decimal', { precision: 10, scale: 2 })
  totalQuantity: number;           // Quantité totale

  @Column('decimal', { precision: 10, scale: 2 })
  averageCostPerUnit: number;      // Coût moyen

  @Column('decimal', { precision: 12, scale: 2 })
  totalValue: number;              // Stock value

  @Column({ type: 'date' })
  lastUpdated: Date;

  @Column({ nullable: true, type: 'date' })
  earliestExpirationDate: Date;    // Proche expiration

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
```

---

#### **CYCLE VENTE (Produits Finis)**

##### 8. Customer (Clients)

```typescript
@Entity('customers')
export class Customer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;                    // "Marché Central Djelfa"

  @Column({ nullable: true })
  contactPerson: string;

  @Column({ nullable: true })
  email: string;

  @Column({ nullable: true })
  phone: string;

  @Column({ nullable: true })
  address: string;

  @Column({ nullable: true })
  city: string;

  @Column({ nullable: true })
  country: string;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt: Date;

  // Relations
  @OneToMany(() => DeliveryNote, dn => dn.customer)
  deliveryNotes: DeliveryNote[];

  @OneToMany(() => SalesInvoice, inv => inv.customer)
  invoices: SalesInvoice[];
}
```

##### 9. FinishedProduct (Produits Finis)

```typescript
@Entity('finished_products')
export class FinishedProduct {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;                    // "Tomate 5kg", "Carotte 5kg"

  @Column()
  code: string;                    // "TOMA-5KG"

  @Column()
  unit: string;                    // "boîte"

  @Column('decimal', { precision: 10, scale: 2 })
  defaultSalesPrice: number;       // Prix vente standard

  @Column({ nullable: true })
  description: string;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt: Date;

  // Relations
  @OneToMany(() => DeliveryNoteItem, item => item.finishedProduct)
  deliveryNoteItems: DeliveryNoteItem[];

  @OneToMany(() => SalesInvoiceItem, item => item.finishedProduct)
  invoiceItems: SalesInvoiceItem[];
}
```

##### 10. DeliveryNote (Bons de Livraison)

```typescript
@Entity('delivery_notes')
export class DeliveryNote {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  blNumber: string;                // "BL-24-001"

  @ManyToOne(() => Customer)
  @JoinColumn()
  customer: Customer;

  @Column()
  customerId: string;

  @Column({ type: 'date' })
  deliveryDate: Date;

  @Column({ type: 'enum', enum: ['draft', 'sent', 'signed', 'delivered'] })
  status: string;

  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  subtotal: number;

  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  total: number;

  @Column({ nullable: true, type: 'text' })
  customerSignature: string;       // Base64 signature

  @Column({ nullable: true, type: 'date' })
  signedDate: Date;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt: Date;

  // Relations
  @OneToMany(() => DeliveryNoteItem, item => item.deliveryNote, { cascade: true })
  items: DeliveryNoteItem[];

  @OneToOne(() => SalesInvoice, invoice => invoice.deliveryNote)
  invoice: SalesInvoice;
}
```

##### 11. DeliveryNoteItem (Lignes BL)

```typescript
@Entity('delivery_note_items')
export class DeliveryNoteItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => DeliveryNote, dn => dn.items, { onDelete: 'CASCADE' })
  @JoinColumn()
  deliveryNote: DeliveryNote;

  @Column()
  deliveryNoteId: string;

  @ManyToOne(() => FinishedProduct)
  @JoinColumn()
  finishedProduct: FinishedProduct;

  @Column()
  finishedProductId: string;

  @Column('decimal', { precision: 10, scale: 2 })
  quantity: number;

  @Column()
  unit: string;

  @Column('decimal', { precision: 10, scale: 2 })
  unitPrice: number;               // Prix vente

  @Column('decimal', { precision: 12, scale: 2 })
  lineTotal: number;               // quantity × unitPrice

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
```

##### 12. SalesInvoice (Factures Vente)

```typescript
@Entity('sales_invoices')
export class SalesInvoice {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  invoiceNumber: string;           // "FAC-24-001"

  @ManyToOne(() => Customer)
  @JoinColumn()
  customer: Customer;

  @Column()
  customerId: string;

  @OneToOne(() => DeliveryNote)
  @JoinColumn()
  deliveryNote: DeliveryNote;

  @Column({ nullable: true })
  deliveryNoteId: string;

  @Column({ type: 'date' })
  invoiceDate: Date;

  @Column({ type: 'date', nullable: true })
  dueDate: Date;

  @Column({ type: 'enum', enum: ['draft', 'sent', 'paid', 'overdue', 'cancelled'] })
  status: string;

  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  subtotal: number;

  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  taxAmount: number;               // TVA 19%

  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  totalAmount: number;             // subtotal + taxAmount

  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  amountPaid: number;              // Montant payé

  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  amountDue: number;               // Reste à payer

  @Column({ type: 'text', nullable: true })
  notes: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt: Date;

  // Relations
  @OneToMany(() => SalesInvoiceItem, item => item.salesInvoice, { cascade: true })
  items: SalesInvoiceItem[];

  @OneToMany(() => Payment, payment => payment.salesInvoice)
  payments: Payment[];
}
```

##### 13. SalesInvoiceItem (Lignes Facture)

```typescript
@Entity('sales_invoice_items')
export class SalesInvoiceItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => SalesInvoice, inv => inv.items, { onDelete: 'CASCADE' })
  @JoinColumn()
  salesInvoice: SalesInvoice;

  @Column()
  salesInvoiceId: string;

  @ManyToOne(() => FinishedProduct)
  @JoinColumn()
  finishedProduct: FinishedProduct;

  @Column()
  finishedProductId: string;

  @Column('decimal', { precision: 10, scale: 2 })
  quantity: number;

  @Column()
  unit: string;

  @Column('decimal', { precision: 10, scale: 2 })
  unitPrice: number;

  @Column('decimal', { precision: 12, scale: 2 })
  lineTotal: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
```

##### 14. Payment (Paiements)

```typescript
@Entity('payments')
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => SalesInvoice, inv => inv.payments)
  @JoinColumn()
  salesInvoice: SalesInvoice;

  @Column()
  salesInvoiceId: string;

  @Column('decimal', { precision: 12, scale: 2 })
  amount: number;

  @Column({ type: 'date' })
  paymentDate: Date;

  @Column()
  paymentMethod: string;           // "cash", "bank transfer", "cheque"

  @Column({ nullable: true })
  reference: string;               // Numéro chèque, ref virement

  @Column({ type: 'text', nullable: true })
  notes: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt: Date;
}
```

---

#### **COÛTS & DÉPENSES**

##### 15. Expense (Frais)

```typescript
@Entity('expenses')
export class Expense {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'date' })
  expenseDate: Date;

  @Column()
  description: string;             // "Loyer Chambre Froide"

  @Column()
  category: string;                // "loyer", "utilities", "transport", "rh", "maintenance", "other"

  @Column('decimal', { precision: 12, scale: 2 })
  amount: number;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ default: true })
  isApproved: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt: Date;
}
```

---

### Index TypeORM

```typescript
// Améliorer performance requêtes

@Index(['supplierId'])
@Index(['customerId'])
@Index(['invoiceDate'])
@Index(['status'])
@Index(['expiresAt'])  // Alertes péremption
@Index(['createdAt'])
@Index(['deletedAt'])  // Soft deletes
```

---

## **API ENDPOINTS**

### Base URL
```
http://localhost:3000/api/v1
```

### Authentication Header
```
Authorization: Bearer <JWT_TOKEN>
```

---

### **AUTH MODULE**

#### POST /auth/login
```json
Request:
{
  "email": "user@example.com",
  "password": "securePassword123"
}

Response (201):
{
  "accessToken": "eyJhbGc...",
  "refreshToken": "eyJhbGc...",
  "expiresIn": 3600,
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "Agent Name",
    "role": "agent"
  }
}

Error (401):
{
  "statusCode": 401,
  "message": "Invalid credentials"
}
```

#### POST /auth/refresh
```json
Request:
{
  "refreshToken": "eyJhbGc..."
}

Response (200):
{
  "accessToken": "eyJhbGc...",
  "expiresIn": 3600
}
```

#### GET /auth/me
```json
Response (200):
{
  "id": "uuid",
  "email": "user@example.com",
  "name": "Agent Name",
  "role": "agent",
  "createdAt": "2024-06-18T10:30:00Z"
}
```

---

### **SUPPLIERS (Fournisseurs)**

#### POST /suppliers
```json
Request:
{
  "name": "AGRI Sidi Aissa",
  "contactPerson": "Ahmed Sidi",
  "email": "contact@agrisidi.dz",
  "phone": "+213 555 111111",
  "address": "Sidi Aissa",
  "city": "Sidi Aissa",
  "notes": "Fournisseur fiable"
}

Response (201):
{
  "id": "uuid",
  "name": "AGRI Sidi Aissa",
  "contactPerson": "Ahmed Sidi",
  ...
  "createdAt": "2024-06-18T10:30:00Z"
}
```

#### GET /suppliers
```json
Query params:
- page=1
- limit=20
- search=name

Response (200):
{
  "data": [
    { "id": "uuid", "name": "AGRI Sidi Aissa", ... },
    { "id": "uuid", "name": "Ferme Bouraada", ... }
  ],
  "pagination": {
    "total": 3,
    "page": 1,
    "limit": 20
  }
}
```

#### GET /suppliers/:id
```json
Response (200):
{
  "id": "uuid",
  "name": "AGRI Sidi Aissa",
  "contactPerson": "Ahmed Sidi",
  ...
  "purchaseOrders": [
    { "id": "uuid", "poNumber": "PO-24-001", ... }
  ]
}
```

#### PUT /suppliers/:id
```json
Request:
{
  "name": "AGRI Sidi Aissa (Updated)",
  "phone": "+213 555 999999"
}

Response (200): Updated supplier
```

#### DELETE /suppliers/:id
```json
Response (204): No content (soft delete)
```

---

### **RAW MATERIALS (Matière Première)**

#### POST /raw-materials
```json
Request:
{
  "name": "Tomate Fraîche",
  "code": "TOM-01",
  "unit": "kg",
  "lastCostPerUnit": 150,
  "supplierId": "uuid",
  "description": "Tomate fraîche de qualité"
}

Response (201): Created raw material
```

#### GET /raw-materials
```json
Query:
- page=1
- limit=20
- search=name
- isActive=true

Response (200):
{
  "data": [
    { "id": "uuid", "name": "Tomate Fraîche", "code": "TOM-01", ... },
    { "id": "uuid", "name": "Carotte", "code": "CAR-01", ... }
  ],
  "pagination": { ... }
}
```

---

### **PURCHASE ORDERS (Commandes Achat)**

#### POST /purchases/purchase-orders
```json
Request:
{
  "supplierId": "uuid",
  "orderDate": "2024-06-18",
  "expectedDeliveryDate": "2024-06-25",
  "notes": "Commande urgent",
  "items": [
    {
      "rawMaterialId": "uuid",
      "quantity": 100,
      "unit": "kg",
      "unitPrice": 150
    },
    {
      "rawMaterialId": "uuid",
      "quantity": 50,
      "unit": "kg",
      "unitPrice": 80
    }
  ]
}

Response (201):
{
  "id": "uuid",
  "poNumber": "PO-24-001",
  "supplier": { ... },
  "status": "draft",
  "subtotal": 19000,
  "total": 19000,
  "items": [ ... ],
  "createdAt": "2024-06-18T10:30:00Z"
}
```

#### GET /purchases/purchase-orders
```json
Query:
- page=1
- limit=20
- status=draft|sent|received
- supplierId=uuid
- dateFrom=2024-06-01
- dateTo=2024-06-30

Response (200): List with pagination
```

#### PUT /purchases/purchase-orders/:id
```json
Request: { fields à mettre à jour }

Response (200): Updated PO
```

#### PATCH /purchases/purchase-orders/:id/status
```json
Request:
{
  "status": "sent"
}

Response (200):
{
  "id": "uuid",
  "status": "sent",
  ...
}
```

---

### **RECEPTION BL (Réception Marchandise)**

#### POST /purchases/reception-bls
```json
Request:
{
  "purchaseOrderId": "uuid",
  "receptionDate": "2024-06-20",
  "totalQuantityReceived": 150,
  "notes": "Reçu en bon état"
}

Response (201):
{
  "id": "uuid",
  "blNumber": "BL-REC-24-001",
  "purchaseOrder": { ... },
  "status": "completed",
  "totalQuantityReceived": 150,
  "createdAt": "2024-06-20T10:30:00Z"
}

Side effect:
├─ Créer StockEntry automatiquement
└─ Update InventorySummary
```

---

### **STOCK (Inventaire)**

#### GET /stock/inventory
```json
Query:
- page=1
- limit=20
- materialId=uuid
- lowStockOnly=false
- expiringSoon=false (5 jours)

Response (200):
{
  "data": [
    {
      "id": "uuid",
      "rawMaterial": { "id": "uuid", "name": "Tomate Fraîche" },
      "totalQuantity": 50,
      "averageCostPerUnit": 150,
      "totalValue": 7500,
      "earliestExpirationDate": "2024-06-23",
      "lastUpdated": "2024-06-18T10:30:00Z"
    }
  ],
  "pagination": { ... }
}
```

#### GET /stock/alerts
```json
Response (200):
{
  "expiringProducts": [
    {
      "materialId": "uuid",
      "name": "Tomate Fraîche",
      "quantity": 50,
      "expiresAt": "2024-06-23",
      "daysUntilExpiry": 5
    }
  ],
  "lowStockProducts": [
    {
      "materialId": "uuid",
      "name": "Carotte",
      "quantity": 5,
      "threshold": 10
    }
  ]
}
```

#### POST /stock/adjust
```json
Request:
{
  "rawMaterialId": "uuid",
  "quantityAdjustment": -10,  // Négatif = sortie
  "reason": "Wastage",
  "notes": "Produits endommagés"
}

Response (201):
{
  "id": "uuid",
  "rawMaterial": { ... },
  "quantity": -10,
  "status": "adjusted",
  "createdAt": "2024-06-18T10:30:00Z"
}
```

---

### **CUSTOMERS (Clients)**

#### POST /customers
```json
Request:
{
  "name": "Marché Central Djelfa",
  "contactPerson": "Mahdi Market",
  "email": "contact@marche-central.dz",
  "phone": "+213 555 444444",
  "address": "Centre-Ville Djelfa",
  "city": "Djelfa"
}

Response (201): Created customer
```

#### GET /customers
```json
Query:
- page=1
- limit=20
- search=name
- isActive=true

Response (200): List with pagination
```

---

### **DELIVERY NOTES (Bons de Livraison) ⭐⭐**

#### POST /deliveries/delivery-notes
```json
Request:
{
  "customerId": "uuid",
  "deliveryDate": "2024-06-18",
  "items": [
    {
      "finishedProductId": "uuid",
      "quantity": 10,
      "unit": "boîte",
      "unitPrice": 1500
    },
    {
      "finishedProductId": "uuid",
      "quantity": 5,
      "unit": "boîte",
      "unitPrice": 800
    }
  ],
  "notes": "Livraison prioritaire"
}

Response (201):
{
  "id": "uuid",
  "blNumber": "BL-24-001",           ← Auto-generated!
  "customer": { ... },
  "status": "draft",
  "subtotal": 19000,
  "total": 19000,
  "items": [ ... ],
  "createdAt": "2024-06-18T10:30:00Z"
}

Side effect:
├─ ✓ Stock baisse automatiquement (FIFO)
└─ ✓ Signature customer optionnelle
```

#### GET /deliveries/delivery-notes
```json
Query:
- page=1
- limit=20
- status=draft|sent|signed|delivered
- customerId=uuid
- dateFrom=2024-06-01
- dateTo=2024-06-30

Response (200): List with pagination
```

#### PATCH /deliveries/delivery-notes/:id/signature
```json
Request:
{
  "customerSignature": "base64_signature_image",
  "signedDate": "2024-06-18"
}

Response (200):
{
  "id": "uuid",
  "blNumber": "BL-24-001",
  "status": "signed",
  "customerSignature": "data:image/png;base64,...",
  "signedDate": "2024-06-18"
}
```

#### GET /deliveries/delivery-notes/:id/pdf
```
Response (200): PDF binary
Content-Type: application/pdf

File saved: ARCHIVES/2024/06/BL/BL-24-001.pdf
```

---

### **SALES INVOICES (Factures) ⭐⭐**

#### POST /invoices/sales-invoices
```json
Request:
{
  "customerId": "uuid",
  "deliveryNoteId": "uuid",  ← Depuis BL
  "invoiceDate": "2024-06-18",
  "dueDate": "2024-07-18",
  "notes": "Paiement à réception"
}

Response (201):
{
  "id": "uuid",
  "invoiceNumber": "FAC-24-001",     ← Auto-generated!
  "customer": { ... },
  "deliveryNote": { ... },
  "status": "draft",
  "subtotal": 19000,
  "taxAmount": 3610,                 ← TVA 19% auto!
  "totalAmount": 22610,
  "amountPaid": 0,
  "amountDue": 22610,
  "items": [ ... ],
  "createdAt": "2024-06-18T10:30:00Z"
}
```

#### GET /invoices/sales-invoices
```json
Query:
- page=1
- limit=20
- status=draft|sent|paid|overdue|cancelled
- customerId=uuid
- dateFrom=2024-06-01
- dateTo=2024-06-30

Response (200): List with pagination
```

#### PATCH /invoices/sales-invoices/:id/status
```json
Request:
{
  "status": "sent"
}

Response (200): Updated invoice
```

#### GET /invoices/sales-invoices/:id/pdf
```
Response (200): PDF binary
Content-Type: application/pdf

File saved: ARCHIVES/2024/06/FACTURES/FAC-24-001.pdf
```

#### POST /invoices/sales-invoices/:id/send-email
```json
Request:
{
  "recipientEmail": "customer@example.com",
  "subject": "Your Invoice FAC-24-001",
  "includeAttachment": true
}

Response (200):
{
  "success": true,
  "message": "Email sent successfully",
  "sentAt": "2024-06-18T10:30:00Z"
}

Side effect:
├─ PDF généré et attaché
├─ Email template utilisé
└─ Invoice status → "sent"
```

---

### **PAYMENTS (Paiements)**

#### POST /invoices/payments
```json
Request:
{
  "salesInvoiceId": "uuid",
  "amount": 22610,
  "paymentDate": "2024-06-18",
  "paymentMethod": "bank_transfer",
  "reference": "VIREMENT-12345",
  "notes": "Paiement complet reçu"
}

Response (201):
{
  "id": "uuid",
  "salesInvoice": { ... },
  "amount": 22610,
  "paymentDate": "2024-06-18",
  "paymentMethod": "bank_transfer",
  "createdAt": "2024-06-18T10:30:00Z"
}

Side effect:
├─ Facture: amountPaid += 22610
├─ Facture: amountDue -= 22610
├─ Si amountDue = 0 → status = "paid"
└─ Dashboard: Recalc CA
```

#### GET /invoices/payments
```json
Query:
- salesInvoiceId=uuid
- dateFrom=2024-06-01
- dateTo=2024-06-30

Response (200): List payments
```

---

### **EXPENSES (Frais)**

#### POST /expenses
```json
Request:
{
  "expenseDate": "2024-06-01",
  "description": "Loyer Chambre Froide",
  "category": "loyer",
  "amount": 150000,
  "notes": "Paiement bail mensuel"
}

Response (201):
{
  "id": "uuid",
  "expenseDate": "2024-06-01",
  "description": "Loyer Chambre Froide",
  "category": "loyer",
  "amount": 150000,
  "isApproved": false,
  "createdAt": "2024-06-01T10:30:00Z"
}

Side effect:
└─ Dashboard: Recalc Profit net
```

#### GET /expenses
```json
Query:
- page=1
- limit=20
- category=loyer|utilities|transport|rh|maintenance|other
- dateFrom=2024-06-01
- dateTo=2024-06-30

Response (200):
{
  "data": [
    { "id": "uuid", "description": "Loyer", "category": "loyer", "amount": 150000, ... },
    { "id": "uuid", "description": "Électricité", "category": "utilities", "amount": 25000, ... }
  ],
  "totalExpenses": 205000,
  "byCategory": {
    "loyer": 150000,
    "utilities": 25000,
    "transport": 10000,
    "rh": 20000
  }
}
```

#### GET /expenses/summary?month=2024-06
```json
Response (200):
{
  "month": "2024-06",
  "totalExpenses": 205000,
  "byCategory": { ... },
  "average": 30714.29
}
```

---

### **DASHBOARD ⭐⭐**

#### GET /dashboard/stats?month=2024-06
```json
Response (200):
{
  "period": {
    "month": "2024-06",
    "startDate": "2024-06-01",
    "endDate": "2024-06-30"
  },
  "sales": {
    "totalRevenue": 54383,         ← Sum invoices TTC
    "invoiceCount": 3,
    "averageInvoiceValue": 18127.67
  },
  "purchases": {
    "totalCost": 28300,            ← Sum raw materials
    "orderCount": 3
  },
  "stock": {
    "totalValue": 12300,           ← Sum inventory
    "itemCount": 3,
    "lowestValueItem": { ... }
  },
  "expenses": {
    "totalExpenses": 205000,       ← Sum frais
    "byCategory": { ... }
  },
  "profit": {
    "grossMargin": 26083,          ← Revenue - Cost
    "grossMarginPercent": 47.9,
    "netProfit": -178917,          ← Revenue - Cost - Expenses
    "netProfitPercent": -328.8
  },
  "alerts": {
    "expiringProducts": [
      { "name": "Tomate Fraîche", "quantity": 50, "expiresAt": "2024-06-23", "daysLeft": 5 }
    ],
    "unpaidInvoices": [
      { "invoiceNumber": "FAC-24-001", "amount": 22610, "daysOverdue": 0 }
    ],
    "lowStockItems": [
      { "name": "Carotte", "quantity": 5, "threshold": 10 }
    ]
  }
}
```

#### GET /dashboard/charts/sales?month=2024-06
```json
Response (200):
{
  "byDate": [
    { "date": "2024-06-10", "revenue": 22610, "invoices": 1 },
    { "date": "2024-06-12", "revenue": 13328, "invoices": 1 }
  ],
  "byCustomer": [
    { "customerName": "Marché Central", "revenue": 22610, "invoices": 1 },
    { "customerName": "Boucherie Halim", "revenue": 13328, "invoices": 1 }
  ]
}
```

#### GET /dashboard/charts/stock
```json
Response (200):
{
  "inventory": [
    { "materialName": "Tomate Fraîche", "quantity": 50, "value": 7500 },
    { "materialName": "Carotte", "quantity": 30, "value": 2400 }
  ]
}
```

---

### **REPORTS (Rapports)**

#### GET /reports/sales?dateFrom=2024-06-01&dateTo=2024-06-30
```json
Response (200):
{
  "period": "2024-06-01 to 2024-06-30",
  "summary": {
    "totalRevenue": 54383,
    "totalCost": 28300,
    "grossMargin": 26083,
    "totalExpenses": 205000,
    "netProfit": -178917
  },
  "details": [
    {
      "date": "2024-06-10",
      "invoiceNumber": "FAC-24-001",
      "customer": "Marché Central",
      "revenue": 22610,
      "status": "paid"
    }
  ]
}
```

#### GET /reports/sales/export?format=pdf&dateFrom=2024-06-01&dateTo=2024-06-30
```
Response (200): PDF binary
Content-Type: application/pdf
```

#### GET /reports/sales/export?format=csv&dateFrom=2024-06-01&dateTo=2024-06-30
```
Response (200): CSV binary
Content-Type: text/csv
```

---

### **SETTINGS**

#### GET /settings
```json
Response (200):
{
  "companyName": "Chambre Froide Djelfa",
  "taxRate": 19,                   ← TVA %
  "currency": "DA",
  "blNumberFormat": "BL-YY-###",
  "invoiceNumberFormat": "FAC-YY-###",
  "logo": "https://...",
  "email": "contact@chambre-froide.dz"
}
```

#### PUT /settings
```json
Request:
{
  "taxRate": 19,
  "invoiceNumberFormat": "FAC-YYYY-###",
  "logo": "base64_image"
}

Response (200): Updated settings
```

---

## **FEATURES DÉTAILLÉES**

### 1. AUTO-NUMÉROTATION

**Implémentation:**
```typescript
// src/common/services/numbering.service.ts

async generateBLNumber(year: number): Promise<string> {
  const prefix = 'BL';
  const lastBL = await this.deliveryNoteRepository
    .createQueryBuilder()
    .where('EXTRACT(YEAR FROM "createdAt") = :year', { year })
    .orderBy('blNumber', 'DESC')
    .limit(1)
    .getOne();

  const nextNumber = lastBL 
    ? parseInt(lastBL.blNumber.split('-')[2]) + 1
    : 1;

  return `${prefix}-${year}-${String(nextNumber).padStart(3, '0')}`;
}
```

**Format configurable:**
- BL: `BL-24-001`, `BL-2024-001`, custom
- FAC: `FAC-24-001`, `FAC-JUIN-2024-001`, custom
- Never duplicates (unique constraint DB)

---

### 2. AUTO-CALCULS

**Totals:**
```typescript
// Service: Calcule avant save

BLTotal = Sum(Item.quantity × Item.unitPrice)

FactureSubtotal = BLTotal (ou custom)
FactureTVA = FactureSubtotal × 0.19
FactureTotal = FactureSubtotal + FactureTVA

StockValue = Sum(StockEntry.quantity × StockEntry.costPerUnit)
InventoryAverage = Sum(Cost) / Sum(Quantity)

ProfitGross = Revenue - PurchaseCost
ProfitNet = ProfitGross - Expenses
```

**Update automatique:**
- Quand facture = payée → update revenue
- Quand achat = reçu → update cost
- Quand frais = ajouté → recalc profit
- Dashboard se refresh (côté React query)

---

### 3. STOCK MANAGEMENT (FIFO)

**Logic:**
```typescript
// Quand créer DeliveryNote:
// 1. Décrémente stock local
// 2. Marque StockEntry comme 'reserved'
// 3. Quand facture = payée → 'sold'

// FIFO:
// Prendre les StockEntry les plus anciennes d'abord
// Si "Tomate expire 17/06" avant "Tomate expire 25/06"
// → Vendre d'abord la 17/06

async reserveStock(deliveryNoteId: string) {
  for (const item of deliveryNoteItems) {
    const entries = await stockRepository
      .createQueryBuilder()
      .where('materialId = :materialId', { materialId: item.finishedProductId })
      .andWhere('status = :status', { status: 'available' })
      .orderBy('enteredAt', 'ASC')  ← FIFO: oldest first
      .getMany();

    // Reserve entries
    let quantityNeeded = item.quantity;
    for (const entry of entries) {
      const reserved = Math.min(quantityNeeded, entry.quantity);
      entry.quantity -= reserved;
      entry.status = 'reserved';
      quantityNeeded -= reserved;
      if (quantityNeeded === 0) break;
    }
  }
}
```

---

### 4. ALERTES PÉREMPTION

**Database:**
```sql
SELECT * FROM stock_entries
WHERE expiresAt <= CURRENT_DATE + INTERVAL '5 days'
AND status != 'sold'
ORDER BY expiresAt ASC;
```

**Dashboard:**
```typescript
// Endpoint: GET /stock/alerts
// Montre products expiring dans 5 jours
// Couleur rouge si <= 2 jours
// Suggestion: "Vendre prioritairement"
```

---

### 5. GÉNÉRATION PDF

**Libraries:**
```
npm install pdfkit
npm install html2pdf (optionnel: si HTML template)
```

**Service:**
```typescript
// src/deliveries/pdf.service.ts

async generateDeliveryNotePDF(blId: string): Promise<Buffer> {
  const bl = await deliveryNoteRepository.findOne(blId, { relations: ['items', 'customer'] });
  
  // Utiliser pdfkit ou html2pdf
  // Template: Logo, BL-24-001, Customer info, Items, Total
  // Signature area pour client
  
  const pdf = new PDFDocument();
  pdf.text(`BN: ${bl.blNumber}`);
  pdf.text(`Customer: ${bl.customer.name}`);
  // ... items table
  pdf.text(`Total: ${bl.total} DA`);
  
  return pdf.getBuffer();
}
```

**Archivage:**
```typescript
// Après PDF généré:
const filename = `BL-${bl.blNumber}.pdf`;
const path = `ARCHIVES/${year}/${month}/BL/${filename}`;
await storage.upload(path, pdfBuffer);
```

---

### 6. EMAIL CLIENT

**Service:**
```typescript
// src/invoices/email.service.ts

async sendInvoiceEmail(invoiceId: string, recipientEmail: string) {
  const invoice = await invoiceRepository.findOne(invoiceId);
  const pdf = await this.pdfService.generateInvoicePDF(invoiceId);
  
  // Send via nodemailer (configurable)
  await mailer.send({
    to: recipientEmail,
    subject: `Your Invoice ${invoice.invoiceNumber}`,
    template: 'invoice-email.html',
    variables: { invoice },
    attachments: [{
      filename: `${invoice.invoiceNumber}.pdf`,
      content: pdf
    }]
  });
  
  // Update status
  invoice.status = 'sent';
  await invoiceRepository.save(invoice);
}
```

---

### 7. AUDIT TRAIL

**Tracking:**
```typescript
// Chaque entity:
@CreateDateColumn()
createdAt: Date;

@UpdateDateColumn()
updatedAt: Date;

@Column({ nullable: true })
createdBy: string;          ← User ID

@Column({ nullable: true })
updatedBy: string;          ← User ID
```

**Usage:**
```typescript
// Middleware capture current user
const user = req.user; // From JWT

// Before save:
entity.updatedBy = user.id;
```

---

## **WORKFLOWS**

### Workflow 1: ACHAT MATIÈRE PREMIÈRE

```
Step 1: Créer Fournisseur
  └─ POST /suppliers
     └─ Response: Supplier avec ID

Step 2: Créer PurchaseOrder
  └─ POST /purchases/purchase-orders
     ├─ supplierId
     ├─ items: [{ rawMaterialId, quantity, unitPrice }, ...]
     └─ Response: PO avec poNumber = "PO-24-001"

Step 3: Envoyer Commande (optionnel)
  └─ PATCH /purchases/purchase-orders/:id/status
     └─ status = "sent"

Step 4: Réception Marchandise
  └─ POST /purchases/reception-bls
     ├─ purchaseOrderId
     ├─ totalQuantityReceived
     └─ AUTO: Crée StockEntry(s)

Step 5: Vérifier Stock
  └─ GET /stock/inventory
     └─ Response: Stock updated, value calculé
```

---

### Workflow 2: VENTE PRODUITS FINIS ⭐

```
Step 1: Créer Client (si nouveau)
  └─ POST /customers

Step 2: Créer Bon de Livraison
  └─ POST /deliveries/delivery-notes
     ├─ customerId
     ├─ deliveryDate
     ├─ items: [{ finishedProductId, quantity, unitPrice }, ...]
     └─ Response: BL avec blNumber = "BL-24-001"
        └─ SIDE EFFECT: Stock baisse automatiquement (FIFO)

Step 3: Imprimer & Client Signe
  └─ GET /deliveries/delivery-notes/:id/pdf
     ├─ Response: PDF binary
     └─ Sauvegarder: ARCHIVES/2024/06/BL/BL-24-001.pdf
  
  └─ PATCH /deliveries/delivery-notes/:id/signature
     ├─ customerSignature: "base64_image"
     └─ status = "signed"

Step 4: Créer Facture (depuis BL)
  └─ POST /invoices/sales-invoices
     ├─ customerId
     ├─ deliveryNoteId ← Préremplit items!
     ├─ invoiceDate
     └─ Response: Invoice avec invoiceNumber = "FAC-24-001"
        └─ SIDE EFFECT: TVA 19% auto-calculée!

Step 5: Envoyer Facture au Client
  └─ POST /invoices/sales-invoices/:id/send-email
     ├─ recipientEmail
     └─ AUTO: PDF attaché, email template

Step 6: Recevoir Paiement
  └─ POST /invoices/payments
     ├─ salesInvoiceId
     ├─ amount
     ├─ paymentDate
     └─ paymentMethod
        └─ SIDE EFFECT: Invoice.amountDue décrémente
           └─ Si amountDue = 0 → status = "paid"

Step 7: Dashboard se met à jour
  └─ GET /dashboard/stats
     ├─ totalRevenue += 22610
     ├─ totalCost -= 50 (stock moved)
     ├─ profitGross = Revenue - Cost
     └─ profitNet = profitGross - Expenses
```

---

### Workflow 3: GESTION FRAIS

```
Step 1: Ajouter Frais
  └─ POST /expenses
     ├─ expenseDate
     ├─ description
     ├─ category (loyer, utilities, transport, rh, etc)
     ├─ amount
     └─ isApproved = false (optionnel: nécessite approbation)

Step 2: Approuver Frais (si workflow requis)
  └─ PATCH /expenses/:id
     └─ isApproved = true

Step 3: Dashboard se met à jour
  └─ GET /dashboard/stats
     ├─ totalExpenses += amount
     ├─ byCategory[category] += amount
     └─ profitNet = profitGross - totalExpenses
```

---

## **INTERFACE WEB (REACT)**

### 8 Onglets Principaux

```
┌─────────────────────────────────────────────┐
│  CHAMBRE FROIDE DJLEFA - INVOICING          │
├─────────────────────────────────────────────┤
│ [1-Fournisseurs] [2-Achats] [3-Stock] ...   │
├─────────────────────────────────────────────┤
│                                             │
│ Content Panel (correspondant onglet)        │
│                                             │
│ ┌──────────────────────────────────────┐   │
│ │ Toolbar avec boutons action          │   │
│ │ ├─ [➕ Nouveau Fournisseur]          │   │
│ │ ├─ [🔍 Rechercher]                  │   │
│ │ └─ [⚙️ Options]                      │   │
│ │                                      │   │
│ │ Table/List                           │   │
│ │ ├─ Colonne1 | Colonne2 | Actions   │   │
│ │ ├─ Row 1    | Value   | Edit/Del   │   │
│ │ ├─ Row 2    | Value   | Edit/Del   │   │
│ │ └─ ...                              │   │
│ │                                      │   │
│ │ Pagination                           │   │
│ │ ├─ Prev | Page 1 of 5 | Next        │   │
│ │ └─ 20 items per page                │   │
│ └──────────────────────────────────────┘   │
│                                             │
│ Modals (forms)                              │
│ ├─ Nouveau Fournisseur (POST)              │
│ ├─ Éditer Fournisseur (PUT)                │
│ ├─ Confirmer Suppression (DELETE)          │
│ └─ ...                                      │
│                                             │
└─────────────────────────────────────────────┘
```

### Tab 1: FOURNISSEURS
```
├─ Table: Name, Contact, Phone, Actions
├─ Buttons: [➕ Nouveau], [🔍 Search]
├─ Modal: Form (name, contact, email, phone, address)
└─ Actions: Edit, Delete, View POs
```

### Tab 2: ACHATS MATIÈRE PREMIÈRE
```
├─ Table: Date, Supplier, Product, Qty, Price, Total
├─ Buttons: [➕ Nouvel Achat], [🔍 Filter by supplier]
├─ Modal: Form (supplier, products, qty, prices)
├─ Auto-calc: Total = Qty × Price
└─ Side effect: Stock updates automatiquement
```

### Tab 3: STOCK
```
├─ Table: Product, Quantity, Avg Cost, Value, Expires, Alert
├─ Buttons: [🔄 Refresh], [⚠️ Show alerts only]
├─ Alerts: Red if expires <= 2 days, Orange if <= 5 days
├─ Total: Stock value at bottom
└─ Modal: Manual adjust (if needed)
```

### Tab 4: CLIENTS
```
├─ Table: Name, Contact, Phone, Actions
├─ Buttons: [➕ Nouveau Client], [🔍 Search]
├─ Modal: Form (name, contact, email, phone, address)
└─ Link: View customer history (BLs, Invoices)
```

### Tab 5: BONS DE LIVRAISON ⭐
```
├─ Table: Date, BL#, Customer, Items, Total, Actions
├─ Buttons: [➕ Nouvelle Livraison], [🔍 Filter]
├─ Modal: Form
│  ├─ Sélectionner Client (dropdown)
│  ├─ Ajouter Items (table avec inputs)
│  │  ├─ Product (dropdown from FinishedProducts)
│  │  ├─ Qty (input)
│  │  ├─ Price/Unit (input)
│  │  └─ Line total (auto)
│  ├─ Total auto-calc
│  └─ [Créer BL]
│     └─ Response: BL-24-001 généré
│        └─ Stock baisse auto!
├─ Actions: [📄 PDF], [✍️ Signature], [📧 Send], [🖨️ Print]
└─ PDF: Download + Archive auto
```

### Tab 6: FACTURES ⭐
```
├─ Table: Date, FAC#, Customer, Amount HT, TVA, Amount TTC, Status, Actions
├─ Buttons: [📄 Générer Facture], [🔍 Filter by status]
├─ Modal: Form
│  ├─ Sélectionner BL (dropdown from latest BLs)
│  ├─ Preview items (from BL)
│  ├─ Amount HT (auto-fill from BL)
│  ├─ TVA 19% (auto-calc!)
│  ├─ Amount TTC (auto-calc!)
│  ├─ Statut (draft/sent/paid)
│  └─ [Créer Facture]
│     └─ Response: FAC-24-001 généré
├─ Actions: 
│  ├─ [📄 PDF]: Download + Archive
│  ├─ [📧 Email]: Send to customer
│  ├─ [🖨️ Print]: Print BL
│  └─ [✅ Mark Paid]: Register payment
└─ Statuts: Draft → Sent → Paid
```

### Tab 7: FRAIS
```
├─ Table: Date, Description, Category, Amount, Actions
├─ Buttons: [➕ Nouveau Frais], [🔍 Filter by category]
├─ Modal: Form (date, description, category, amount, notes)
├─ Total: Sum of all expenses
└─ By category: Loyer (150K), Utilities (25K), Transport (10K), RH (20K)
```

### Tab 8: DASHBOARD ⭐⭐
```
┌────────────────────────────────────────────┐
│ Period selector: [This Month ▼]            │
├────────────────────────────────────────────┤
│                                            │
│ KPI Cards (4 columns):                     │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐    │
│ │ CA       │ │ Marge    │ │ Stock $  │    │
│ │ 54,383   │ │ 26,083   │ │ 12,300   │    │
│ │ DA       │ │ (48%)    │ │ DA       │    │
│ └──────────┘ └──────────┘ └──────────┘    │
│ ┌──────────┐                              │
│ │ Profit   │                              │
│ │ -178,917 │                              │
│ │ DA       │                              │
│ └──────────┘                              │
│                                            │
│ Charts (2 columns):                       │
│ ┌────────────────┐ ┌────────────────┐    │
│ │ Sales by Date  │ │ Stock by Item  │    │
│ │ (Line chart)   │ │ (Pie chart)    │    │
│ │ Jun 10: 22.6K  │ │ Tomate: 60%    │    │
│ │ Jun 12: 13.3K  │ │ Carotte: 20%   │    │
│ │ Jun 15: 18.4K  │ │ Poivron: 20%   │    │
│ └────────────────┘ └────────────────┘    │
│                                            │
│ Alerts:                                   │
│ ├─ ⚠️ Tomate expire 17/06 (5 jours)      │
│ ├─ ⚠️ FAC-24-002 impayée                 │
│ └─ ⚠️ Carotte stock bas (5/10)           │
│                                            │
│ Summary Table:                            │
│ ├─ CA:                 54,383 DA         │
│ ├─ Achats:             28,300 DA         │
│ ├─ Marge brute:        26,083 (48%)      │
│ ├─ Frais:            -205,000 DA         │
│ └─ Profit net:       -178,917 DA         │
│                                            │
└────────────────────────────────────────────┘
```

---

## **AUTHENTIFICATION & AUTORISATION**

### Auth Flow

```
Step 1: Login
  └─ POST /auth/login { email, password }
     ├─ Vérifier credentials
     ├─ Generate JWT + Refresh Token
     └─ Response: { accessToken, refreshToken, user }

Step 2: Store Tokens
  └─ React: localStorage.setItem('accessToken', token)
     └─ React: localStorage.setItem('refreshToken', token)

Step 3: API Requests
  └─ Header: Authorization: Bearer {accessToken}
     ├─ Server: Verify JWT
     ├─ Extract user info
     └─ Proceed if valid

Step 4: Token Expiry (auto-refresh)
  └─ If 401 Unauthorized
     ├─ POST /auth/refresh { refreshToken }
     ├─ Get new accessToken
     ├─ Retry original request
     └─ If refresh fails → Redirect login

Step 5: Logout
  └─ Clear tokens from localStorage
```

### Roles & Permissions

```
ROLES:
├─ owner (all permissions)
├─ manager (view/create/edit, no delete)
└─ agent (create BL/invoices only)

PERMISSIONS:
├─ suppliers: view, create, edit, delete
├─ raw-materials: view, create, edit
├─ purchase-orders: view, create
├─ stock: view
├─ customers: view, create, edit, delete
├─ delivery-notes: view, create (agents), edit
├─ sales-invoices: view, create, edit (owner)
├─ payments: view, create
├─ expenses: view, create (manager), approve (owner)
├─ dashboard: view (all)
├─ reports: view, export (manager)
└─ settings: edit (owner)

DECORATOR (NestJS):
@Roles('owner', 'manager')
@UseGuards(JwtGuard, RolesGuard)
async updateExpense(@Param('id') id: string) { ... }
```

---

## **VALIDATIONS & ERREURS**

### Input Validation (DTOs)

```typescript
// src/deliveries/dto/create-delivery-note.dto.ts

export class CreateDeliveryNoteDTO {
  @IsUUID()
  customerId: string;

  @IsISO8601()
  deliveryDate: string;

  @IsArray()
  @ValidateNested()
  @Type(() => DeliveryNoteItemDTO)
  items: DeliveryNoteItemDTO[];

  @IsOptional()
  @IsString()
  notes: string;
}

export class DeliveryNoteItemDTO {
  @IsUUID()
  finishedProductId: string;

  @IsNumber()
  @Min(0.01)
  quantity: number;

  @IsString()
  unit: string;

  @IsNumber()
  @Min(0)
  unitPrice: number;
}
```

### Error Handling

```typescript
// src/common/filters/exception.filter.ts

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: HttpArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (exception instanceof HttpException) {
      return response.status(exception.getStatus()).json({
        statusCode: exception.getStatus(),
        message: exception.getResponse()
      });
    }

    if (exception instanceof QueryFailedError) {
      if (exception.code === '23505') { // Unique constraint
        return response.status(409).json({
          statusCode: 409,
          message: 'Resource already exists',
          field: exception.detail
        });
      }
    }

    // Unhandled error
    return response.status(500).json({
      statusCode: 500,
      message: 'Internal server error'
    });
  }
}
```

### HTTP Status Codes

```
✓ 200 OK: Success
✓ 201 Created: Resource created
✓ 204 No Content: Deleted
✗ 400 Bad Request: Invalid input
✗ 401 Unauthorized: No token
✗ 403 Forbidden: No permission
✗ 404 Not Found: Resource not found
✗ 409 Conflict: Unique constraint (duplicate)
✗ 422 Unprocessable Entity: Validation error
✗ 500 Internal Server Error: Server error
```

---

## **DÉPLOIEMENT**

### Environment

```bash
# .env.local (development)
DATABASE_URL=postgresql://user:password@localhost:5432/chambre_froide
JWT_SECRET=your_secret_key_here
JWT_EXPIRY=3600
REFRESH_TOKEN_EXPIRY=604800
EMAIL_SMTP_HOST=smtp.gmail.com
EMAIL_SMTP_PORT=587
EMAIL_SMTP_USER=your_email@gmail.com
EMAIL_SMTP_PASSWORD=your_app_password
STORAGE_TYPE=local  # ou 's3'
STORAGE_PATH=./uploads
NODE_ENV=development
PORT=3000
```

### Database Migrations

```bash
# Create migration
npm run typeorm migration:create src/migrations/CreateInitialSchema

# Run migrations
npm run typeorm migration:run

# Revert migration
npm run typeorm migration:revert
```

### Docker (optionnel)

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY dist ./dist

EXPOSE 3000

CMD ["node", "dist/main.js"]
```

### Deployment Platforms

```
Backend (NestJS):
├─ Railway ← Recommandé (PostgreSQL integrated)
├─ Heroku
├─ DigitalOcean
└─ Self-hosted (VPS)

Frontend (React):
├─ Vercel ← Recommandé (zero-config)
├─ Netlify
├─ GitHub Pages
└─ Self-hosted (CDN)

Database:
├─ Railway PostgreSQL ← Avec backend
├─ AWS RDS
├─ Managed services
```

---

## **RÉSUMÉ POUR CLAUDE CODE**

Claude Code doit implémenter:

### Phase 1: Backend (NestJS)
- [ ] Setup project + modules structure
- [ ] 15 TypeORM entities + migrations
- [ ] 25+ API endpoints (CRUD + custom)
- [ ] JWT authentication + roles/permissions
- [ ] PDF generation (BL + Invoices)
- [ ] Email service (nodemailer)
- [ ] Dashboard calculations + stats
- [ ] Input validation + error handling
- [ ] Database seeds (test data)

### Phase 2: Frontend (React)
- [ ] 8 onglets + navigation
- [ ] Tables avec pagination/search/filter
- [ ] Modals pour create/edit
- [ ] Forms avec validation
- [ ] Charts (recharts)
- [ ] PDF viewer/download
- [ ] Dashboard avec KPIs
- [ ] Login/logout flow
- [ ] State management (Zustand)
- [ ] react-query pour API calls

### Phase 3: Integration
- [ ] CORS setup
- [ ] Error handling
- [ ] Loading states
- [ ] Success messages
- [ ] Testing (optionnel)

---

**This document is ready for Claude Code to start development!**

Version: 1.0  
Last Updated: 2024-06-18  
Status: Complete Specifications ✅
