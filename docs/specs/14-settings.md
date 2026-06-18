# 14 — Settings (Paramètres tenant)

> **Invariants concernés :** R001, R002, R003, R007, R011, R016, R018, R019

---

## Entities

### Settings

Un seul enregistrement par tenant (contrainte `UNIQUE` sur `tenantId`).

```typescript
@Entity('settings')
export class Settings {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', unique: true })
  tenantId: string; // un seul enregistrement par tenant

  @Column({ type: 'varchar', length: 255 })
  companyName: string;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 19 })
  taxRate: number; // taux TVA principal (legacy — remplacé par TaxRateConfig pour multi-tax)

  @Column({ type: 'varchar', length: 10, default: 'DA' })
  currency: string;

  @Column({ type: 'varchar', length: 30, default: 'BL-YY-###' })
  blNumberFormat: string;

  @Column({ type: 'varchar', length: 30, default: 'FAC-YY-###' })
  invoiceNumberFormat: string;

  @Column({ type: 'varchar', length: 30, default: 'DEV-YY-###' })
  quoteNumberFormat: string;

  @Column({ type: 'varchar', length: 30, default: 'PO-YY-###' })
  poNumberFormat: string;

  @Column({ type: 'text', nullable: true })
  logo?: string; // base64 ou URL vers storage

  @Column({ type: 'varchar', length: 255, nullable: true })
  email?: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  phone?: string;

  @Column({ type: 'text', nullable: true })
  address?: string;

  @Column({ type: 'text', nullable: true })
  footerText?: string; // texte bas de page sur les PDF (mentions légales, RIB, etc.)

  @Column({ type: 'varchar', nullable: true })
  updatedBy?: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  // Relations
  @OneToMany(() => TaxRateConfig, (tc) => tc.settings, { cascade: true, eager: true })
  taxRates: TaxRateConfig[];
}
```

**Contraintes DB :**
```sql
UNIQUE ("tenantId")
INDEX IDX_settings_tenant_id ON settings (tenantId)
```

---

### TaxRateConfig

Configurations de taxes disponibles pour le tenant. Utilisées pour pré-remplir `taxName1/taxRate1` sur les nouveaux items.

```typescript
@Entity('tax_rate_configs')
export class TaxRateConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  tenantId: string;

  @Column({ type: 'uuid' })
  settingsId: string;

  @Column({ type: 'varchar', length: 50 })
  name: string; // e.g. "TVA", "Timbre fiscal", "TAP"

  @Column({ type: 'decimal', precision: 5, scale: 2 })
  rate: number; // e.g. 19.00, 1.00, 2.00

  @Column({ type: 'boolean', default: false })
  isDefault: boolean; // une seule config isDefault = true par tenant

  @Column({ type: 'varchar', length: 10, default: 'DA' })
  currency: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  // Relation
  @ManyToOne(() => Settings, (s) => s.taxRates)
  @JoinColumn({ name: 'settingsId' })
  settings: Settings;
}
```

**Contraintes DB :**
```sql
INDEX IDX_tax_rate_configs_tenant_id   ON tax_rate_configs (tenantId)
INDEX IDX_tax_rate_configs_settings_id ON tax_rate_configs (settingsId)
```

**Règle :** une seule `TaxRateConfig` peut avoir `isDefault = true` par tenant.
Si une nouvelle config est marquée `isDefault`, l'ancienne passe à `false` (dans une transaction).

---

## Formats de numérotation

| Token | Description | Exemple |
|-------|-------------|---------|
| `YY` | 2 derniers chiffres de l'année | `24` pour 2024 |
| `YYYY` | Année complète sur 4 chiffres | `2024` |
| `MM` | Mois sur 2 chiffres | `06` |
| `###` | Séquence paddée sur 3 chiffres | `001`, `042` |
| `####` | Séquence paddée sur 4 chiffres | `0001`, `0042` |

**Exemples de formats personnalisables :**

| Format configuré | Résultat généré |
|-----------------|-----------------|
| `BL-YY-###` | `BL-24-001` |
| `BL-YYYY-###` | `BL-2024-001` |
| `FAC-YY-####` | `FAC-24-0001` |
| `FACT/YYYY/MM/###` | `FACT/2024/06/001` |
| `DEV-YY-###` | `DEV-24-001` |
| `PO-YY-###` | `PO-24-001` |

La séquence repart de 1 au début de chaque année (réinitialisation annuelle automatique).

---

## Endpoints

### GET /api/v1/settings

Retourne les paramètres du tenant courant (extrait du JWT).

**Response 200 :**
```json
{
  "data": {
    "id": "settings-uuid",
    "tenantId": "tenant-uuid",
    "companyName": "Chambre Froide Djelfa SARL",
    "taxRate": 19.00,
    "currency": "DA",
    "blNumberFormat": "BL-YY-###",
    "invoiceNumberFormat": "FAC-YY-###",
    "quoteNumberFormat": "DEV-YY-###",
    "poNumberFormat": "PO-YY-###",
    "logo": "https://storage.exemple.dz/logos/tenant-uuid/logo.png",
    "email": "contact@chambre-froide-djelfa.dz",
    "phone": "+213 27 123 456",
    "address": "Zone Industrielle Djelfa, Algérie",
    "footerText": "RC: 24B0123456 — NIF: 002412345600012 — RIB: CPA 123456789",
    "taxRates": [
      {
        "id": "tax-uuid-1",
        "name": "TVA",
        "rate": 19.00,
        "isDefault": true,
        "currency": "DA"
      },
      {
        "id": "tax-uuid-2",
        "name": "Timbre fiscal",
        "rate": 1.00,
        "isDefault": false,
        "currency": "DA"
      }
    ],
    "createdAt": "2024-01-01T00:00:00Z",
    "updatedAt": "2024-06-01T12:00:00Z"
  }
}
```

---

### PUT /api/v1/settings

Mise à jour complète des paramètres. **OWNER uniquement.**

Crée l'enregistrement s'il n'existe pas encore (upsert sur `tenantId`).

**Request :**
```json
PUT /api/v1/settings
Authorization: Bearer <token>

{
  "companyName": "Chambre Froide Djelfa SARL",
  "taxRate": 19.00,
  "currency": "DA",
  "blNumberFormat": "BL-YY-###",
  "invoiceNumberFormat": "FAC-YY-###",
  "quoteNumberFormat": "DEV-YY-###",
  "poNumberFormat": "PO-YY-###",
  "email": "contact@chambre-froide-djelfa.dz",
  "phone": "+213 27 123 456",
  "address": "Zone Industrielle Djelfa, Algérie",
  "footerText": "RC: 24B0123456 — NIF: 002412345600012 — RIB: CPA 123456789",
  "taxRates": [
    {
      "name": "TVA",
      "rate": 19.00,
      "isDefault": true
    },
    {
      "name": "Timbre fiscal",
      "rate": 1.00,
      "isDefault": false
    }
  ]
}
```

**Response 200 :** objet settings mis à jour (même format que GET).

**Erreurs :**
- `403` — rôle insuffisant (MANAGER ou AGENT)
- `422` — format de numérotation invalide (doit contenir `###` ou `####`)
- `422` — plusieurs `taxRates` avec `isDefault = true`

---

### POST /api/v1/settings/logo

Upload du logo de l'entreprise. **OWNER uniquement.**

Accepte deux formats :

**Format 1 — base64 (JSON) :**
```json
POST /api/v1/settings/logo
Content-Type: application/json

{
  "logo": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA..."
}
```

**Format 2 — multipart/form-data :**
```
POST /api/v1/settings/logo
Content-Type: multipart/form-data

logo: <binary file>
```

**Contraintes :**
- Formats acceptés : `image/png`, `image/jpeg`, `image/svg+xml`
- Taille maximale : 2 MB
- Dimensions recommandées : 400×200 px (ratio 2:1)

**Response 200 :**
```json
{
  "data": {
    "logo": "https://storage.exemple.dz/logos/tenant-uuid/logo.png",
    "updatedAt": "2024-06-18T10:30:00Z"
  }
}
```

**Erreurs :**
- `400` — format de fichier non supporté
- `413` — fichier trop volumineux (> 2 MB)
- `403` — rôle insuffisant

---

## Initialisation au premier login (seed)

Lors de la création d'un nouveau tenant, créer les settings par défaut :

```typescript
// Dans TenantOnboardingService
async initializeSettings(tenantId: string): Promise<void> {
  const settings = this.settingsRepo.create({
    tenantId,
    companyName: 'Mon Entreprise',
    taxRate: 19,
    currency: 'DA',
    blNumberFormat: 'BL-YY-###',
    invoiceNumberFormat: 'FAC-YY-###',
    quoteNumberFormat: 'DEV-YY-###',
    poNumberFormat: 'PO-YY-###',
  });
  await this.settingsRepo.save(settings);

  // Créer la config TVA par défaut
  await this.taxRateConfigRepo.save({
    tenantId,
    settingsId: settings.id,
    name: 'TVA',
    rate: 19.00,
    isDefault: true,
    currency: 'DA',
  });
}
```

---

## Utilisation des TaxRateConfig par les modules

Lors de la création d'un nouvel item (BL, facture, devis), le frontend appelle GET /settings pour récupérer les `taxRates` et pré-remplir `taxName1/taxRate1` avec la config `isDefault = true`.

```typescript
// Exemple frontend (récupération et pré-remplissage)
const { data: settings } = useQuery(['settings'], settingsApi.get);
const defaultTax = settings?.taxRates.find(t => t.isDefault);

// Initialisation formulaire item
const defaultItem = {
  taxName1: defaultTax?.name ?? null,   // "TVA"
  taxRate1: defaultTax?.rate ?? null,   // 19.00
  taxName2: null,
  taxRate2: null,
};
```

Le calcul des montants reste toujours côté backend (R008).

---

## Sécurité & Multi-tenancy

- `tenantId` est toujours extrait du JWT, jamais du body de la requête
- GET /settings : OWNER, MANAGER, AGENT (lecture autorisée à tous les rôles authentifiés)
- PUT /settings, POST /settings/logo : OWNER uniquement
- Un tenant ne peut jamais voir ou modifier les settings d'un autre tenant
