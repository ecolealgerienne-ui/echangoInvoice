# 11 — Expenses (Dépenses)

> **Invariants concernés :** R001, R002, R007, R010, R011, R016, R018, R019

---

## Entity

### Expense

```typescript
@Entity('expenses')
export class Expense {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  tenantId: string;

  @Column({ type: 'date' })
  expenseDate: Date;

  @Column({ type: 'varchar', length: 255 })
  description: string;

  @Column({
    type: 'enum',
    enum: ['loyer', 'utilities', 'transport', 'rh', 'maintenance', 'other'],
  })
  category: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: number;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @Column({ type: 'boolean', default: false })
  isApproved: boolean;

  @Column({ type: 'varchar', nullable: true })
  approvedBy?: string; // userId du manager/owner qui a approuvé

  @Column({ type: 'timestamptz', nullable: true })
  approvedAt?: Date;

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
}
```

**Contraintes DB :**
```sql
INDEX IDX_expenses_tenant_id    ON expenses (tenantId)
INDEX IDX_expenses_category     ON expenses (category)
INDEX IDX_expenses_expense_date ON expenses (expenseDate)
INDEX IDX_expenses_is_approved  ON expenses (isApproved)
INDEX IDX_expenses_deleted_at   ON expenses (deletedAt)
```

---

## Endpoints

### POST /api/v1/expenses

**Request :**
```json
POST /api/v1/expenses
Authorization: Bearer <token>

{
  "expenseDate": "2024-06-10",
  "description": "Loyer local commercial Juin 2024",
  "category": "loyer",
  "amount": 45000.00,
  "notes": "Payé par chèque n°123456"
}
```

**Response 201 :**
```json
{
  "data": {
    "id": "exp-uuid-001",
    "tenantId": "tenant-uuid",
    "expenseDate": "2024-06-10",
    "description": "Loyer local commercial Juin 2024",
    "category": "loyer",
    "amount": 45000.00,
    "notes": "Payé par chèque n°123456",
    "isApproved": false,
    "approvedBy": null,
    "approvedAt": null,
    "createdBy": "user-uuid",
    "createdAt": "2024-06-10T08:00:00Z",
    "updatedAt": "2024-06-10T08:00:00Z"
  }
}
```

---

### GET /api/v1/expenses

**Query params :** `page`, `limit`, `category`, `isApproved`, `dateFrom`, `dateTo`

**Response 200 :**
```json
{
  "data": [
    {
      "id": "exp-uuid-001",
      "expenseDate": "2024-06-10",
      "description": "Loyer local commercial Juin 2024",
      "category": "loyer",
      "amount": 45000.00,
      "isApproved": true,
      "approvedBy": "manager-uuid",
      "approvedAt": "2024-06-11T09:00:00Z",
      "createdAt": "2024-06-10T08:00:00Z"
    },
    {
      "id": "exp-uuid-002",
      "expenseDate": "2024-06-12",
      "description": "Carburant véhicule livraison",
      "category": "transport",
      "amount": 8500.00,
      "isApproved": false,
      "approvedBy": null,
      "approvedAt": null,
      "createdAt": "2024-06-12T10:00:00Z"
    }
  ],
  "pagination": {
    "total": 23,
    "page": 1,
    "limit": 20
  }
}
```

---

### GET /api/v1/expenses/:id

**Response 200 :**
```json
{
  "data": {
    "id": "exp-uuid-001",
    "tenantId": "tenant-uuid",
    "expenseDate": "2024-06-10",
    "description": "Loyer local commercial Juin 2024",
    "category": "loyer",
    "amount": 45000.00,
    "notes": "Payé par chèque n°123456",
    "isApproved": true,
    "approvedBy": "manager-uuid",
    "approvedAt": "2024-06-11T09:00:00Z",
    "createdBy": "user-uuid",
    "updatedBy": "manager-uuid",
    "createdAt": "2024-06-10T08:00:00Z",
    "updatedAt": "2024-06-11T09:00:00Z"
  }
}
```

---

### PUT /api/v1/expenses/:id

Modification complète. **Uniquement si `isApproved = false`** — une dépense approuvée est verrouillée.

**Request :**
```json
{
  "expenseDate": "2024-06-10",
  "description": "Loyer local commercial Juin 2024 — corrigé",
  "category": "loyer",
  "amount": 46000.00,
  "notes": "Montant corrigé après réception facture"
}
```

**Response 200 :** objet mis à jour.

**Erreurs :**
- `409` — dépense déjà approuvée (immuable)

---

### PATCH /api/v1/expenses/:id/approve

**Roles requis : MANAGER ou OWNER uniquement.**

Approuve une dépense. Enregistre `approvedBy` (userId depuis JWT) et `approvedAt`.

**Request :** body vide (l'action est implicite).

**Response 200 :**
```json
{
  "data": {
    "id": "exp-uuid-001",
    "isApproved": true,
    "approvedBy": "manager-uuid",
    "approvedAt": "2024-06-11T09:00:00Z",
    "description": "Loyer local commercial Juin 2024",
    "amount": 45000.00,
    "category": "loyer"
  }
}
```

**Erreurs :**
- `403` — rôle insuffisant (AGENT)
- `409` — dépense déjà approuvée

---

### DELETE /api/v1/expenses/:id

Soft delete (R011). **Uniquement si `isApproved = false`.**

**Response 204 :** no content.

**Erreurs :**
- `409` — dépense approuvée (suppression interdite, contacter le manager)

---

### GET /api/v1/expenses/summary

Résumé mensuel des dépenses, scoped par tenant.

**Query params :** `month` (format `YYYY-MM`, obligatoire)

**Response 200 :**
```json
{
  "data": {
    "month": "2024-06",
    "totalExpenses": 98500.00,
    "totalApproved": 75000.00,
    "totalPending": 23500.00,
    "byCategory": {
      "loyer": 45000.00,
      "utilities": 12000.00,
      "transport": 15000.00,
      "rh": 20000.00,
      "maintenance": 6500.00,
      "other": 0.00
    },
    "average": {
      "perDay": 3283.33,
      "perExpense": 4280.43
    },
    "count": {
      "total": 23,
      "approved": 17,
      "pending": 6
    }
  }
}
```

---

## Règles métier

| Règle | Détail |
|-------|--------|
| Approbation | Seuls MANAGER et OWNER peuvent approuver |
| Verrouillage | Une dépense `isApproved = true` ne peut plus être modifiée ni supprimée |
| Calcul dashboard | Seules les dépenses `isApproved = true` entrent dans le calcul du `netProfit` |
| Soft delete | `deletedAt IS NULL` toujours filtré (R011) |

---

## Catégories disponibles

| Valeur enum | Label affiché (i18n) |
|-------------|---------------------|
| `loyer` | `expenses.category.loyer` |
| `utilities` | `expenses.category.utilities` |
| `transport` | `expenses.category.transport` |
| `rh` | `expenses.category.rh` |
| `maintenance` | `expenses.category.maintenance` |
| `other` | `expenses.category.other` |

---

## Sécurité & Multi-tenancy

- Toutes les queries filtrent `tenantId` depuis le JWT
- Guards : `@UseGuards(JwtGuard, RolesGuard)` sur tous les endpoints
- AGENT : create/view uniquement — pas d'approve ni delete
- MANAGER : create/view/approve/delete (si non approuvée)
- OWNER : tout
- Toute tentative d'accès à une dépense d'un autre tenant retourne `404`
