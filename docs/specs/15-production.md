# SPECS MODULE PRODUCTION — Echango Invoice
## Système de gestion de production pour PME

**Version:** 1.0 MVP  
**Date:** Juin 2026  
**Scope:** Générique — fonctionne pour toute industrie de transformation  
**Stack:** NestJS 11 + TypeORM + PostgreSQL (multi-tenant) / React 19 + TanStack Query v5

---

## ⚠️ PRINCIPES FONDATEURS

### Adapté PME algérienne — pas un clone Odoo
Ce module doit être **simple à utiliser par un chef d'atelier sans formation informatique**.  
Odoo Manufacturing a des Work Centers, Routings, Work Orders, Lot tracking, Variants — tout ça est superflu pour une PME avec 1 entrepôt et 5-10 opérateurs. On ne l'implémente pas.

**Ce qu'on fait :** BOM → Ordre de production → Logging → Clôture  
**Ce qu'on ne fait pas :** MRP automatique, planning de capacité, maintenance équipement, lot tracking

### Intégration avec le stock existant
Ce module s'intègre aux entités **déjà en production** :
- `raw_materials` → matières premières consommées pendant la production
- `finished_products` → produits finis créés à la clôture du MO
- `stock_entries` → lots FIFO pour la décrémentation des MP (R015 respecté)

---

## 1. ENTITÉS

### 1.1 NOMENCLATURE (Bill of Materials)

**Objectif :** Définir la recette pour fabriquer 1 unité d'un produit fini.

```typescript
// src/production/entities/nomenclature.entity.ts
@Entity('nomenclatures')
export class Nomenclature {
  id: UUID                    // PK
  tenantId: UUID              // R020 — filtrage multi-tenant

  code: varchar(50)           // UNIQUE par tenant — ex: "NOM-001"
  name: varchar(255)          // ex: "Poulet rôti surgelé"
  description: text?

  finishedProductId: UUID     // FK → finished_products.id
  outputQuantity: decimal(10,2)  // Quantité produite par exécution (ex: 1, 10, 100)

  version: int (default: 1)
  status: enum('active', 'inactive', 'archived')  default: 'active'

  // Coût estimé (calculé auto = somme des lignes BOM)
  estimatedCostPerUnit: decimal(12,2) default: 0

  // Audit
  createdBy: varchar?
  updatedBy: varchar?
  createdAt: timestamptz
  updatedAt: timestamptz
  deletedAt: timestamptz?     // soft delete
}
```

**Contraintes DB :**
```sql
UNIQUE ("code", "tenantId")
INDEX IDX_nomenclatures_tenant_id ("tenantId")
INDEX IDX_nomenclatures_finished_product_id ("finishedProductId")
INDEX IDX_nomenclatures_status ("status")
```

---

### 1.2 LIGNE BOM (Composant d'une nomenclature)

```typescript
// src/production/entities/bom-line.entity.ts
@Entity('bom_lines')
export class BomLine {
  id: UUID
  tenantId: UUID              // R020

  nomenclatureId: UUID        // FK → nomenclatures.id
  order: int (default: 1)     // Ordre visuel des lignes

  rawMaterialId: UUID         // FK → raw_materials.id
  quantityPerUnit: decimal(10,2)  // Quantité de MP pour 1 exécution de la BOM
  unit: varchar(50)           // kg, l, pcs, m, h, m2... (libre — copié de raw_material.unit)

  // Coût au moment de la création de la ligne (snapshot)
  unitCost: decimal(10,2) default: 0   // copié de raw_material.lastCostPerUnit
  lineCost: decimal(12,2) default: 0   // = quantityPerUnit × unitCost

  createdAt: timestamptz
  updatedAt: timestamptz
}
```

**Contraintes DB :**
```sql
INDEX IDX_bom_lines_nomenclature_id ("nomenclatureId")
INDEX IDX_bom_lines_raw_material_id ("rawMaterialId")
INDEX IDX_bom_lines_tenant_id ("tenantId")
```

---

### 1.3 ORDRE DE PRODUCTION (Manufacturing Order)

```typescript
// src/production/entities/production-order.entity.ts
@Entity('production_orders')
export class ProductionOrder {
  id: UUID
  tenantId: UUID              // R020

  ref: varchar(30)            // UNIQUE par tenant — ex: "MO-26-001" (R013)

  nomenclatureId: UUID        // FK → nomenclatures.id
  finishedProductId: UUID     // FK → finished_products.id (dénormalisé pour facilité)
  quantityToProduce: decimal(10,2)

  status: enum(
    'planned',      // Créé, pas démarré
    'in_progress',  // Production active, stock réservé
    'completed',    // Clôturé, stocks mis à jour
    'cancelled'     // Annulé, réservations libérées
  ) default: 'planned'

  // Planification
  plannedStartDate: timestamptz?
  plannedEndDate: timestamptz?
  actualStartDate: timestamptz?
  actualEndDate: timestamptz?

  // Responsable
  responsibleUserId: UUID?    // FK → users.id

  // Coûts
  estimatedCost: decimal(12,2) default: 0   // nomenclature.estimatedCostPerUnit × qty
  actualCost: decimal(12,2) default: 0      // calculé à la clôture

  // Résultats (remplis à la clôture)
  quantityProduced: decimal(10,2) default: 0
  quantityRejected: decimal(10,2) default: 0
  yieldPercentage: decimal(5,2) default: 0  // (produite / planifiée) × 100

  notes: text?
  priority: enum('normal', 'urgent') default: 'normal'

  // Audit
  createdBy: varchar?
  updatedBy: varchar?
  createdAt: timestamptz
  updatedAt: timestamptz
  deletedAt: timestamptz?
}
```

**Contraintes DB :**
```sql
UNIQUE ("ref", "tenantId")
INDEX IDX_production_orders_tenant_id ("tenantId")
INDEX IDX_production_orders_status ("status")
INDEX IDX_production_orders_nomenclature_id ("nomenclatureId")
INDEX IDX_production_orders_finished_product_id ("finishedProductId")
INDEX IDX_production_orders_created_at ("createdAt")
```

---

### 1.4 MOUVEMENT DE PRODUCTION

**Objectif :** Logger tout ce qui se passe pendant la production (consommations, productions, rejets, pertes).

> **Pas de table `production_lines` séparée.** Les mouvements *sont* le journal de production. C'est suffisant pour une PME et évite la duplication de données.

```typescript
// src/production/entities/production-movement.entity.ts
@Entity('production_movements')
export class ProductionMovement {
  id: UUID
  tenantId: UUID              // R020

  productionOrderId: UUID     // FK → production_orders.id

  type: enum(
    'mp_consumption',   // Consommation matière première
    'pf_production',    // Création produit fini
    'rejection',        // Produit fini rejeté
    'mp_loss'           // Perte matière première (évaporation, casse...)
  )

  // Matière première (pour mp_consumption et mp_loss)
  rawMaterialId: UUID?        // FK → raw_materials.id
  // Produit fini (pour pf_production et rejection)
  finishedProductId: UUID?    // FK → finished_products.id

  quantity: decimal(10,2)
  unit: varchar(50)

  // Contexte
  reason: varchar(255)?       // Pour rejection et mp_loss
  location: varchar(255)?     // Optionnel — "Zone A", "Bac 3"
  notes: text?

  // Qui a loggué
  loggedBy: varchar?          // userId (R012)
  movedAt: timestamptz        // Moment réel du mouvement (pas createdAt)

  createdAt: timestamptz
}
```

**Contraintes DB :**
```sql
INDEX IDX_production_movements_order_id ("productionOrderId")
INDEX IDX_production_movements_tenant_id ("tenantId")
INDEX IDX_production_movements_type ("type")
INDEX IDX_production_movements_raw_material_id ("rawMaterialId")
INDEX IDX_production_movements_moved_at ("movedAt")
```

---

### 1.5 CHAMP `reservedQuantity` SUR `raw_materials` (pas de table dédiée)

Au lieu d'une table `stock_reservations` séparée (sur-ingénierie pour PME), on ajoute **un seul champ** à l'entité existante :

```sql
-- Migration à ajouter
ALTER TABLE "raw_materials"
  ADD COLUMN IF NOT EXISTS "reservedQuantity" decimal(10,2) NOT NULL DEFAULT 0;
```

**Logique :**
```
Stock disponible = stockQuantity - reservedQuantity

Où stockQuantity = somme des stock_entries.quantity WHERE status = 'available'
(déjà calculé et maintenu dans raw_materials via le module Achats)
```

> **Note :** `raw_materials` n'a pas de champ `stockQuantity` aujourd'hui (le stock des MP est dans `stock_entries` via FIFO). Pour la réservation, on ajoute `reservedQuantity` et on calcule le dispo à la volée depuis `stock_entries`. Voir section 5 pour le calcul exact.

---

## 2. WORKFLOW COMPLET

```
ÉTAPE 1 — Créer une Nomenclature (BOM)
  Responsable saisit :
  ├─ Produit fini à fabriquer (FK → finished_products)
  ├─ Quantité produite par exécution
  └─ Lignes : pour chaque MP → quantité + unité
  Système : calcule estimatedCostPerUnit = somme(ligne.quantityPerUnit × MP.lastCostPerUnit)

ÉTAPE 2 — Créer un Ordre de Production (MO)
  Responsable saisit :
  ├─ Nomenclature à utiliser
  ├─ Quantité à produire
  └─ Date planifiée (optionnel)
  Système :
  ├─ Génère ref auto MO-YY-### (R013 — lock par tenant)
  ├─ Calcule estimatedCost = BOM.estimatedCostPerUnit × qty
  ├─ Vérifie stock disponible (warning si insuffisant, pas bloquant)
  └─ Statut → planned

ÉTAPE 3 — Démarrer la Production
  Responsable clique "Démarrer"
  Système (dans une transaction R005) :
  ├─ Vérifie stock dispo >= besoins totaux (BLOQUANT si insuffisant)
  ├─ raw_materials.reservedQuantity += besoin pour chaque MP
  ├─ Statut → in_progress
  └─ actualStartDate = NOW()

ÉTAPE 4 — Logger la Production (continu, pendant la production)
  Opérateur peut logger à tout moment :
  ├─ Consommation MP : "J'ai consommé X kg de Matière_Y"
  ├─ Production PF  : "J'ai produit N unités"
  ├─ Rejet          : "2 unités rejetées — Défaut visuel"
  └─ Perte MP       : "0.5 kg perdu — Évaporation"
  Chaque log = 1 ligne dans production_movements

ÉTAPE 5 — Clôturer la Production
  Responsable saisit : quantité produite réelle + quantité rejetée
  Système (dans une transaction R005) :
  ├─ Pour chaque MP consommée (somme mouvements mp_consumption) :
  │   ├─ Décrémente stock_entries via FIFO (R015)
  │   ├─ raw_materials.reservedQuantity -= quantité libérée
  │   └─ Recalcule raw_materials.stockQuantity (si applicable)
  ├─ Pour les productions PF (somme mouvements pf_production - rejets) :
  │   ├─ finished_products.stockQuantity += quantité produite nette
  │   └─ Recalcule finished_products.averageCostPerUnit (coût moyen pondéré)
  ├─ Calcule yieldPercentage = (produite / planifiée) × 100
  ├─ Calcule actualCost = somme des coûts des MP réellement consommées
  ├─ Statut → completed
  └─ actualEndDate = NOW()

ÉTAPE 6 — Annuler un MO (depuis planned ou in_progress)
  Système (dans une transaction R005) :
  ├─ Si in_progress : raw_materials.reservedQuantity -= réservations libérées
  └─ Statut → cancelled
```

---

## 3. SIDE EFFECTS OBLIGATOIRES (à ajouter au CLAUDE.md §2)

| Trigger | Side effects dans transaction |
|---|---|
| `PATCH /production/orders/:id/start` | `raw_materials.reservedQuantity +=` pour chaque MP de la BOM |
| `PATCH /production/orders/:id/complete` | Décrémente stock MP via FIFO + libère reservedQuantity + incrémente `finished_products.stockQuantity` + recalcule `averageCostPerUnit` |
| `PATCH /production/orders/:id/cancel` | Si `in_progress` : libère `reservedQuantity` |

---

## 4. API ENDPOINTS

Toutes les routes sous `/api/v1/production/` (R007).  
Toutes protégées par `JwtGuard` + `RolesGuard`.  
`tenantId` extrait du JWT, jamais depuis l'URL (R020).

### Nomenclatures

```
POST   /api/v1/production/nomenclatures
       Body: { name, code?, finishedProductId, outputQuantity, description?, lines: [{rawMaterialId, quantityPerUnit, unit}] }
       → Crée BOM + calcule estimatedCostPerUnit
       Rôles: owner, manager

GET    /api/v1/production/nomenclatures
       Query: ?page&limit&search&status&finishedProductId
       → { data: [...], pagination: { total, page, limit } }
       Rôles: owner, manager, agent

GET    /api/v1/production/nomenclatures/:id
       → BOM complète avec lignes
       Rôles: owner, manager, agent

PATCH  /api/v1/production/nomenclatures/:id
       Body: champs partiels (name, description, outputQuantity, lines)
       → Met à jour + recalcule estimatedCostPerUnit
       Rôles: owner, manager

DELETE /api/v1/production/nomenclatures/:id
       → Soft delete (si aucun MO planned/in_progress lié)
       Rôles: owner
```

### Ordres de Production

```
POST   /api/v1/production/orders
       Body: { nomenclatureId, quantityToProduce, plannedStartDate?, plannedEndDate?, notes?, priority? }
       → Crée MO avec ref auto, calcule estimatedCost, avertit si stock insuffisant
       Rôles: owner, manager

GET    /api/v1/production/orders
       Query: ?page&limit&search&status&priority&from&to
       → { data: [...], pagination: { total, page, limit } }
       Rôles: owner, manager, agent

GET    /api/v1/production/orders/:id
       → MO complet avec mouvements et résumé stock
       Rôles: owner, manager, agent

PATCH  /api/v1/production/orders/:id/start
       → Vérifie stock, réserve MP, statut planned → in_progress
       Rôles: owner, manager

PATCH  /api/v1/production/orders/:id/complete
       Body: { quantityProduced, quantityRejected?, notes? }
       → Clôture : décrément FIFO + incrément PF + calculs
       Rôles: owner, manager

PATCH  /api/v1/production/orders/:id/cancel
       Body: { reason? }
       → Annule + libère réservations
       Rôles: owner, manager
```

### Mouvements de Production

```
POST   /api/v1/production/orders/:orderId/movements
       Body: {
         type: 'mp_consumption' | 'pf_production' | 'rejection' | 'mp_loss',
         rawMaterialId?: UUID,     // si mp_consumption ou mp_loss
         finishedProductId?: UUID, // si pf_production ou rejection
         quantity: number,
         unit: string,
         reason?: string,          // obligatoire pour rejection et mp_loss
         location?: string,
         movedAt?: timestamptz,    // défaut NOW()
         notes?: string
       }
       → Enregistre le mouvement (MO doit être in_progress)
       Rôles: owner, manager, agent

GET    /api/v1/production/orders/:orderId/movements
       Query: ?type&from&to
       → Liste des mouvements
       Rôles: owner, manager, agent
```

### Dashboard Production

```
GET    /api/v1/production/dashboard
       → {
           ordersInProgress: number,
           ordersCompletedThisWeek: number,
           averageYield: number,               // % rendement moyen
           costVariance: { amount, pct },      // réel vs estimé
           criticalStock: [{ rawMaterial, available, reserved }],
           productionByDay: [{ date, quantity }]
         }
       Rôles: owner, manager
```

---

## 5. CALCULS CRITIQUES

### Stock disponible d'une matière première

```typescript
// Pas de table réservations — calcul direct
const stockEntries = await queryRunner.manager
  .createQueryBuilder(StockEntry, 'se')
  .where('se.rawMaterialId = :id AND se.tenantId = :tenantId', { id, tenantId })
  .andWhere('se.status = :status', { status: 'available' })
  .andWhere('se.deletedAt IS NULL')
  .getMany();

const physicalStock = stockEntries.reduce((sum, e) => sum + e.quantity, 0);
const reservedQty = rawMaterial.reservedQuantity; // champ ajouté en migration
const availableStock = physicalStock - reservedQty;
```

### Coût moyen pondéré du produit fini (à la clôture)

```typescript
// Recalcul averageCostPerUnit après production
const existingValue = product.stockQuantity * product.averageCostPerUnit;
const newBatchValue = actualCost; // coût réel de ce MO
const newTotalQty = product.stockQuantity + quantityProducedNet;

product.averageCostPerUnit = newTotalQty > 0
  ? (existingValue + newBatchValue) / newTotalQty
  : 0;
product.stockQuantity = newTotalQty;
product.totalStockValue = product.stockQuantity * product.averageCostPerUnit;
```

### Rendement

```typescript
yieldPercentage = (quantityProduced / quantityToProduce) * 100;
// Arrondi 2 décimales
```

### Numérotation MO (R013)

```typescript
// Format: MO-YY-### (ex: MO-26-001)
await queryRunner.query(
  `SELECT pg_advisory_xact_lock(hashtext('production_order_ref_' || $1))`,
  [tenantId]
);
const last = await queryRunner.manager
  .createQueryBuilder(ProductionOrder, 'po')
  .where('po.tenantId = :tenantId', { tenantId })
  .andWhere('EXTRACT(YEAR FROM po.createdAt) = :year', { year })
  .orderBy('po.ref', 'DESC')
  .limit(1)
  .getOne();
const next = last ? parseInt(last.ref.split('-')[2]) + 1 : 1;
return `MO-${String(year).slice(-2)}-${String(next).padStart(3, '0')}`;
```

---

## 6. MIGRATIONS REQUISES (R002)

```
Migration 1: CreateNomenclaturesTable
  → Table nomenclatures + indexes + contrainte UNIQUE(code, tenantId)

Migration 2: CreateBomLinesTable
  → Table bom_lines + indexes FK

Migration 3: CreateProductionOrdersTable
  → Table production_orders + indexes + contrainte UNIQUE(ref, tenantId)

Migration 4: CreateProductionMovementsTable
  → Table production_movements + indexes

Migration 5: AddReservedQuantityToRawMaterials
  → ALTER TABLE raw_materials ADD COLUMN reservedQuantity decimal(10,2) DEFAULT 0
```

---

## 7. STRUCTURE FICHIERS

```
src/production/
├── entities/
│   ├── nomenclature.entity.ts
│   ├── bom-line.entity.ts
│   ├── production-order.entity.ts
│   └── production-movement.entity.ts
│
├── dto/
│   ├── create-nomenclature.dto.ts
│   ├── update-nomenclature.dto.ts
│   ├── create-production-order.dto.ts
│   ├── complete-production-order.dto.ts
│   └── create-production-movement.dto.ts
│
├── services/
│   ├── nomenclature.service.ts
│   ├── production-order.service.ts      ← start/complete/cancel avec transactions
│   ├── production-movement.service.ts
│   └── production-dashboard.service.ts
│
├── controllers/
│   ├── nomenclature.controller.ts
│   ├── production-order.controller.ts
│   └── production-movement.controller.ts
│
└── production.module.ts
```

---

## 8. FRONTEND — PAGES ET COMPOSANTS

```
client/src/pages/production/
├── NomenclaturePage.tsx        → Liste BOM (table + search)
├── NomenclatureFormPage.tsx    → Créer/Modifier BOM avec lignes dynamiques
├── NomenclatureDetailPage.tsx  → Détail BOM (lignes + coût estimé)
├── ProductionOrdersPage.tsx    → Liste MO avec filtres statut/priorité
├── ProductionOrderFormPage.tsx → Créer MO
├── ProductionOrderDetailPage.tsx → Détail MO + boutons Démarrer/Clôturer/Annuler
│                                   + Journal des mouvements
│                                   + Formulaire log rapide (mobile-friendly)
└── ProductionDashboardPage.tsx → KPIs + stock critique + planning
```

**Composant log rapide (mobile-first) :**
```
3 boutons larges accessibles depuis mobile :
[📦 Consommé]  [✅ Produit]  [❌ Rejet / Perte]
→ Chaque bouton ouvre un mini-formulaire : matière/produit + quantité + raison
→ Submit = POST /movements → toast succès
```

---

## 9. VALIDATIONS MÉTIER

| Règle | Quand | Comportement |
|---|---|---|
| BOM doit avoir ≥ 1 ligne | Création/activation | Erreur 422 |
| `finishedProductId` doit exister dans `finished_products` du même tenant | Création BOM | Erreur 404 |
| `rawMaterialId` doit exister dans `raw_materials` du même tenant | Ajout ligne BOM | Erreur 404 |
| Stock disponible < besoins | Démarrage MO | **Warning** (non bloquant) → l'utilisateur confirme |
| Stock disponible = 0 pour une MP critique | Démarrage MO | **Erreur bloquante** si aucun stock |
| MO doit être `in_progress` pour logger un mouvement | Log mouvement | Erreur 409 |
| `quantityProduced` doit être > 0 | Clôture | Erreur 422 |
| Quantité mouvement mp_consumption > stock dispo restant | Log consommation | Warning (autorisé — cas perte déjà loggée) |
| Supprimer une BOM avec MO actifs | DELETE nomenclature | Erreur 409 |

---

## 10. CE QUI N'EST PAS DANS CE MVP (Phase 2+)

Les fonctionnalités suivantes sont **délibérément absentes** du MVP et ne doivent pas être ajoutées sans nouvelle spec validée :

- ❌ Routings / étapes de production (Work Centers)
- ❌ Work Orders granulaires (tâches par opérateur)
- ❌ Numéros de lot / traçabilité individuelle
- ❌ Planification automatique (MRP)
- ❌ Contrôle qualité (points de contrôle, certificats)
- ❌ Sous-produits / co-produits
- ❌ BOM multi-niveaux (un PF comme composant d'un autre PF)
- ❌ Intégration automatique depuis commandes ventes
- ❌ Maintenance équipement
