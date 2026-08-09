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

> **Révisée le 2026-08-09.** La version précédente était un tableau binaire à
> **trois** rôles ; le produit en a **cinq**, et décide route par route. Les
> deux divergeaient sur **68 des 795 cases** — voir E020. Ce qui suit décrit le
> comportement réel, relevé route par route par
> `scripts/banc-matrice-roles.py`, et **aucun droit d'accès n'a été élargi**
> pour y parvenir : c'est la politique qui a été mise au niveau du code, pas
> l'inverse.
>
> ⚠️ Ce tableau n'est pas décoratif : `scripts/banc-matrice-roles.py` le
> transcrit et compare les 795 cases à chaque passage. Toute modification d'un
> `@Roles` qui n'est pas reportée ici fait rougir le banc — c'est précisément
> son objet.

### La règle, par rôle

| Rôle | Ce qu'il peut |
|---|---|
| **owner** | tout, sauf la console d'administration de la plateforme |
| **manager** | tout, **sauf** : supprimer une entité principale, modifier un compte, changer les réglages |
| **agent** | la **saisie de terrain** : il lit tout le référentiel et tous les documents, en crée et en modifie une partie, et **ne voit aucun agrégat** |
| **accountant** | **toute lecture, aucune écriture** |
| **superadmin** | la console d'administration (`/admin/*`) et **rien d'autre** — `TenantGuard` le refuse partout ailleurs, car il n'a pas de locataire |

### `manager` — les trois exceptions, nommément

**1. Dix suppressions réservées au propriétaire.** Ce sont les entités qui
*portent* de l'historique : les supprimer efface une trace, sans reprise
possible.

```
DELETE /customers/:id                      DELETE /products/:id
DELETE /suppliers/:id                      DELETE /quotes/:id
DELETE /deliveries/delivery-notes/:id      DELETE /invoices/sales-invoices/:id
DELETE /invoices/credit-notes/:id          DELETE /invoices/recurring/:id
DELETE /purchases/purchase-orders/:id      DELETE /purchases/vendor-bills/:id
```

Le manager supprime en revanche les objets **secondaires ou repris** : contacts,
liens article-fournisseur, codes-barres, grilles tarifaires, nomenclatures,
dépenses, invitations — et **règlements**, dont l'annulation est une suppression
douce qui reprend le solde de la facture (`PaymentsService.cancel`). Supprimer
ce qui se reprend n'est pas supprimer.

**2. `PATCH /users/:id`** — modifier un compte reste au propriétaire. Le manager
**lit** `/users`, `/users/quota`, `/users/invitations`, et peut inviter
(`POST /auth/invite`) et retirer une invitation en attente. Lire et convier
n'est pas administrer.

**3. `PUT /settings`** — l'identité légale de l'émetteur, les formats de
numérotation et le taux de TVA par défaut appartiennent au propriétaire. Le
manager lit les réglages.

### `agent` — la portée exacte

**Il lit tout, sauf les agrégats et les comptes.** Seize routes lui sont
fermées, et elles forment deux familles :

```
agrégats   /dashboard/*        /reports/*      /export  /export/:dataset
           /expenses/summary   /production/dashboard
comptes    /users  /users/quota  /users/invitations
```

*Pourquoi :* un agent saisit des documents ; le chiffre d'affaires, la marge et
la balance âgée ne relèvent pas de son poste. Les 51 autres lectures lui sont
ouvertes, parce qu'on ne saisit pas un BL sans consulter le client, l'article,
le stock et le tarif.

**Il écrit sur dix routes, et seulement celles-là :**

```
POST  /deliveries/delivery-notes          PUT   /deliveries/delivery-notes/:id
POST  /invoices/sales-invoices            PUT   /invoices/sales-invoices/:id
POST  /quotes                             PUT   /expenses/:id
POST  /expenses
POST  /production/orders/:id/movements    PATCH /deliveries/delivery-notes/:id/signature
POST  /production/orders/:id/movements/batch
```

Trois remarques sur cette liste, parce qu'elles surprennent :

- **l'édition est bornée en aval**, pas par le rôle : les services refusent
  toute modification d'un document qui n'est plus au brouillon
  (`invoice_cannot_update`, `delivery_note_cannot_update`). Un agent ne retouche
  donc jamais une facture émise ;
- **l'agent crée un devis mais ne l'édite pas** (`PUT /quotes/:id` est
  owner + manager). L'asymétrie est réelle et non expliquée ; elle est
  consignée telle quelle plutôt que corrigée dans un sens ou dans l'autre ;
- **l'agent ne convertit ni n'expédie.** `create-invoice` depuis un BL et les
  deux `send-email` lui sont fermés. L'ancienne version de ce tableau lui
  promettait « Create invoices / BL : Yes », ce qui se lisait comme un droit
  d'expédier. Ce n'en était pas un : **expédier au client est un acte
  commercial, pas de la saisie.** Arbitré le 2026-08-09 en faveur du code —
  l'accès reste fermé.

### `accountant` — le rôle qui n'était écrit nulle part

Il existe en base, dans l'énumération TypeScript et dans une soixantaine de
décorateurs, mais aucune spécification ne le mentionnait. Relevé :

> **Les 67 routes de lecture hors administration lui sont ouvertes. Aucune
> route d'écriture.** Pas une exception dans un sens ni dans l'autre.

C'est la politique la plus régulière des cinq, et elle n'était protégée par
rien. Elle l'est désormais par le banc.

### La grille complète

`docs/methode-test/matrice-roles-observee.md` — 159 routes × 5 personas,
groupées par module, régénérable par
`python3 scripts/banc-matrice-roles.py --matrice`.

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
