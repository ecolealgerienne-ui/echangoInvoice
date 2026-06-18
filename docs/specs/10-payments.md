# 10 — Payments (Paiements)

> **Invariants concernés :** R001, R002, R005, R007, R010, R011, R015, R016, R018, R019

---

## Entity

### Payment

```typescript
@Entity('payments')
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  tenantId: string;

  @Column({ type: 'uuid' })
  salesInvoiceId: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: number;

  @Column({ type: 'date' })
  paymentDate: Date;

  @Column({
    type: 'enum',
    enum: ['cash', 'bank_transfer', 'cheque', 'other'],
  })
  paymentMethod: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  reference?: string; // numéro de chèque, référence virement, etc.

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
  @ManyToOne(() => SalesInvoice, (inv) => inv.payments)
  @JoinColumn({ name: 'salesInvoiceId' })
  salesInvoice: SalesInvoice;
}
```

**Contraintes DB :**
```sql
INDEX IDX_payments_tenant_id         ON payments (tenantId)
INDEX IDX_payments_sales_invoice_id  ON payments (salesInvoiceId)
INDEX IDX_payments_payment_date      ON payments (paymentDate)
INDEX IDX_payments_deleted_at        ON payments (deletedAt)
```

---

## Side effects (transaction obligatoire — R005)

### Enregistrement d'un paiement

```typescript
const queryRunner = this.dataSource.createQueryRunner();
await queryRunner.connect();
await queryRunner.startTransaction();
try {
  // 1. Récupérer la facture avec lock
  const invoice = await queryRunner.manager.findOne(SalesInvoice, {
    where: { id: dto.salesInvoiceId, tenantId, deletedAt: IsNull() },
    lock: { mode: 'pessimistic_write' },
  });

  if (!invoice) throw new NotFoundException('Facture introuvable');
  if (invoice.status === 'cancelled') throw new BadRequestException('Facture annulée');
  if (invoice.status === 'paid') throw new BadRequestException('Facture déjà payée');

  // 2. Sauvegarder le paiement
  const payment = queryRunner.manager.create(Payment, {
    ...dto,
    tenantId,
    createdBy: userId,
  });
  await queryRunner.manager.save(Payment, payment);

  // 3. Mettre à jour les montants
  const newAmountPaid = Number(invoice.amountPaid) + Number(dto.amount);
  const newAmountDue = Number(invoice.totalAmount) - newAmountPaid;

  // 4. Déterminer le nouveau statut
  let newStatus: string;
  if (newAmountDue <= 0) {
    newStatus = 'paid';
    // 5a. Transitionner les StockEntry : reserved → sold (R015)
    await this.stockService.markEntriesAsSold(queryRunner, invoice.deliveryNoteId);
  } else {
    newStatus = 'partial';
  }

  // 6. Mettre à jour la facture
  await queryRunner.manager.update(SalesInvoice, invoice.id, {
    amountPaid: Math.round(newAmountPaid * 100) / 100,
    amountDue: Math.round(Math.max(newAmountDue, 0) * 100) / 100,
    status: newStatus,
    updatedBy: userId,
  });

  await queryRunner.commitTransaction();
  return payment;
} catch (error) {
  await queryRunner.rollbackTransaction();
  throw error;
} finally {
  await queryRunner.release();
}
```

### Annulation d'un paiement

```typescript
// DELETE /invoices/payments/:id — annule le paiement et inverse les effets
const queryRunner = this.dataSource.createQueryRunner();
await queryRunner.connect();
await queryRunner.startTransaction();
try {
  const payment = await queryRunner.manager.findOne(Payment, {
    where: { id, tenantId, deletedAt: IsNull() },
  });
  if (!payment) throw new NotFoundException('Paiement introuvable');

  const invoice = await queryRunner.manager.findOne(SalesInvoice, {
    where: { id: payment.salesInvoiceId, tenantId, deletedAt: IsNull() },
    lock: { mode: 'pessimistic_write' },
  });

  // Soft delete du paiement
  await queryRunner.manager.softDelete(Payment, id);

  // Recalculer les montants
  const newAmountPaid = Number(invoice.amountPaid) - Number(payment.amount);
  const newAmountDue = Number(invoice.totalAmount) - Math.max(newAmountPaid, 0);

  // Recalculer le statut
  let newStatus: string;
  if (newAmountPaid <= 0) {
    newStatus = invoice.status === 'paid' ? 'sent' : invoice.status;
    // Réverter les StockEntry : sold → reserved (si la facture était paid)
    if (invoice.status === 'paid' && invoice.deliveryNoteId) {
      await this.stockService.revertEntriesToReserved(queryRunner, invoice.deliveryNoteId);
    }
  } else {
    newStatus = 'partial';
  }

  await queryRunner.manager.update(SalesInvoice, invoice.id, {
    amountPaid: Math.round(Math.max(newAmountPaid, 0) * 100) / 100,
    amountDue: Math.round(newAmountDue * 100) / 100,
    status: newStatus,
  });

  await queryRunner.commitTransaction();
} catch (error) {
  await queryRunner.rollbackTransaction();
  throw error;
} finally {
  await queryRunner.release();
}
```

---

## Transitions de statut StockEntry (R015)

| Trigger | Transition |
|---------|-----------|
| Création BL | `available → reserved` |
| Paiement complet (amountDue ≤ 0) | `reserved → sold` |
| Annulation paiement (facture était `paid`) | `sold → reserved` |
| Annulation BL (soft delete) | `reserved → available` |

---

## Endpoints

### POST /api/v1/invoices/payments

**Request :**
```json
POST /api/v1/invoices/payments
Authorization: Bearer <token>

{
  "salesInvoiceId": "f1b2c3d4-0000-0000-0000-000000000001",
  "amount": 1500.00,
  "paymentDate": "2024-06-20",
  "paymentMethod": "bank_transfer",
  "reference": "VIR-2024-001",
  "notes": "Acompte 50%"
}
```

**Response 201 :**
```json
{
  "data": {
    "id": "pay-uuid-001",
    "tenantId": "tenant-uuid",
    "salesInvoiceId": "f1b2c3d4-0000-0000-0000-000000000001",
    "amount": 1500.00,
    "paymentDate": "2024-06-20",
    "paymentMethod": "bank_transfer",
    "reference": "VIR-2024-001",
    "notes": "Acompte 50%",
    "createdAt": "2024-06-20T10:00:00Z",
    "invoice": {
      "id": "f1b2c3d4-0000-0000-0000-000000000001",
      "invoiceNumber": "FAC-24-001",
      "totalAmount": 2975.00,
      "amountPaid": 1500.00,
      "amountDue": 1475.00,
      "status": "partial"
    }
  }
}
```

**Erreurs possibles :**
- `400` — montant nul ou négatif
- `400` — facture déjà payée ou annulée
- `404` — facture introuvable
- `422` — montant supérieur au `amountDue` (overpayment non autorisé)

---

### GET /api/v1/invoices/payments

**Query params :** `page`, `limit`, `salesInvoiceId`, `dateFrom`, `dateTo`

**Response 200 :**
```json
{
  "data": [
    {
      "id": "pay-uuid-001",
      "salesInvoiceId": "f1b2c3d4-0000-0000-0000-000000000001",
      "invoice": { "invoiceNumber": "FAC-24-001" },
      "amount": 1500.00,
      "paymentDate": "2024-06-20",
      "paymentMethod": "bank_transfer",
      "reference": "VIR-2024-001",
      "createdAt": "2024-06-20T10:00:00Z"
    }
  ],
  "pagination": {
    "total": 15,
    "page": 1,
    "limit": 20
  }
}
```

---

### GET /api/v1/invoices/payments/:id

**Response 200 :**
```json
{
  "data": {
    "id": "pay-uuid-001",
    "tenantId": "tenant-uuid",
    "salesInvoiceId": "f1b2c3d4-0000-0000-0000-000000000001",
    "invoice": {
      "id": "f1b2c3d4-0000-0000-0000-000000000001",
      "invoiceNumber": "FAC-24-001",
      "totalAmount": 2975.00,
      "amountPaid": 1500.00,
      "amountDue": 1475.00,
      "status": "partial"
    },
    "amount": 1500.00,
    "paymentDate": "2024-06-20",
    "paymentMethod": "bank_transfer",
    "reference": "VIR-2024-001",
    "notes": "Acompte 50%",
    "createdAt": "2024-06-20T10:00:00Z",
    "updatedAt": "2024-06-20T10:00:00Z"
  }
}
```

---

### DELETE /api/v1/invoices/payments/:id

Annule un paiement. Inverse tous les side effects dans une transaction (R005).

**Règles :**
- Soft delete du paiement
- Recalcul de `amountPaid`, `amountDue`, et `status` de la facture
- Si la facture était `paid` : les `StockEntry` repassent de `sold` à `reserved`

**Response 204 :** no content.

**Erreurs :**
- `404` — paiement introuvable
- `409` — paiement déjà annulé (deletedAt non null)

---

## Validation des montants

```typescript
// Dans le service — vérification avant enregistrement
if (dto.amount <= 0) {
  throw new BadRequestException('Le montant doit être positif');
}

const maxAllowed = Number(invoice.amountDue);
if (dto.amount > maxAllowed + 0.01) { // tolérance arrondi centimes
  throw new UnprocessableEntityException(
    `Montant (${dto.amount}) supérieur au solde dû (${maxAllowed})`
  );
}
```

---

## Sécurité & Multi-tenancy

- Toutes les queries filtrent `tenantId` depuis le JWT
- Guards : `@UseGuards(JwtGuard, RolesGuard)` sur tous les endpoints
- Roles : OWNER, MANAGER → tout ; AGENT → vue uniquement (pas de création/suppression)
- Toute tentative d'accès à un paiement d'un autre tenant retourne `404`
