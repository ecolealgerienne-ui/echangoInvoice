# 01 — Multi-Tenancy

## Architecture Decision

**Strategy: Shared Database, Shared Schema — tenantId on every entity.**

Each company that registers becomes a **Tenant**. All tenants share the same PostgreSQL database and the same tables. Every table has a `tenantId` column (UUID, NOT NULL, indexed) that scopes all data.

| Strategy | Our choice | Reason |
|----------|-----------|--------|
| Separate DB per tenant | No | Complex ops, costly at small scale |
| Separate schema per tenant | No | Schema management overhead |
| Shared DB + tenantId | **Yes** | Simple ops, good performance with indexes |

**Consequence:** Every query in every service MUST filter by `tenantId` — this is enforced by invariant **R020**.

---

## Tenant Entity

```typescript
import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, DeleteDateColumn,
  OneToMany, OneToOne,
} from 'typeorm';

@Entity('tenants')
export class Tenant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 100, unique: true })
  slug: string; // URL-safe identifier, e.g. "chambre-froide-djelfa"

  @Column({ type: 'varchar', length: 255 })
  email: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  phone?: string;

  @Column({ type: 'text', nullable: true })
  address?: string;

  @Column({ type: 'varchar', nullable: true })
  logo?: string; // path to stored logo file

  @Column({
    type: 'enum',
    enum: ['trial', 'active', 'suspended'],
    default: 'trial',
  })
  status: 'trial' | 'active' | 'suspended';

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ type: 'timestamptz', nullable: true })
  deletedAt?: Date;

  // Relations
  @OneToMany(() => User, (user) => user.tenant)
  users: User[];

  @OneToOne(() => Subscription, (sub) => sub.tenant)
  subscription: Subscription;

  @OneToOne(() => Settings, (s) => s.tenant)
  settings: Settings;
}
```

---

## Subscription Entity

```typescript
import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn,
  OneToOne, JoinColumn,
} from 'typeorm';

@Entity('subscriptions')
export class Subscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  tenantId: string;

  @Column({
    type: 'enum',
    enum: ['freemium', 'pro'],
    default: 'freemium',
  })
  plan: 'freemium' | 'pro';

  @Column({
    type: 'enum',
    enum: ['active', 'expired', 'cancelled'],
    default: 'active',
  })
  status: 'active' | 'expired' | 'cancelled';

  // Invoice usage tracking
  @Column({ type: 'int', default: 0 })
  invoicesThisMonth: number;

  /**
   * null = unlimited (Pro plan)
   * 10   = Freemium limit
   */
  @Column({ type: 'int', nullable: true })
  invoiceLimit: number | null;

  // User usage tracking
  @Column({ type: 'int', default: 1 })
  usersCount: number;

  /**
   * null = unlimited (Pro plan)
   * 5    = Freemium limit
   */
  @Column({ type: 'int', nullable: true })
  usersLimit: number | null;

  @Column({ type: 'timestamptz' })
  startDate: Date;

  @Column({ type: 'timestamptz', nullable: true })
  renewalDate: Date | null;

  /**
   * 0.00 = Freemium
   * 500.00 = Pro (DZD/month)
   */
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  pricePerMonth: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  // Relations
  @OneToOne(() => Tenant, (tenant) => tenant.subscription)
  @JoinColumn({ name: 'tenantId' })
  tenant: Tenant;
}
```

---

## Tenant Identification — JWT Flow

The `tenantId` is embedded in every JWT access token as a claim. It is never taken from the URL.

### JWT Payload Structure

```typescript
interface JwtPayload {
  sub: string;       // userId
  tenantId: string;  // UUID of the tenant
  role: 'owner' | 'manager' | 'agent';
  email: string;
  iat: number;
  exp: number;
}
```

### TenantGuard

`TenantGuard` runs after `JwtGuard` on every protected route. It reads `tenantId` from the decoded JWT and injects it into `request.tenantId`. All downstream services receive `tenantId` from the request object, never from user-supplied body or URL parameters.

```typescript
// src/common/guards/tenant.guard.ts
@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user; // set by JwtGuard
    if (!user?.tenantId) {
      throw new UnauthorizedException('Tenant context missing from token');
    }
    request.tenantId = user.tenantId;
    return true;
  }
}
```

### Guard Order on Every Protected Route

```typescript
@Roles('owner', 'manager')
@UseGuards(JwtGuard, TenantGuard, RolesGuard)
@Get()
findAll(@Req() req: Request) {
  return this.service.findAll(req.tenantId);
}
```

---

## Onboarding Flow — Auto-Registration

### Step 1 — POST /auth/register

```json
{
  "companyName": "Chambre Froide Djelfa",
  "email": "contact@chambrefroide.dz",
  "password": "SecurePass123!"
}
```

### Step 2 — Backend Transaction (R005)

All three records are created atomically in a single QueryRunner transaction:

```typescript
const queryRunner = this.dataSource.createQueryRunner();
await queryRunner.connect();
await queryRunner.startTransaction();
try {
  // 1. Create Tenant
  const tenant = queryRunner.manager.create(Tenant, {
    name: dto.companyName,
    slug: generateSlug(dto.companyName),
    email: dto.email,
    status: 'trial',
  });
  await queryRunner.manager.save(Tenant, tenant);

  // 2. Create owner User
  const user = queryRunner.manager.create(User, {
    tenantId: tenant.id,
    email: dto.email,
    passwordHash: await bcrypt.hash(dto.password, 12),
    role: 'owner',
    isActive: true,
  });
  await queryRunner.manager.save(User, user);

  // 3. Create Freemium Subscription
  const subscription = queryRunner.manager.create(Subscription, {
    tenantId: tenant.id,
    plan: 'freemium',
    status: 'active',
    invoicesThisMonth: 0,
    invoiceLimit: 10,       // Freemium limit
    usersCount: 1,
    usersLimit: 5,          // Freemium limit
    startDate: new Date(),
    pricePerMonth: 0,
  });
  await queryRunner.manager.save(Subscription, subscription);

  await queryRunner.commitTransaction();
  return { tenant, user };
} catch (error) {
  await queryRunner.rollbackTransaction();
  throw error;
} finally {
  await queryRunner.release();
}
```

### Step 3 — Response

```json
{
  "data": {
    "accessToken": "eyJhbGci...",
    "refreshToken": "eyJhbGci...",
    "expiresIn": 3600,
    "user": {
      "id": "uuid-user",
      "tenantId": "uuid-tenant",
      "email": "contact@chambrefroide.dz",
      "role": "owner"
    }
  }
}
```

---

## Freemium Limit Enforcement

`FreemiumGuard` is applied specifically to `POST /invoices/sales-invoices`. It checks whether the tenant's monthly invoice count is within the limit before allowing invoice creation.

```typescript
// src/common/guards/freemium.guard.ts
@Injectable()
export class FreemiumGuard implements CanActivate {
  constructor(
    @InjectRepository(Subscription)
    private readonly subRepo: Repository<Subscription>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const tenantId: string = request.tenantId;

    const sub = await this.subRepo.findOne({
      where: { tenantId },
    });

    if (!sub) {
      throw new ForbiddenException('Subscription not found');
    }

    // Pro plan: invoiceLimit is null → unlimited
    if (sub.invoiceLimit === null) return true;

    if (sub.invoicesThisMonth >= sub.invoiceLimit) {
      throw new ForbiddenException(
        `Limite Freemium atteinte (${sub.invoiceLimit} factures/mois). Passez en Pro pour continuer.`,
      );
    }

    return true;
  }
}
```

**Usage on the invoice creation route:**

```typescript
@Post()
@Roles('owner', 'manager', 'agent')
@UseGuards(JwtGuard, TenantGuard, RolesGuard, FreemiumGuard)
create(@Body() dto: CreateSalesInvoiceDto, @CurrentUser() user: AuthUser) {
  return this.salesInvoicesService.create(dto, user.tenantId, user.id);
}
```

After successful invoice creation, the service increments `invoicesThisMonth` in the same transaction.

---

## R020 — Every Query MUST Filter by tenantId

**This is an absolute invariant. Any query that omits `tenantId` is a data leak.**

```typescript
// ✅ CORRECT — tenantId always scopes the query
async findAll(tenantId: string, page: number, limit: number) {
  return this.repo.find({
    where: {
      tenantId,
      deletedAt: IsNull(),
    },
    skip: (page - 1) * limit,
    take: limit,
  });
}

// ✅ CORRECT — QueryBuilder
async findOne(id: string, tenantId: string) {
  return this.repo
    .createQueryBuilder('s')
    .where('s.id = :id', { id })
    .andWhere('s.tenantId = :tenantId', { tenantId })
    .andWhere('s.deletedAt IS NULL')
    .getOne();
}

// ❌ INTERDIT — missing tenantId → cross-tenant data leak
async findAll() {
  return this.repo.find(); // returns ALL tenants' data
}

// ❌ INTERDIT — missing tenantId on findOne
async findOne(id: string) {
  return this.repo.findOne({ where: { id } }); // could return another tenant's record
}
```

**Verification command:**

```bash
# Check for findOne/find calls without tenantId in service files
grep -rn "this\.\w*[Rr]epo\.find" src/ | grep -v "tenantId"
```

---

## Database Indexes

Every table that is not `tenants` or `subscriptions` itself must have an index on `tenantId`. This index is created in the migration alongside the table.

```sql
-- Example from a migration
CREATE INDEX "IDX_suppliers_tenant_id" ON "suppliers" ("tenantId");
CREATE INDEX "IDX_customers_tenant_id" ON "customers" ("tenantId");
CREATE INDEX "IDX_delivery_notes_tenant_id" ON "delivery_notes" ("tenantId");
-- ... and so on for all 19+ tables
```

The `tenants` table itself is looked up by `id` (PK) or `slug` (unique index), so no additional tenantId index is needed there.
