# 17 — Mobile V1 · Cache de consultation offline

> **Statut :** Spec validée — implémentable immédiatement
> **Périmètre :** Application mobile Capacitor, consultation hors ligne.
> **Hors périmètre :** toute saisie hors ligne → voir `18-mobile-v2-offline-writes.md`
> **Modèle recommandé :** sonnet (module additif, patterns connus)

---

## 1. Contexte et objectifs

### Problème résolu

Les agents commerciaux de Chambre Froide Djelfa travaillent en zone à couverture
réseau irrégulière (zones industrielles périphériques, fermes, entrepôts frigorifiques).
Aujourd'hui, sans réseau, l'application web est totalement inutilisable — l'agent
ne peut même pas consulter le solde d'un client avant d'entrer en négociation.

La V1 rend l'application **consultable en permanence**, y compris sans réseau.

### Objectifs

- L'agent consulte fiches clients, historique documents, catalogue produits sans réseau
- Aucune régression de fraîcheur quand le réseau est disponible
- L'architecture pose la couture (`Repository`) qui permettra la V2 **sans réécriture**

### Non-objectifs (explicitement V2)

- Création ou modification de documents hors ligne
- File d'attente de synchronisation (`outbox`)
- Pool de numéros pré-alloués
- Résolution de conflits
- Endpoint `POST /api/v1/sync/push`

> **Décision de cadrage.** Invoice Ninja a dominé son marché pendant dix ans avec
> exactement ce périmètre (offline lecture seule). Leur réécriture offline-first
> (dépôt `invoiceninja/flutter`, démarrée juin 2026) n'a pas encore été livrée à
> leurs clients. La V1 n'est donc pas une version dégradée : c'est le standard du
> marché, et elle nous met une application dans les mains des agents en semaines
> plutôt qu'en trimestres.

---

## 2. Stack technique

### 2.1 Mobile

| Composant | Choix | Justification |
|-----------|-------|---------------|
| Framework | **Capacitor 6.x** | L'équipe est React, pas React Native. ~90 % du code UI web est réutilisé. |
| Base React | Vite + React 19 (identique au web) | Un seul codebase UI |
| DB locale | **@capacitor-community/sqlite** 6.x | SQLite natif, chiffrement intégré |
| Chiffrement | **SQLCipher** (via le plugin) | Données financières + NIF clients sur l'appareil |
| Requêtes | Couche `Repository` maison | Abstraction réseau / cache (§4) |
| Stockage tokens | `@capacitor/preferences` + Keychain/Keystore | Jamais les tokens dans SQLite |

> **Capacitor et non Flutter.** Invoice Ninja v2 utilise Flutter + Drift. Les
> *patterns* de leur architecture nous intéressent (voir spec 18), pas leur
> outillage : Drift est Dart-only et n'a pas d'équivalent Capacitor. Le choix
> Capacitor est fondé sur la compétence de l'équipe, ce qui reste la bonne raison.

### 2.2 Backend

**Aucun nouveau module.** La V1 consomme les endpoints existants tels quels.

Une seule addition requise : un endpoint de santé (§3.2).

---

## 3. Détection de connectivité

### 3.1 Principe

L'application est « en ligne » si **notre backend répond**, pas si l'appareil a une
interface réseau active.

> **Leçon tirée d'Invoice Ninja.** Leur `ConnectionStatusSingleton` fait un
> `HTTP HEAD` vers `example.com`. Conséquence : un client auto-hébergé sur réseau
> local est déclaré « hors ligne » alors que son serveur répond parfaitement.
> Le même bug nous frapperait sur un VPS accessible en 3G dégradée mais où
> `example.com` est bloqué. On ne teste que ce qui nous concerne.

### 3.2 Endpoint requis (backend)

```
GET /api/v1/health   →   200 { "status": "ok" }
```

- **Non authentifié** (pas de JWT) — sinon un token expiré ferait croire à une panne réseau
- Aucun accès base de données — répond même si PostgreSQL est saturé
- Exclu du rate limiting et des logs applicatifs
- Réponse < 200 octets

```typescript
// src/common/health.controller.ts
@ApiTags('health')
@Controller('health')
export class HealthController {
  @Get()
  @ApiOperation({ summary: 'Liveness probe — utilisé par le mobile pour la détection réseau' })
  @ApiResponse({ status: 200, description: 'Service disponible' })
  check(): { status: string } {
    return { status: 'ok' };
  }
}
```

### 3.3 Logique mobile

```typescript
// Combinaison : état de l'interface réseau + joignabilité du backend
class ConnectivityService {
  private online = true;  // ← défaut : EN LIGNE

  async probe(): Promise<boolean> {
    const status = await Network.getStatus();
    if (!status.connected) return this.set(false);
    try {
      const res = await fetch(`${API_URL}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(4000),
      });
      return this.set(res.ok);
    } catch {
      return this.set(false);
    }
  }
}
```

**L'état par défaut est `online`.** Invoice Ninja a livré le défaut inverse et
affichait un bandeau rouge à chaque démarrage jusqu'à la première requête réussie
(bug corrigé dans leur PR #685). On ne refait pas cette erreur.

Sondage déclenché sur : démarrage, changement d'état réseau (`Network.addListener`),
retour en avant-plan de l'app, et échec réseau d'une requête.

---

## 4. Architecture — la couche Repository

C'est **la** décision structurante de la V1. L'interface définie ici ne changera
pas en V2 ; seule son implémentation s'enrichira.

### 4.1 Principe

L'UI ne sait jamais si elle lit le réseau ou le cache. Elle appelle un `Repository`.

```
Composants React
      ↓  (hooks TanStack Query)
   Repository          ← décide seul : API ou cache
      ↓         ↘
  ApiClient    CacheStore (SQLite)
```

### 4.2 Stratégie : Network-First

```
list() / get()
  ├─ en ligne  → appel API
  │               ├─ succès → écrit dans le cache → retourne les données API
  │               └─ échec réseau → lit le cache (fallback)
  └─ hors ligne → lit le cache directement
```

**Network-First et non Cache-First** : quand l'agent a du réseau il voit toujours
la vérité serveur. Le cache est un filet de sécurité, jamais une source de vérité.

Une erreur **applicative** (401, 403, 422) n'est jamais rattrapée par le cache —
elle remonte à l'UI. Seules les erreurs **réseau** déclenchent le fallback.

### 4.3 Interface

```typescript
// packages/mobile/src/repositories/base.repository.ts
export interface ListParams {
  page?: number;
  limit?: number;
  search?: string;
  [key: string]: unknown;
}

export interface Paginated<T> {
  data: T[];
  pagination: { total: number; page: number; limit: number };
  /** true si les données proviennent du cache local */
  fromCache: boolean;
  /** timestamp du dernier rafraîchissement réussi (ms) */
  cachedAt?: number;
}

export abstract class BaseRepository<T extends { id: string }> {
  protected abstract readonly resource: string;   // 'customers', 'delivery-notes'…
  protected abstract readonly table: string;      // 'cache_customers'…

  async list(params: ListParams = {}): Promise<Paginated<T>> {
    if (await connectivity.isOnline()) {
      try {
        const res = await api.get<Paginated<T>>(`/${this.resource}`, { params });
        await cache.putMany(this.table, res.data);
        return { ...res, fromCache: false };
      } catch (err) {
        if (!isNetworkError(err)) throw err;   // 401/422 → remonte à l'UI
        connectivity.markOffline();
      }
    }
    return cache.list<T>(this.table, params);
  }

  async findById(id: string): Promise<T | null> {
    if (await connectivity.isOnline()) {
      try {
        const res = await api.get<{ data: T }>(`/${this.resource}/${id}`);
        await cache.put(this.table, res.data);
        return res.data;
      } catch (err) {
        if (!isNetworkError(err)) throw err;
        connectivity.markOffline();
      }
    }
    return cache.findById<T>(this.table, id);
  }

  /** V1 : écriture en ligne uniquement. Surchargé en V2. */
  async create(dto: unknown): Promise<T> {
    if (!(await connectivity.isOnline())) throw new OfflineWriteError(this.resource);
    const res = await api.post<{ data: T }>(`/${this.resource}`, dto);
    await cache.put(this.table, res.data);
    return res.data;
  }

  async update(id: string, dto: unknown): Promise<T> {
    if (!(await connectivity.isOnline())) throw new OfflineWriteError(this.resource);
    const res = await api.patch<{ data: T }>(`/${this.resource}/${id}`, dto);
    await cache.put(this.table, res.data);
    return res.data;
  }
}
```

### 4.4 Ce que la V2 changera

Uniquement le corps de `create()` / `update()` :

```typescript
// V2 — l'UI n'est pas touchée
async create(dto: unknown): Promise<T> {
  if (await connectivity.isOnline()) { /* identique V1 */ }
  return this.outbox.enqueueCreate(this.table, dto);   // ← seule addition
}
```

**Règle absolue V1 : aucun composant React n'appelle `api` ou `cache` directement.**
Tout passe par un `Repository`. C'est ce qui garantit que la V2 ne touche pas l'UI.

---

## 5. Schéma SQLite — modèle hybride

### 5.1 Le problème du double schéma

Miroiter les entités PostgreSQL colonne par colonne dans SQLite crée deux schémas
à maintenir : chaque champ ajouté côté backend impose une migration SQLite.
C'est la principale dette de cette approche, et elle est évitable.

### 5.2 Décision : colonnes indexées + charge utile JSON

Chaque table de cache déclare **uniquement les colonnes sur lesquelles on requête**
(filtre, tri, recherche, jointure). Le reste de l'entité vit dans une colonne `data`
au format JSON, telle que l'API l'a renvoyée.

```sql
CREATE TABLE cache_customers (
  id         TEXT PRIMARY KEY,
  tenant_id  TEXT NOT NULL,
  name       TEXT NOT NULL,          -- recherche / tri
  phone      TEXT,                   -- recherche
  balance    REAL,                   -- tri
  updated_at INTEGER NOT NULL,       -- fraîcheur
  data       TEXT NOT NULL,          -- JSON complet de l'API
  cached_at  INTEGER NOT NULL
);
```

**Conséquences :**

| | Effet |
|---|---|
| Ajout d'un champ côté API | **Aucune migration SQLite** — il arrive dans `data` |
| Nouveau critère de recherche | Migration additive (une colonne extraite) — rare |
| Recherche / tri / pagination offline | Fonctionnels, sur les colonnes extraites |
| Jointures locales | Fonctionnelles, sur les `id` |
| Surface de schéma à maintenir | 4-6 colonnes par entité au lieu de 25 |

L'hydratation vers l'objet métier est triviale :

```typescript
const row = await db.query('SELECT data FROM cache_customers WHERE id = ?', [id]);
return JSON.parse(row.data) as Customer;
```

### 5.3 Tables de cache V1

| Table | Colonnes extraites (hors `id`, `tenant_id`, `data`, `cached_at`) |
|-------|------------------------------------------------------------------|
| `cache_customers` | `name`, `phone`, `balance`, `updated_at` |
| `cache_finished_products` | `name`, `unit_price`, `unit`, `updated_at` |
| `cache_delivery_notes` | `number`, `customer_id`, `status`, `delivery_date`, `total_amount`, `updated_at` |
| `cache_sales_invoices` | `number`, `customer_id`, `status`, `invoice_date`, `total_amount`, `amount_due`, `updated_at` |
| `cache_quotes` | `number`, `customer_id`, `status`, `quote_date`, `total_amount`, `updated_at` |
| `cache_payments` | `invoice_id`, `amount`, `paid_at`, `method`, `updated_at` |
| `cache_expenses` | `label`, `amount`, `expense_date`, `status`, `updated_at` |

Les **lignes de documents** (`*_items`) ne sont pas des tables séparées : elles sont
embarquées dans le `data` JSON de leur parent. Elles ne sont jamais requêtées seules.

### 5.4 Entités exclues du cache

| Entité | Raison |
|--------|--------|
| `stock_entries` | 8 000–15 000 lignes, logique FIFO strictement serveur |
| `admin_audit_logs` | 20 000–50 000 lignes, outil back-office uniquement |
| `saas_payments` | Données d'abonnement sensibles, aucun usage terrain |
| `production_orders`, BOM | Aucun usage terrain établi |
| `reception_bls`, `purchase_orders` | Reportés — à réévaluer sur retours terrain |

`inventory_summary` est consultable **en ligne uniquement**, avec un bandeau
« stock indicatif » (le solde évolue en permanence côté serveur).

### 5.5 Index

```sql
CREATE INDEX idx_cust_name       ON cache_customers(name);
CREATE INDEX idx_cust_tenant     ON cache_customers(tenant_id);
CREATE INDEX idx_dn_customer     ON cache_delivery_notes(customer_id);
CREATE INDEX idx_dn_date         ON cache_delivery_notes(delivery_date DESC);
CREATE INDEX idx_si_customer     ON cache_sales_invoices(customer_id);
CREATE INDEX idx_si_date         ON cache_sales_invoices(invoice_date DESC);
CREATE INDEX idx_si_status       ON cache_sales_invoices(status);
CREATE INDEX idx_pay_invoice     ON cache_payments(invoice_id);
CREATE INDEX idx_quote_customer  ON cache_quotes(customer_id);
```

Recherche client par nom : `LIKE 'terme%'` sur `name` indexé. FTS5 n'est pas
nécessaire à 300 clients — à reconsidérer au-delà de 5 000.

### 5.6 Migrations SQLite

Table `schema_version` (entier unique). Au démarrage, les migrations manquantes
s'appliquent dans l'ordre.

**Règle absolue : migrations additives uniquement.** Jamais de `DROP COLUMN`,
jamais de changement de type. Un `ALTER TABLE ADD COLUMN` sur SQLite est
instantané et sans risque ; le reste ne l'est pas.

En cas d'incohérence irrécupérable, la V1 dispose d'un recours que la V2 n'aura
plus : **purger et recharger**. Le cache ne contient aucune donnée qui n'existe
pas déjà sur le serveur.

---

## 6. Sécurité

### 6.1 Chiffrement de la base locale — obligatoire

Le cache contient les montants, les soldes clients, les NIF et RC. Sur un appareil
volé ou rooté, un fichier SQLite non chiffré est lisible intégralement.

```typescript
const db = await sqlite.createConnection(
  'echango_cache',
  true,                    // encrypted
  'secret',                // mode
  SCHEMA_VERSION,
  false,
);
```

La clé de chiffrement est générée à la première ouverture (`crypto.randomUUID()`),
stockée dans le Keychain iOS / Keystore Android via `@capacitor/preferences`
en mode sécurisé. **Jamais en dur dans le code, jamais dans SQLite.**

### 6.2 Isolation multi-tenant (R020)

Chaque table de cache porte `tenant_id`, et **toute lecture le filtre** :

```sql
SELECT data FROM cache_customers WHERE tenant_id = ? AND id = ?
```

Le `tenant_id` provient du JWT décodé, jamais d'un paramètre d'UI.

**Au changement d'utilisateur ou de tenant, le cache est intégralement purgé.**
C'est la seule garantie propre — un filtre oublié suffirait sinon à exposer
les données d'un autre tenant.

### 6.3 Déconnexion

`logout()` purge la totalité des tables de cache et supprime la clé de chiffrement.
En V1 c'est sans conséquence : aucune donnée locale n'est unique.

### 6.4 Session hors ligne

L'access token expire en 1 h, le refresh en 7 j. Hors ligne, aucun des deux ne peut
être rafraîchi.

**Décision V1 :** la consultation reste autorisée tant que le refresh token n'est
pas expiré (7 jours). Au-delà, l'application exige une reconnexion réseau et purge
le cache. Aucune écriture n'étant possible en V1, le risque d'un token périmé est
limité à la lecture de données déjà présentes sur l'appareil.

---

## 7. Fonctionnalités par mode

### 7.1 Disponible hors ligne

| Fonction | Source |
|----------|--------|
| Liste et recherche clients | `cache_customers` |
| Fiche client (coordonnées, solde, historique) | `cache_customers` + jointures |
| Liste et détail des BL | `cache_delivery_notes` |
| Liste et détail des factures | `cache_sales_invoices` |
| Liste et détail des devis | `cache_quotes` |
| Historique des paiements d'une facture | `cache_payments` |
| Catalogue produits et prix | `cache_finished_products` |
| Liste des dépenses | `cache_expenses` |

### 7.2 En ligne uniquement (V1)

Toute écriture — création et modification de BL, facture, devis, client, paiement,
dépense — ainsi que : envoi d'email, génération PDF, tableau de bord, rapports,
soldes de stock, module production, administration SaaS.

### 7.3 Comportement des actions d'écriture hors ligne

Le bouton reste **visible et actif**. Au clic, une modale explicite :

```
        Connexion requise

  La création de documents nécessite
  une connexion internet.

  Vos données consultables restent
  disponibles hors ligne.

           [ Compris ]
```

> **Décision UX.** On ne grise pas les boutons. Un bouton grisé sans explication
> génère de l'anxiété et des appels au support ; un bouton actif qui explique
> pourquoi il ne peut pas aboutir informe. Cette décision est reprise du
> rapport UX terrain.

---

## 8. UX

### 8.1 Bandeau de connectivité

Bandeau **persistant**, pleine largeur, 40 dp, sous le header :

```
┌──────────────────────────────────────────────┐
│ ⚠  Hors ligne · Données du 07/08 à 14:30     │
└──────────────────────────────────────────────┘
   Fond ambre #F59E0B · texte #1A1A1A · ratio 11:1
```

Au retour du réseau, bandeau vert `✓ Reconnecté` pendant 2 secondes, puis disparition.

L'horodatage affiché est le `cachedAt` **le plus ancien** parmi les entités
affichées à l'écran — jamais une moyenne, jamais le plus récent.

### 8.2 Design système terrain

Contraintes issues du rapport UX (usage en extérieur, plein soleil, une seule main) :

| Élément | Valeur |
|---------|--------|
| Zone de tap minimale | 48 dp (56 dp recommandé) |
| Hauteur d'item de liste | 72 dp |
| FAB de création | 64 dp |
| Contraste texte courant | ≥ 7:1 |
| Contraste montants et numéros | 7:1 **obligatoire** |

Interdits en extérieur : gris clair sur blanc (`#9CA3AF` → ratio 2.9:1),
transparences, ombres portées comme seul séparateur (utiliser des bordures).

Mode clair par défaut, bascule manuelle disponible.

### 8.3 Navigation

Bottom tabs, 5 onglets, avec FAB central surélevé :

```
🏠 Accueil   📄 Documents   ＋   📦 Stock   👤 Moi
```

Hors ligne : aucun onglet n'est désactivé. `Stock` affiche un bandeau
« données indisponibles hors ligne » avec le dernier solde connu grisé.

### 8.4 Rafraîchissement

- **Pull-to-refresh** sur toutes les listes → appel API si en ligne
- **Pull automatique silencieux** au retour du réseau, sur l'écran courant uniquement
- Bouton « Actualiser tout » dans l'onglet `Moi` → recharge toutes les entités cachées

Squelettes de chargement, jamais de spinner bloquant plein écran.

---

## 9. Volumes et performances

Base : tenant moyen — 300 clients, 200 produits, 1 000 factures, 800 BL,
600 paiements, 400 devis, fenêtre 90 jours.

| Poste | Valeur |
|-------|--------|
| Taille SQLite (JSON + index, chiffré) | **6–8 Mo** |
| Chargement initial complet, gzip | ~1,4 Mo |
| Temps sur 4G algérienne (~8 Mbit/s) | **5–7 s** |
| Temps sur 3G (~1,5 Mbit/s) | **13–15 s** |
| Rafraîchissement quotidien typique | 30–50 Ko |

> Le modèle JSON est ~15 % plus volumineux que des colonnes typées. C'est le prix
> assumé de l'absence de double schéma, et il est sans effet à cette échelle.

**Objectifs à valider en phase de test (Redmi 9A / Galaxy A12) :**

| Mesure | Cible |
|--------|-------|
| Ouverture d'une liste de 200 lignes depuis le cache | < 300 ms |
| Recherche client sur 300 fiches | < 150 ms |
| Écriture d'un lot de 500 entités | < 2 s |
| Démarrage à froid jusqu'à la première liste | < 2,5 s |

Écriture par lots de 300 lignes dans une transaction, avec restitution du thread UI
entre chaque lot. `PRAGMA foreign_keys = OFF` (aucune FK déclarée : les relations
sont résolues applicativement, ce qui évite les échecs d'ordre d'insertion).

---

## 10. Plan d'implémentation

| Phase | Contenu | Charge |
|-------|---------|--------|
| **1** | `GET /api/v1/health` · shell Capacitor · build EAS/Android | 1 sem. |
| **2** | `CacheStore` SQLite + SQLCipher · migrations · `ConnectivityService` | 1 sem. |
| **3** | `BaseRepository` + 7 repositories concrets · hooks TanStack Query | 1,5 sem. |
| **4** | Écrans : clients, documents, catalogue · bandeau · design terrain | 2 sem. |
| **5** | Tests terrain réels (3 agents, 2 semaines) · perf sur Redmi 9A | 1,5 sem. |
| **6** | Play Store · CI/CD | 1 sem. |

**Total : 8 semaines**, un développeur mobile.

La phase 5 n'est pas une phase de recette : c'est **la source de la décision V2**.
Ce qu'on y observe (les agents créent-ils réellement des documents sans réseau, ou
le besoin est-il ailleurs ?) détermine si la spec 18 est engagée, et sous quelle
forme.

---

## 11. Tests

### Backend
- `GET /health` répond 200 sans JWT, sans accès base

### Mobile — unitaires
- `BaseRepository.list()` en ligne → appelle l'API, écrit le cache
- `BaseRepository.list()` hors ligne → lit le cache, `fromCache: true`
- Erreur réseau en ligne → bascule sur le cache
- **Erreur 401/422 en ligne → remonte à l'UI, ne lit pas le cache**
- `create()` hors ligne → lève `OfflineWriteError`
- Changement de tenant → cache purgé intégralement
- Migration additive → données existantes préservées

### Mobile — intégration
- Coupure réseau pendant le défilement d'une liste → bascule sans erreur visible
- Retour du réseau → pull silencieux, bandeau vert 2 s
- Démarrage hors ligne, cache présent → liste affichée avec horodatage correct
- Démarrage hors ligne, cache vide → écran vide explicite (pas d'erreur brute)
- Backend joignable mais internet global coupé → **considéré en ligne**

### Terrain (phase 5)
- 3 agents, 2 semaines, tournée réelle
- Journal : occurrences de « Connexion requise », durée des passages hors ligne,
  fonctions consultées hors ligne

---

## 12. Invariants — application à la V1

| Invariant | Application |
|-----------|-------------|
| **R007** | Les repositories consomment `/api/v1/`, enveloppe `{ data, pagination }` inchangée |
| **R008** | Aucun calcul financier mobile — les montants affichés proviennent du serveur |
| **R010** | Pagination locale identique au contrat serveur |
| **R011** | Le serveur ne renvoie jamais d'entité supprimée ; le cache n'en contient donc pas |
| **R018** | Toutes les chaînes via `t()`, y compris les messages hors ligne |
| **R020** | `tenant_id` sur chaque table de cache, filtré à chaque lecture, purge au changement de tenant |

R001, R002, R005, R012, R013 ne s'appliquent pas : la V1 n'écrit rien côté serveur
et ne modifie aucune entité TypeORM.

---

*Suite → `18-mobile-v2-offline-writes.md` (saisie hors ligne, conditionnée aux retours de la phase 5)*
