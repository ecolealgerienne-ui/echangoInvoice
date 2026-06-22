# 16 — Module Admin SaaS

> **Périmètre :** Back-office exclusif à l'équipe Echango pour piloter les tenants,
> les abonnements et les encaissements SaaS.
> Aucun tenant ordinaire n'a accès à ce module.

---

## 1. Contexte et objectifs

### Problème résolu

Lors du lancement, la gestion des clients SaaS est entièrement manuelle
(e-mails, tableurs). Ce module donne à l'équipe Echango une interface unique pour :

- Voir en temps réel combien de clients sont actifs / en trial / suspendus
- Changer le plan d'un client après réception d'un paiement
- Suspendre un compte impayé
- Suivre le MRR et l'ARR sans exporter de données
- Conserver un audit trail de chaque action sensible

### Non-objectifs (hors scope v1)

- Paiement en ligne automatique (Chargily Pay — Priorité 2)
- Impersonation / connexion en tant que client
- Portail client self-service (upgrade/downgrade autonome)
- Système de tickets support
- Cache Redis pour `PlanFeaturesGuard` (cache in-memory Map TTL 60s en v1)

---

## 2. Modèle de plans

Trois plans configurables en base de données (table `plans`).
**Aucune constante hardcodée dans le code** — les constantes `FREEMIUM_INVOICE_LIMIT`
et `FREEMIUM_USER_LIMIT` dans `auth.service.ts` et `sales-invoices.service.ts`
sont supprimées et remplacées par une lecture depuis la table `plans`.

| Attribut | **Starter** | **Pro** | **Enterprise** |
|----------|-------------|---------|----------------|
| `slug` | `starter` | `pro` | `enterprise` |
| Prix catalogue | 2 000 DA/mois | 5 000 DA/mois | variable (voir §2.1) |
| Factures/mois | 30 | `null` (illimité) | `null` (illimité) |
| Utilisateurs max | 3 | 10 | `null` (illimité) |
| BL + Devis | ✅ | ✅ | ✅ |
| PDF + Email | ✅ | ✅ | ✅ |
| Avoirs | ❌ | ✅ | ✅ |
| Factures fournisseurs | ❌ | ✅ | ✅ |
| Module Production | ❌ | ✅ | ✅ |
| Support prioritaire | ❌ | ❌ | ✅ |

> **`null` = illimité** — convention uniforme (déjà utilisée dans `Subscription.invoiceLimit`).

### 2.1 Prix Enterprise variable

Le plan Enterprise a un prix "catalogue" dans `plans.pricePerMonth` (valeur par défaut
pour le calcul du MRR contractuel), mais la table `subscriptions` dispose d'un champ
`customPricePerMonth` nullable qui **override** ce prix pour un client spécifique.
Le MRR réel est calculé depuis les encaissements `saas_payments` (§5.5).

### 2.2 Features flags par plan

Les features conditionnelles sont encodées dans la colonne `features` (`jsonb`) :

```json
{ "creditNotes": false, "vendorBills": false, "production": false }
```

Le `PlanFeaturesGuard` lit ces flags à chaque requête via une query jointe
`subscription → plan` (une seule query). Un cache in-memory `Map` avec TTL 60 s
est maintenu dans `AdminPlansService` pour éviter une requête DB par appel.

### 2.3 Migration depuis `freemium / pro`

L'enum PostgreSQL `subscription_plan_enum` (`freemium | pro`) est migrée :

```sql
-- Créer le nouveau type
CREATE TYPE subscription_plan_enum_new AS ENUM ('starter', 'pro', 'enterprise');

-- Migrer les données (freemium → starter)
ALTER TABLE subscriptions
  ALTER COLUMN plan TYPE subscription_plan_enum_new
  USING (
    CASE plan::text
      WHEN 'freemium' THEN 'starter'
      ELSE plan::text
    END
  )::subscription_plan_enum_new;

-- Remplacer l'ancien type
DROP TYPE subscription_plan_enum;
ALTER TYPE subscription_plan_enum_new RENAME TO subscription_plan_enum;
```

---

## 3. Entités

### 3.1 Plan (R001 — types explicites)

```typescript
@Entity('plans')
export class Plan {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 50, unique: true })
  slug: string; // 'starter' | 'pro' | 'enterprise'

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  pricePerMonth: number; // DZD — prix catalogue

  @Column({ type: 'int', nullable: true })
  invoiceLimit: number | null; // null = illimité

  @Column({ type: 'int', nullable: true })
  usersLimit: number | null; // null = illimité

  @Column({ type: 'jsonb', default: '{}' })
  features: Record<string, boolean>;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
```

### 3.2 SaasPayment (R001, R005)

```typescript
@Entity('saas_payments')
export class SaasPayment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  tenantId: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: number; // DZD

  @Column({
    type: 'enum',
    enum: ['bank_transfer', 'cash', 'check', 'ccp'],
    default: 'bank_transfer',
  })
  method: 'bank_transfer' | 'cash' | 'check' | 'ccp';

  @Column({ type: 'varchar', length: 255, nullable: true })
  reference: string | null;

  @Column({ type: 'timestamptz' })
  paidAt: Date;

  @Column({ type: 'int', default: 1 })
  monthsCovered: number; // 1 | 3 | 6 | 12

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'varchar', length: 255 })
  createdBy: string; // adminId

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
```

**Side effect obligatoire (R005) :** L'enregistrement d'un `SaasPayment` met à jour
`subscription.currentPeriodEnd` dans la même transaction QueryRunner :

```
currentPeriodEnd += monthsCovered mois
```

Si `currentPeriodEnd` était dans le passé (tenant suspendu), la date repart
de `now()` + monthsCovered.

### 3.3 AdminAuditLog (R001)

```typescript
@Entity('admin_audit_logs')
export class AdminAuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  adminId: string;

  @Column({ type: 'varchar', length: 255 })
  adminEmail: string;

  @Column({ type: 'varchar', length: 100 })
  action: string;
  // 'tenant.status_changed' | 'subscription.plan_changed'
  // 'subscription.limits_adjusted' | 'saas_payment.created'
  // 'plan.updated' | 'tenant.deleted'

  @Column({ type: 'varchar', length: 50 })
  targetType: string; // 'tenant' | 'subscription' | 'plan'

  @Column({ type: 'varchar', length: 255 })
  targetId: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;
  // { before: {...}, after: {...} } pour les mutations

  @Column({ type: 'inet', nullable: true })
  ipAddress: string | null;
  // Extraite de X-Forwarded-For (trust proxy configuré dans main.ts)

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
```

**Atomicité obligatoire (R005) :** Chaque action admin et son `AdminAuditLog`
sont écrits dans le **même QueryRunner**. Si l'écriture de l'audit échoue,
l'action entière est annulée (rollback). Il n'y a jamais d'action admin sans trace.

### 3.4 Subscription — champs ajoutés

```typescript
// Clé vers la table plans (remplace la valeur enum hardcodée)
@Column({ type: 'uuid', nullable: true })
planId: string | null;

// Prix custom pour Enterprise (override plans.pricePerMonth)
@Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
customPricePerMonth: number | null;

// Période courante
@Column({ type: 'timestamptz', nullable: true })
currentPeriodStart: Date | null;

@Column({ type: 'timestamptz', nullable: true })
currentPeriodEnd: Date | null;

// Dernière remise à zéro des compteurs mensuels
@Column({ type: 'timestamptz', nullable: true })
lastResetAt: Date | null;
```

---

## 4. Rôle superadmin et authentification

### 4.1 Définition

Le rôle `superadmin` est ajouté à `user_role_enum`.
Un superadmin a `tenantId = NULL` — il n'appartient à aucun tenant.
La colonne `tenantId` dans `users` est rendue `NULLABLE` (migration).

### 4.2 Création du compte superadmin

Créé uniquement via un script de seed dédié — **jamais via un endpoint API** :

```bash
npm run seed:admin -- --email admin@echango.dz --password <secret>
```

Le script vérifie deux conditions avant de créer :
1. `NODE_ENV === 'production'` → demande confirmation interactive
2. Aucun `superadmin` existant en base

Aucun endpoint `/admin/create-superadmin` n'est exposé publiquement.

### 4.3 JWT superadmin

```typescript
// Extension de l'interface existante
interface JwtPayload {
  sub: string;
  tenantId: string | null;  // null pour superadmin — string pour tous les autres
  role: 'owner' | 'manager' | 'agent' | 'superadmin';
  email: string;
  iat: number;
  exp: number;
}
```

### 4.4 AdminGuard

```typescript
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const { user } = context.switchToHttp().getRequest();
    if (user?.role !== 'superadmin' || user?.tenantId !== null) {
      throw new ForbiddenException('errors.admin_only');
    }
    return true;
  }
}
```

Usage sur chaque route admin :
```typescript
@UseGuards(JwtGuard, AdminGuard)   // TenantGuard est absent
```

### 4.5 TenantGuard — comportement corrigé

Le `TenantGuard` existant est modifié pour **rejeter** (HTTP 403) tout token
superadmin sur une route tenant :

```typescript
// src/common/guards/tenant.guard.ts
canActivate(context: ExecutionContext): boolean {
  const request = context.switchToHttp().getRequest();
  const user = request.user;

  // Un superadmin ne peut pas accéder aux routes tenant
  if (user?.role === 'superadmin') {
    throw new ForbiddenException('errors.superadmin_cannot_access_tenant_routes');
  }

  if (!user?.tenantId) {
    throw new UnauthorizedException('Tenant context missing from token');
  }
  request.tenantId = user.tenantId;
  return true;
}
```

> **Justification R020 :** Les routes `/admin/*` sont la seule exception au filtre
> `tenantId` — elles requêtent intentionnellement plusieurs tenants. Cette exception
> est protégée par `AdminGuard` qui garantit que seul `role='superadmin'` y accède.
> Toutes les autres routes gardent leur filtre `tenantId` obligatoire (R020).

### 4.6 Routes auth admin (séparées)

```typescript
// src/admin/auth/admin-auth.controller.ts
// Controller et service ENTIÈREMENT séparés de src/auth/
// Rate limiting : 5 tentatives / 15 min par IP (throttler)
POST /api/v1/admin/auth/login
POST /api/v1/admin/auth/refresh
```

Le `AdminAuthService` est distinct de `AuthService` — pas de code partagé
pour éviter tout risque de confusion entre les flux d'authentification.

---

## 5. Endpoints API

Préfixe global : `/api/v1/admin/` — toutes les routes `@UseGuards(JwtGuard, AdminGuard)`.
Toutes les réponses respectent l'envelope R007 : `{ data }` ou `{ data, pagination }`.
Swagger : `@ApiTags('admin')` sur tous les controllers admin.

### 5.1 Stats globales

```
GET /api/v1/admin/stats
```

**Réponse :**
```json
{
  "data": {
    "mrr": {
      "actual": 125000,
      "contractual": 130000
    },
    "arr": {
      "actual": 1500000,
      "contractual": 1560000
    },
    "tenants": {
      "total": 47,
      "trial": 12,
      "active": 30,
      "suspended": 5
    },
    "newThisMonth": 8,
    "churnThisMonth": 1,
    "byPlan": {
      "starter": 20,
      "pro": 9,
      "enterprise": 1
    },
    "topTenantsByUsage": [
      { "tenantId": "uuid", "name": "Société X", "invoicesThisMonth": 28, "plan": "pro" }
    ]
  }
}
```

**Calcul MRR :**
- `mrr.actual` = somme des `saas_payments.amount` du mois courant (encaissements réels)
- `mrr.contractual` = somme des prix effectifs des subscriptions actives
  (`customPricePerMonth ?? plans.pricePerMonth`)
- `arr.actual` = `mrr.actual × 12`
- `arr.contractual` = `mrr.contractual × 12`

### 5.2 Gestion des tenants (R010, R011)

```
GET    /api/v1/admin/tenants              → liste paginée
GET    /api/v1/admin/tenants/:id          → détail complet
PATCH  /api/v1/admin/tenants/:id/status   → changer status
DELETE /api/v1/admin/tenants/:id          → soft delete
```

**Query params `GET /admin/tenants` :**
```
page (défaut 1), limit (défaut 20), search, status, plan
```

Réponse liste : `{ data: [...], pagination: { total, page, limit } }` (R010).

Toutes les queries sur `tenants` filtrent `deletedAt IS NULL` (R011).

**`PATCH /admin/tenants/:id/status` — comportement suspension :**

Lors d'un passage à `suspended` :
- Le statut du tenant est mis à `suspended`
- Les **refresh tokens actifs** du tenant sont invalidés (DELETE FROM refresh_tokens WHERE tenantId = ?)
- Les access tokens existants restent valides jusqu'à leur expiration naturelle (max 1h)
- Justification : invalider les access tokens nécessiterait une blacklist — coût disproportionné pour v1

**Réponse `GET /admin/tenants/:id` :**
```json
{
  "data": {
    "id": "uuid",
    "name": "Chambre Froide Djelfa",
    "slug": "chambre-froide-djelfa",
    "email": "contact@chambrefroide.dz",
    "phone": "+213...",
    "status": "active",
    "createdAt": "2024-01-15T08:00:00Z",
    "subscription": {
      "id": "uuid",
      "plan": "pro",
      "planId": "uuid-plan",
      "status": "active",
      "invoicesThisMonth": 18,
      "invoiceLimit": null,
      "usersLimit": 10,
      "currentPeriodEnd": "2026-07-01T00:00:00Z",
      "priceEffective": 5000
    },
    "usage": {
      "invoicesThisMonth": 18,
      "usersCount": 4
    },
    "users": [
      { "id": "uuid", "name": "Admin", "email": "...", "role": "owner", "isActive": true }
    ],
    "paymentsHistory": [
      { "id": "uuid", "amount": 5000, "paidAt": "2026-06-01", "method": "bank_transfer", "monthsCovered": 1 }
    ]
  }
}
```

> `passwordHash` n'est **jamais** sérialisé — utiliser un DTO de sortie `UserAdminDto`
> sans ce champ, pas l'entité brute. (R006 — pas d'exposition de données sensibles)

### 5.3 Gestion des abonnements (R005)

```
PATCH /api/v1/admin/subscriptions/:id
```

**Body :**
```json
{
  "planSlug": "pro",
  "customPricePerMonth": null,
  "invoiceLimit": null,
  "usersLimit": 10,
  "currentPeriodEnd": "2026-12-01T00:00:00Z"
}
```

Toute modification est dans une transaction QueryRunner avec écriture atomique
de l'`AdminAuditLog` (`{ before, after }` dans metadata).

### 5.4 Plans (R005, R019)

```
GET /api/v1/admin/plans
PUT /api/v1/admin/plans/:id
```

**Body `PUT` :**
```json
{
  "pricePerMonth": 2500,
  "invoiceLimit": 50,
  "usersLimit": 5,
  "features": { "creditNotes": false, "vendorBills": false, "production": false }
}
```

Modification d'un plan invalide le cache in-memory `PlanFeaturesGuard` immédiatement.

### 5.5 Encaissements SaaS (R005, R007, R010)

```
GET  /api/v1/admin/saas-payments           → liste paginée
POST /api/v1/admin/saas-payments           → enregistrer paiement
GET  /api/v1/admin/saas-payments/summary   → MRR réel du mois courant
```

**Body `POST` :**
```json
{
  "tenantId": "uuid",
  "amount": 5000,
  "method": "bank_transfer",
  "reference": "VIR-2026-0612",
  "paidAt": "2026-06-12",
  "monthsCovered": 1,
  "notes": "Paiement pro juin 2026"
}
```

**Transaction obligatoire (R005) :** Dans le même QueryRunner :
1. INSERT dans `saas_payments`
2. UPDATE `subscriptions.currentPeriodEnd += monthsCovered mois`
3. UPDATE `tenants.status = 'active'` si le tenant était `suspended`
4. INSERT `AdminAuditLog`

### 5.6 Audit logs (R007, R010)

```
GET /api/v1/admin/audit-logs
```

Query params : `page`, `limit`, `action`, `targetType`, `targetId`, `dateFrom`, `dateTo`.
Réponse : `{ data: [...], pagination: { total, page, limit } }` (R010).

---

## 6. PlanFeaturesGuard

Protège les routes conditionnelles selon le plan du tenant.

```typescript
// Fabrique paramétrée
export const PlanFeature = (feature: string) =>
  applyDecorators(UseGuards(JwtGuard, TenantGuard, RolesGuard, new PlanFeaturesGuard(feature)));

// Usage dans un controller
@Post()
@PlanFeature('production')
create(...) { ... }
```

**Implémentation :**
```typescript
@Injectable()
export class PlanFeaturesGuard implements CanActivate {
  // Cache in-memory : Map<planId, { features, cachedAt }>
  private cache = new Map<string, { features: Record<string, boolean>; cachedAt: number }>();
  private readonly TTL = 60_000; // 60 secondes

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const { tenantId } = context.switchToHttp().getRequest().user;
    // 1. Charger subscription.planId (query jointe subscription → plan)
    // 2. Vérifier cache, sinon charger features depuis DB
    // 3. Retourner true si features[this.feature] === true, sinon 403
  }
}
```

**Routes protégées :**

| Feature | Routes |
|---------|--------|
| `production` | `POST /production/orders`, `POST /production/nomenclatures` |
| `creditNotes` | `POST /invoices/credit-notes` |
| `vendorBills` | `POST /purchases/vendor-bills` |

---

## 7. Structure backend

```
src/admin/
├── admin.module.ts
├── auth/
│   ├── admin-auth.controller.ts    ← POST /admin/auth/login|refresh (séparé de src/auth/)
│   └── admin-auth.service.ts       ← service entièrement distinct de AuthService
├── tenants/
│   ├── admin-tenants.controller.ts
│   └── admin-tenants.service.ts
├── subscriptions/
│   ├── admin-subscriptions.controller.ts
│   └── admin-subscriptions.service.ts
├── saas-payments/
│   ├── admin-saas-payments.controller.ts
│   └── admin-saas-payments.service.ts
├── plans/
│   ├── admin-plans.controller.ts
│   └── admin-plans.service.ts      ← contient le cache PlanFeaturesGuard
├── stats/
│   ├── admin-stats.controller.ts
│   └── admin-stats.service.ts
├── audit/
│   └── admin-audit.service.ts      ← logAction(qr, adminId, action, before, after)
├── guards/
│   ├── admin.guard.ts
│   └── plan-features.guard.ts
├── entities/
│   ├── plan.entity.ts
│   ├── saas-payment.entity.ts
│   └── admin-audit-log.entity.ts
└── dto/
    ├── list-tenants.dto.ts
    ├── patch-tenant-status.dto.ts
    ├── patch-subscription.dto.ts
    ├── create-saas-payment.dto.ts
    ├── list-saas-payments.dto.ts
    ├── update-plan.dto.ts
    └── user-admin.dto.ts            ← DTO de sortie sans passwordHash
```

---

## 8. Structure frontend

### 8.1 Intégration dans la sidebar existante

Visible uniquement si `user.role === 'superadmin'`. Aucun changement visible
pour les tenants ordinaires.

```tsx
// client/src/components/layout/Sidebar.tsx
{user?.role === 'superadmin' && (
  <SidebarGroup key="admin" label={t('nav.group.admin')}>
    <NavItem to="/admin" icon={Shield} label={t('nav.admin.dashboard')} end />
    <NavItem to="/admin/tenants" icon={Building2} label={t('nav.admin.tenants')} />
    <NavItem to="/admin/plans" icon={CreditCard} label={t('nav.admin.plans')} />
  </SidebarGroup>
)}
```

### 8.2 AdminRoute

```tsx
// client/src/router.tsx
function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingSpinner />;
  if (!user || user.role !== 'superadmin') return <Navigate to="/dashboard" replace />;
  return <AppShell>{children}</AppShell>;
}
```

### 8.3 Routes à ajouter dans router.tsx

```tsx
<Route path="/admin" element={<AdminRoute><AdminDashboardPage /></AdminRoute>} />
<Route path="/admin/tenants" element={<AdminRoute><AdminTenantsPage /></AdminRoute>} />
<Route path="/admin/tenants/:id" element={<AdminRoute><AdminTenantDetailPage /></AdminRoute>} />
<Route path="/admin/plans" element={<AdminRoute><AdminPlansPage /></AdminRoute>} />
```

### 8.4 Pages

**`AdminDashboardPage`**
- KPIs : MRR réel, MRR contractuel, ARR, tenants actifs/trial/suspendus, nouveaux ce mois, churn
- Graphique barres : évolution du nb de tenants sur 12 mois (actifs/trial/suspendus)
- Tableau : top 5 clients par usage (factures ce mois)

**`AdminTenantsPage`**
- Tableau paginé : nom, plan, status (badge coloré), date inscription, factures ce mois, actions
- Filtres : search, status, plan
- Actions inline : bouton Activer / Suspendre + lien vers détail

**`AdminTenantDetailPage`**
- Breadcrumb : Admin > Clients > Nom du tenant
- Section société : nom, slug, email, phone, status + bouton "Changer statut"
- Section abonnement : plan actuel, limites, date renouvellement, prix effectif + bouton "Modifier plan" (modal)
- Progress bars : factures ce mois / limite ; users actifs / limite
- Section paiements SaaS : historique + bouton "Enregistrer un paiement" (modal)
- Section utilisateurs : tableau lecture seule (nom, email, rôle, actif)

**`AdminPlansPage`**
- Tableau des 3 plans avec prix, limites, features (toggle switches)
- Édition inline avec sauvegarde par ligne

### 8.5 AuthContext — ajout

```tsx
// client/src/contexts/AuthContext.tsx
const isSuperAdmin = user?.role === 'superadmin';
// Exposé dans le context pour usage dans les composants
```

### 8.6 Clés i18n à ajouter dans `fr.json` (R018)

```json
{
  "nav.group.admin": "Administration",
  "nav.admin.dashboard": "Vue d'ensemble",
  "nav.admin.tenants": "Clients",
  "nav.admin.plans": "Plans",
  "admin.stats.mrr": "MRR",
  "admin.stats.mrrActual": "MRR réel",
  "admin.stats.mrrContractual": "MRR contractuel",
  "admin.stats.arr": "ARR",
  "admin.stats.activeTenants": "Clients actifs",
  "admin.stats.trialTenants": "En essai",
  "admin.stats.suspendedTenants": "Suspendus",
  "admin.stats.newThisMonth": "Nouveaux ce mois",
  "admin.stats.churnThisMonth": "Churn ce mois",
  "admin.tenants.title": "Gestion des clients",
  "admin.tenants.status.trial": "Essai",
  "admin.tenants.status.active": "Actif",
  "admin.tenants.status.suspended": "Suspendu",
  "admin.tenants.actions.activate": "Activer",
  "admin.tenants.actions.suspend": "Suspendre",
  "admin.plans.title": "Plans tarifaires",
  "admin.plans.invoiceLimit": "Factures/mois",
  "admin.plans.usersLimit": "Utilisateurs max",
  "admin.plans.unlimited": "Illimité",
  "admin.payment.record": "Enregistrer un paiement",
  "admin.payment.method.bank_transfer": "Virement bancaire",
  "admin.payment.method.cash": "Espèces",
  "admin.payment.method.check": "Chèque",
  "admin.payment.method.ccp": "CCP",
  "admin.payment.monthsCovered": "Mois couverts",
  "errors.admin_only": "Accès réservé à l'administration Echango",
  "errors.plan_feature_disabled": "Cette fonctionnalité n'est pas incluse dans votre plan"
}
```

---

## 9. Migrations (5) — R002, R016

```
175XXXX-AddSuperadminRole.ts
  ALTER TYPE "user_role_enum" ADD VALUE 'superadmin'
  ALTER TABLE "users" ALTER COLUMN "tenantId" DROP NOT NULL
  — Index : aucun ajout (tenantId null = admins, peu nombreux)

175XXXX-RenameSubscriptionPlans.ts
  — Stratégie PostgreSQL : créer nouveau type, migrer, supprimer l'ancien (§2.3)
  — UPDATE subscriptions SET plan = 'starter' WHERE plan = 'freemium'
  — ADD VALUE 'enterprise' au nouveau type

175XXXX-CreatePlansTable.ts
  CREATE TABLE "plans" (id, slug, name, pricePerMonth, invoiceLimit, usersLimit,
    features jsonb, isActive, sortOrder, createdAt, updatedAt)
  UNIQUE("slug")
  INSERT des 3 plans par défaut (starter, pro, enterprise)
  ALTER TABLE "subscriptions" ADD COLUMN "planId" uuid REFERENCES plans(id)
  ALTER TABLE "subscriptions" ADD COLUMN "customPricePerMonth" decimal(10,2)
  ALTER TABLE "subscriptions" ADD COLUMN "currentPeriodStart" timestamptz
  ALTER TABLE "subscriptions" ADD COLUMN "currentPeriodEnd" timestamptz
  ALTER TABLE "subscriptions" ADD COLUMN "lastResetAt" timestamptz
  UPDATE subscriptions SET planId = (SELECT id FROM plans WHERE slug = plan::text)
  CREATE INDEX "IDX_subscriptions_plan_id" ON "subscriptions" ("planId")   ← R016

175XXXX-CreateAdminAuditLogs.ts
  CREATE TABLE "admin_audit_logs" (id, adminId, adminEmail, action, targetType,
    targetId, metadata jsonb, ipAddress inet, createdAt)
  CREATE INDEX "IDX_admin_audit_logs_admin_id"    ON "admin_audit_logs" ("adminId")
  CREATE INDEX "IDX_admin_audit_logs_target_id"   ON "admin_audit_logs" ("targetId")
  CREATE INDEX "IDX_admin_audit_logs_action"      ON "admin_audit_logs" ("action")
  CREATE INDEX "IDX_admin_audit_logs_created_at"  ON "admin_audit_logs" ("createdAt")

175XXXX-CreateSaasPayments.ts
  CREATE TABLE "saas_payments" (id, tenantId, amount decimal(10,2), method enum,
    reference, paidAt, monthsCovered int, notes, createdBy, createdAt)
  CREATE INDEX "IDX_saas_payments_tenant_id" ON "saas_payments" ("tenantId")   ← R016
  CREATE INDEX "IDX_saas_payments_paid_at"   ON "saas_payments" ("paidAt")
```

---

## 10. Modifications des fichiers existants

| Fichier | Changement | Invariant |
|---------|-----------|-----------|
| `src/auth/interfaces/jwt-payload.interface.ts` | `tenantId: string \| null` ; `role` + `'superadmin'` | — |
| `src/common/guards/tenant.guard.ts` | Rejeter (403) les tokens superadmin sur routes tenant | R020 |
| `src/invoices/sales-invoices.service.ts` | Lire `invoiceLimit` depuis `plans` via `subscription.planId` | R003 |
| `src/auth/auth.service.ts` | Supprimer `FREEMIUM_INVOICE_LIMIT` / `FREEMIUM_USER_LIMIT` hardcodés | R003 |
| `client/src/router.tsx` | Ajouter routes `/admin/*` + `AdminRoute` | — |
| `client/src/components/layout/Sidebar.tsx` | Groupe admin conditionnel `superadmin` | R018 |
| `client/src/contexts/AuthContext.tsx` | Exposer `isSuperAdmin: boolean` | — |
| `client/src/i18n/fr.json` | Clés `admin.*` + `errors.admin_only` + `errors.plan_feature_disabled` | R018 |
| `docs/specs/00-overview.md` | Remplacer section Business Model par 3 plans | — |
| `docs/specs/01-multi-tenancy.md` | Mettre à jour Subscription entity + JwtPayload + exception R020 admin | R020 |

---

## 11. Crons

| Cron | Horaire | Module | Action |
|------|---------|--------|--------|
| Reset compteurs mensuels | 1er du mois 00:01 | `admin.module.ts` | `invoicesThisMonth = 0` + `lastResetAt = now()` sur toutes les subscriptions actives |
| Suspension automatique | Quotidien 09:00 | `admin.module.ts` | Suspendre les tenants dont `currentPeriodEnd < now() - 7 jours` et status = 'active' |

Les deux crons sont dans `admin.module.ts` car ils opèrent sur plusieurs tenants
sans filtre tenantId — seul le module admin est autorisé à le faire.

---

## 12. Checklist PR — compléments au CLAUDE.md

```
Admin — sécurité
[ ] AdminGuard sur TOUTES les routes /admin/* sans exception
[ ] TenantGuard ABSENT des routes /admin/*
[ ] TenantGuard modifié pour rejeter les tokens superadmin (403)
[ ] /admin/auth/login sur controller et service SÉPARÉS de /auth/login
[ ] Rate limiting 5 req/15min sur /admin/auth/login
[ ] seed:admin vérifie absence de superadmin existant avant création
[ ] passwordHash absent de tous les DTOs de sortie contenant des users

Admin — atomicité
[ ] Chaque action admin + AdminAuditLog dans le même QueryRunner (R005)
[ ] POST /admin/saas-payments → update currentPeriodEnd dans la même transaction

Admin — données
[ ] Enum migration utilise stratégie create/UPDATE/drop (pas ALTER TYPE RENAME VALUE)
[ ] invoiceLimit lu depuis plans — constantes FREEMIUM_* supprimées des services
[ ] PlanFeaturesGuard sur les routes conditionnelles (production, creditNotes, vendorBills)
[ ] Crons reset + suspension dans admin.module.ts uniquement
[ ] Indexes DB sur saas_payments.tenantId, audit_logs.adminId/targetId/action/createdAt

R020 — exception documentée
[ ] Exception admin documentée dans le code (commentaire sur AdminGuard)
[ ] Aucune route /admin/* sans AdminGuard
```
