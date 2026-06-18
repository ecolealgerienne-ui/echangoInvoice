# 02 — Authentication & Authorization

## User Entity

```typescript
import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, DeleteDateColumn,
  ManyToOne, JoinColumn,
} from 'typeorm';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  tenantId: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  email: string;

  @Column({ type: 'varchar', length: 255 })
  passwordHash: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({
    type: 'enum',
    enum: ['owner', 'manager', 'agent'],
    default: 'agent',
  })
  role: 'owner' | 'manager' | 'agent';

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
  @ManyToOne(() => Tenant, (tenant) => tenant.users)
  @JoinColumn({ name: 'tenantId' })
  tenant: Tenant;
}
```

---

## JWT Payload

Every access token and refresh token carries the following claims:

```typescript
interface JwtPayload {
  sub: string;       // userId (UUID)
  tenantId: string;  // tenant UUID — used by TenantGuard on every request
  role: 'owner' | 'manager' | 'agent';
  email: string;
  iat: number;       // issued at (seconds)
  exp: number;       // expiry (seconds)
}
```

**Token durations (from environment variables via `requireEnv()`, R003):**

| Token | Duration | Rotation |
|-------|----------|----------|
| Access token | 1 hour (`JWT_EXPIRY=3600`) | No |
| Refresh token | 7 days (`REFRESH_TOKEN_EXPIRY=604800`) | Yes — old token invalidated on each use |

Refresh tokens are stored hashed in a `refresh_tokens` table (or revocation list). On rotation, the previous token is invalidated immediately.

---

## Auth Endpoints

All auth routes are rate-limited with `@nestjs/throttler`. Login and refresh routes apply stricter limits.

### POST /auth/register

Creates a Tenant + User (owner) + Subscription (freemium) atomically (R005).

**Request:**

```json
{
  "companyName": "Chambre Froide Djelfa",
  "email": "contact@chambrefroide.dz",
  "password": "SecurePass123!"
}
```

**Response 201:**

```json
{
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiJ9...",
    "expiresIn": 3600,
    "user": {
      "id": "3f8a2b1c-...",
      "tenantId": "a1b2c3d4-...",
      "email": "contact@chambrefroide.dz",
      "role": "owner"
    }
  }
}
```

**Error 409** — email already registered:

```json
{
  "statusCode": 409,
  "message": "Cette adresse email est déjà utilisée",
  "field": "email"
}
```

---

### POST /auth/login

```json
{
  "email": "contact@chambrefroide.dz",
  "password": "SecurePass123!"
}
```

**Response 200:**

```json
{
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiJ9...",
    "expiresIn": 3600,
    "user": {
      "id": "3f8a2b1c-...",
      "tenantId": "a1b2c3d4-...",
      "email": "contact@chambrefroide.dz",
      "role": "owner"
    }
  }
}
```

**Error 401** — invalid credentials:

```json
{
  "statusCode": 401,
  "message": "Email ou mot de passe incorrect"
}
```

---

### POST /auth/refresh

Rotates the refresh token. The old refresh token is invalidated immediately.

**Request:**

```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiJ9..."
}
```

**Response 200:**

```json
{
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiJ9...",
    "expiresIn": 3600
  }
}
```

**Error 401** — expired or already rotated token:

```json
{
  "statusCode": 401,
  "message": "Token de rafraîchissement invalide ou expiré"
}
```

---

### POST /auth/logout

Invalidates the refresh token server-side.

**Request:**

```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiJ9..."
}
```

**Response 204:** No content.

---

### GET /auth/me

Returns the authenticated user's profile. Requires valid access token.

**Response 200:**

```json
{
  "data": {
    "id": "3f8a2b1c-...",
    "tenantId": "a1b2c3d4-...",
    "email": "contact@chambrefroide.dz",
    "name": "Mohamed Amine",
    "role": "owner",
    "isActive": true
  }
}
```

---

### POST /auth/invite

Owner only. Sends an invitation email to a new user for the current tenant. The invitation token expires in 48 hours.

**Request:**

```json
{
  "email": "agent@chambrefroide.dz",
  "role": "agent"
}
```

**Response 201:**

```json
{
  "data": {
    "message": "Invitation envoyée à agent@chambrefroide.dz"
  }
}
```

---

### POST /auth/accept-invite

No auth required. The invitation token is validated, then the user sets their password.

**Request:**

```json
{
  "token": "inv_abc123xyz...",
  "name": "Karim Boudiaf",
  "password": "MyPassword456!"
}
```

**Response 201:**

```json
{
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiJ9...",
    "expiresIn": 3600,
    "user": {
      "id": "9c1d2e3f-...",
      "tenantId": "a1b2c3d4-...",
      "email": "agent@chambrefroide.dz",
      "role": "agent"
    }
  }
}
```

---

## Roles & Permissions Matrix

```typescript
// src/common/decorators/roles.decorator.ts
export const Roles = (...roles: string[]) => SetMetadata('roles', roles);
```

| Permission | owner | manager | agent |
|-----------|-------|---------|-------|
| View all resources | Yes | Yes | Partial |
| Create invoices / BL | Yes | Yes | Yes |
| Edit all resources | Yes | Yes | No |
| Delete resources | Yes | No | No |
| Approve expenses | Yes | Yes | No |
| Manage users | Yes | No | No |
| Change settings | Yes | No | No |
| View dashboard / reports | Yes | Yes | No |

**Agent scope:** Can only create and view `DeliveryNote` and `SalesInvoice`. All other module routes return 403.

---

## Guard Stack

Every protected route must carry all three guards in this order:

```typescript
@Roles('owner', 'manager')
@UseGuards(JwtGuard, TenantGuard, RolesGuard)
```

For invoice creation, `FreemiumGuard` is added last:

```typescript
@Roles('owner', 'manager', 'agent')
@UseGuards(JwtGuard, TenantGuard, RolesGuard, FreemiumGuard)
```

### Guard Responsibilities

| Guard | Responsibility |
|-------|---------------|
| `JwtGuard` | Validates the Bearer token, decodes JWT payload into `request.user` |
| `TenantGuard` | Reads `tenantId` from `request.user`, injects it into `request.tenantId`. All service calls use this value. |
| `RolesGuard` | Checks `request.user.role` against the `@Roles()` decorator on the route |
| `FreemiumGuard` | Queries the subscription to verify `invoicesThisMonth < invoiceLimit` before allowing invoice POST |

### TenantGuard Implementation

```typescript
// src/common/guards/tenant.guard.ts
@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user?.tenantId) {
      throw new UnauthorizedException('Contexte tenant manquant dans le token');
    }
    request.tenantId = user.tenantId;
    return true;
  }
}
```

### CurrentUser Decorator

```typescript
// src/common/decorators/current-user.decorator.ts
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
```

**Usage in controllers (R019 — no business logic):**

```typescript
@Get()
findAll(@CurrentUser() user: AuthUser) {
  return this.customersService.findAll(user.tenantId);
}

@Post()
create(@Body() dto: CreateCustomerDto, @CurrentUser() user: AuthUser) {
  return this.customersService.create(dto, user.tenantId, user.id);
}
```

---

## Security Configuration

```typescript
// src/main.ts (excerpt)
import helmet from 'helmet';
import { ThrottlerModule } from '@nestjs/throttler';

app.use(helmet());
app.enableCors({
  origin: requireEnv('ALLOWED_ORIGINS').split(','),
  // No wildcard * in production (R017)
});
app.useGlobalPipes(
  new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
);
```

```typescript
// ThrottlerModule config in AppModule
ThrottlerModule.forRoot([
  { name: 'short', ttl: 60_000, limit: 10 },  // 10 req/min for auth routes
  { name: 'long',  ttl: 60_000, limit: 100 }, // 100 req/min for other routes
])
```

**JWT configuration:**

```typescript
// src/config/jwt.config.ts
export const jwtConfig = (): JwtModuleOptions => ({
  secret: requireEnv('JWT_SECRET'),
  signOptions: {
    expiresIn: parseInt(requireEnv('JWT_EXPIRY'), 10),
  },
});
```

No fallback, no hardcoded value. Missing `JWT_SECRET` crashes the app at startup (R003).
