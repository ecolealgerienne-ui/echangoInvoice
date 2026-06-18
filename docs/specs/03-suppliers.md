# 03 — Suppliers & Raw Materials

## Overview

The `suppliers` module manages the companies from which raw materials are purchased. Each supplier belongs to a single tenant. Raw materials are linked to a supplier and are used in purchase orders and stock entries.

All queries in this module are automatically scoped to the tenant via `tenantId` extracted from the JWT (R020). The `tenantId` is never taken from the URL or request body.

---

## Supplier Entity

```typescript
import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, DeleteDateColumn,
  ManyToOne, OneToMany, JoinColumn, Index,
} from 'typeorm';

@Index('IDX_suppliers_tenant_id', ['tenantId'])
@Entity('suppliers')
export class Supplier {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  tenantId: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  contactPerson?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email?: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  phone?: string;

  @Column({ type: 'text', nullable: true })
  address?: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  city?: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  country?: string;

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
  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenantId' })
  tenant: Tenant;

  @OneToMany(() => RawMaterial, (rm) => rm.supplier)
  rawMaterials: RawMaterial[];

  @OneToMany(() => PurchaseOrder, (po) => po.supplier)
  purchaseOrders: PurchaseOrder[];
}
```

---

## RawMaterial Entity

```typescript
import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, DeleteDateColumn,
  ManyToOne, JoinColumn, Index,
} from 'typeorm';

@Index('IDX_raw_materials_tenant_id', ['tenantId'])
@Index('IDX_raw_materials_supplier_id', ['supplierId'])
@Entity('raw_materials')
export class RawMaterial {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  tenantId: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  code?: string; // internal reference code, e.g. "MP-001"

  @Column({ type: 'varchar', length: 50 })
  unit: string; // e.g. "kg", "litre", "unité", "tonne"

  /**
   * Last known purchase cost per unit in DZD.
   * Updated automatically when a reception BL is validated.
   */
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  lastCostPerUnit: number;

  @Column({ type: 'uuid', nullable: true })
  supplierId?: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

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
  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenantId' })
  tenant: Tenant;

  @ManyToOne(() => Supplier, (s) => s.rawMaterials, { nullable: true })
  @JoinColumn({ name: 'supplierId' })
  supplier?: Supplier;
}
```

---

## API Endpoints — Suppliers

All routes require `@UseGuards(JwtGuard, TenantGuard, RolesGuard)`. The `tenantId` is always sourced from the JWT, never from the URL.

### POST /suppliers

Creates a new supplier for the authenticated tenant.

**Roles:** `owner`, `manager`

**Request:**

```json
{
  "name": "Fournisseur Matériaux SARL",
  "contactPerson": "Ahmed Bensalem",
  "email": "contact@fournisseur.dz",
  "phone": "0550123456",
  "address": "Zone Industrielle, BP 45",
  "city": "Djelfa",
  "country": "Algérie",
  "notes": "Délai de livraison habituel : 5 jours"
}
```

**Response 201:**

```json
{
  "data": {
    "id": "7e3a1b2c-...",
    "tenantId": "a1b2c3d4-...",
    "name": "Fournisseur Matériaux SARL",
    "contactPerson": "Ahmed Bensalem",
    "email": "contact@fournisseur.dz",
    "phone": "0550123456",
    "address": "Zone Industrielle, BP 45",
    "city": "Djelfa",
    "country": "Algérie",
    "notes": "Délai de livraison habituel : 5 jours",
    "createdAt": "2026-06-18T10:00:00.000Z",
    "updatedAt": "2026-06-18T10:00:00.000Z"
  }
}
```

---

### GET /suppliers?page=1&limit=20&search=

Returns a paginated list of suppliers for the authenticated tenant.

**Roles:** `owner`, `manager`, `agent`

**Query parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | number | 1 | Page number |
| `limit` | number | 20 | Items per page (max 100) |
| `search` | string | — | Filters on `name`, `contactPerson`, `city` |

**Response 200:**

```json
{
  "data": [
    {
      "id": "7e3a1b2c-...",
      "tenantId": "a1b2c3d4-...",
      "name": "Fournisseur Matériaux SARL",
      "contactPerson": "Ahmed Bensalem",
      "email": "contact@fournisseur.dz",
      "phone": "0550123456",
      "city": "Djelfa",
      "country": "Algérie",
      "createdAt": "2026-06-18T10:00:00.000Z"
    }
  ],
  "pagination": {
    "total": 1,
    "page": 1,
    "limit": 20
  }
}
```

---

### GET /suppliers/:id

Returns a single supplier with its raw materials.

**Roles:** `owner`, `manager`, `agent`

**Response 200:**

```json
{
  "data": {
    "id": "7e3a1b2c-...",
    "tenantId": "a1b2c3d4-...",
    "name": "Fournisseur Matériaux SARL",
    "contactPerson": "Ahmed Bensalem",
    "email": "contact@fournisseur.dz",
    "phone": "0550123456",
    "address": "Zone Industrielle, BP 45",
    "city": "Djelfa",
    "country": "Algérie",
    "notes": "Délai de livraison habituel : 5 jours",
    "rawMaterials": [
      {
        "id": "2f4b8e1a-...",
        "name": "Farine de blé",
        "code": "MP-001",
        "unit": "kg",
        "lastCostPerUnit": "45.00",
        "isActive": true
      }
    ],
    "createdAt": "2026-06-18T10:00:00.000Z",
    "updatedAt": "2026-06-18T10:00:00.000Z"
  }
}
```

**Error 404:**

```json
{
  "statusCode": 404,
  "message": "Fournisseur introuvable"
}
```

---

### PUT /suppliers/:id

Updates a supplier. Only fields provided are updated (partial update).

**Roles:** `owner`, `manager`

**Request:**

```json
{
  "phone": "0661987654",
  "notes": "Nouveau contact depuis janvier 2026"
}
```

**Response 200:** Returns the updated supplier (same shape as GET /:id).

---

### DELETE /suppliers/:id

Soft delete — sets `deletedAt` to the current timestamp. The supplier is no longer returned in list queries (R011).

**Roles:** `owner`

**Response 204:** No content.

**Error 422** — supplier has linked purchase orders:

```json
{
  "statusCode": 422,
  "message": "Impossible de supprimer ce fournisseur : des commandes d'achat y sont associées"
}
```

---

## API Endpoints — Raw Materials

### POST /raw-materials

**Roles:** `owner`, `manager`

**Request:**

```json
{
  "name": "Farine de blé",
  "code": "MP-001",
  "unit": "kg",
  "supplierId": "7e3a1b2c-...",
  "description": "Farine type 55, sacs de 50 kg",
  "isActive": true
}
```

**Response 201:**

```json
{
  "data": {
    "id": "2f4b8e1a-...",
    "tenantId": "a1b2c3d4-...",
    "name": "Farine de blé",
    "code": "MP-001",
    "unit": "kg",
    "lastCostPerUnit": "0.00",
    "supplierId": "7e3a1b2c-...",
    "description": "Farine type 55, sacs de 50 kg",
    "isActive": true,
    "createdAt": "2026-06-18T10:05:00.000Z",
    "updatedAt": "2026-06-18T10:05:00.000Z"
  }
}
```

---

### GET /raw-materials?page=1&limit=20&search=&isActive=true

**Roles:** `owner`, `manager`, `agent`

**Query parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | number | 1 | Page number |
| `limit` | number | 20 | Items per page (max 100) |
| `search` | string | — | Filters on `name`, `code` |
| `isActive` | boolean | — | Filter by active status |

**Response 200:**

```json
{
  "data": [
    {
      "id": "2f4b8e1a-...",
      "tenantId": "a1b2c3d4-...",
      "name": "Farine de blé",
      "code": "MP-001",
      "unit": "kg",
      "lastCostPerUnit": "45.00",
      "supplierId": "7e3a1b2c-...",
      "isActive": true,
      "createdAt": "2026-06-18T10:05:00.000Z"
    }
  ],
  "pagination": {
    "total": 1,
    "page": 1,
    "limit": 20
  }
}
```

---

### GET /raw-materials/:id

**Roles:** `owner`, `manager`, `agent`

Returns the raw material with its supplier relation.

---

### PUT /raw-materials/:id

**Roles:** `owner`, `manager`

---

### DELETE /raw-materials/:id

Soft delete.

**Roles:** `owner`

---

## Service Implementation — tenantId Scoping

All service methods receive `tenantId` as a parameter from the controller (which extracts it from the JWT via `@CurrentUser()`). The tenantId is never taken from the request body.

```typescript
// suppliers.service.ts
@Injectable()
export class SuppliersService {
  constructor(
    @InjectRepository(Supplier)
    private readonly supplierRepo: Repository<Supplier>,
  ) {}

  async findAll(
    tenantId: string,
    page: number,
    limit: number,
    search?: string,
  ) {
    const qb = this.supplierRepo
      .createQueryBuilder('s')
      .where('s.tenantId = :tenantId', { tenantId })  // R020 — always filter
      .andWhere('s.deletedAt IS NULL');                // R011 — soft delete

    if (search) {
      qb.andWhere(
        '(s.name ILIKE :search OR s.contactPerson ILIKE :search OR s.city ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    const [data, total] = await qb
      .orderBy('s.name', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data,
      pagination: { total, page, limit },
    };
  }

  async findOne(id: string, tenantId: string): Promise<Supplier> {
    const supplier = await this.supplierRepo
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.rawMaterials', 'rm', 'rm.deletedAt IS NULL')
      .where('s.id = :id', { id })
      .andWhere('s.tenantId = :tenantId', { tenantId }) // R020
      .andWhere('s.deletedAt IS NULL')                   // R011
      .getOne();

    if (!supplier) {
      throw new NotFoundException('Fournisseur introuvable');
    }
    return supplier;
  }
}
```

```typescript
// suppliers.controller.ts (R019 — no business logic)
@ApiTags('Suppliers')
@Controller('suppliers')
@UseGuards(JwtGuard, TenantGuard, RolesGuard)
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @Get()
  @Roles('owner', 'manager', 'agent')
  @ApiOperation({ summary: 'List suppliers' })
  findAll(
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('search') search?: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.suppliersService.findAll(user.tenantId, +page, +limit, search);
  }

  @Get(':id')
  @Roles('owner', 'manager', 'agent')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.suppliersService.findOne(id, user.tenantId);
  }
}
```

---

## Database Migration — Required Indexes (R016)

Every new table must index its FK columns and frequent filter columns. The migration for suppliers and raw materials must include:

```sql
-- suppliers
CREATE INDEX "IDX_suppliers_tenant_id" ON "suppliers" ("tenantId");
CREATE INDEX "IDX_suppliers_deleted_at" ON "suppliers" ("deletedAt");

-- raw_materials
CREATE INDEX "IDX_raw_materials_tenant_id" ON "raw_materials" ("tenantId");
CREATE INDEX "IDX_raw_materials_supplier_id" ON "raw_materials" ("supplierId");
CREATE INDEX "IDX_raw_materials_is_active" ON "raw_materials" ("isActive");
CREATE INDEX "IDX_raw_materials_deleted_at" ON "raw_materials" ("deletedAt");
```
