# 18 — Mobile V2 · Saisie hors ligne

> **Statut :** Spec de conception — **non engagée**
> **Prérequis :** `17-mobile-v1-cache.md` livrée, et phase 5 (terrain) exploitée
> **Modèle recommandé :** opus (architecture multi-modules, side effects transactionnels)

---

## 0. Condition d'engagement

Cette spec ne démarre pas sur décision d'architecture. Elle démarre sur **preuve
terrain**, collectée pendant la phase 5 de la V1 :

| Indicateur | Seuil d'engagement |
|-----------|--------------------|
| Occurrences de « Connexion requise » par agent et par jour | ≥ 3 |
| Part des documents créés depuis le terrain plutôt qu'au bureau | ≥ 40 % |
| Durée médiane d'un passage hors ligne | ≥ 45 min |

Sous ces seuils, le besoin réel est probablement ailleurs (lenteur de l'interface,
recherche client, consultation de solde) et la V1 y répond déjà. Engager cette spec
sans ces données, c'est construire une machinerie de synchronisation pour un
problème supposé.

> **Si les seuils sont atteints, en revanche, cette spec devient l'avantage
> concurrentiel principal d'Echango.** Ni Invoice Ninja (en production), ni Zoho,
> ni Dolibarr ne proposent la saisie hors ligne. Sur un marché où l'usage hors
> réseau est majoritaire, c'est un différenciateur qu'aucun concurrent ne couvre.

---

## 1. Ce que la V1 a déjà posé

La V2 n'est pas une réécriture. La V1 a délibérément installé la couture :

| Acquis V1 | Rôle en V2 |
|-----------|-----------|
| Couche `Repository` — l'UI n'appelle jamais l'API ni le cache | Seuls `create()` / `update()` changent. **Zéro modification d'écran.** |
| SQLite chiffré, tables `cache_*` avec `data` JSON | Deviennent les tables de travail : ajout de colonnes, pas de restructuration |
| `ConnectivityService` sondant `/health` | Déclenche le drain de la file |
| Migrations SQLite additives | Ajout de `sync_state` sans casser les caches existants |

---

## 2. Ce qu'on emprunte à Invoice Ninja v2 — et ce qu'on n'emprunte pas

Le dépôt `invoiceninja/flutter` (réécriture offline-first démarrée en juin 2026,
non encore livrée à leurs clients) documente un design solide. On en retient les
patterns, pas l'outillage — Drift est Dart-only et sans équivalent Capacitor.

| Pattern | Verdict | Raison |
|---------|---------|--------|
| Table `outbox` avec `attempts` / `next_attempt_at` et drain loop | **Adopté** | Répond exactement à notre besoin |
| `Idempotency-Key` réutilisée à chaque retry | **Adopté** | Indispensable sur réseau instable |
| Écran de file d'attente visible par l'utilisateur | **Adopté** | Cohérent avec notre exigence de transparence |
| `mintTempId()` → `tmp_<uuid>` puis remappage | **Écarté** | Voir §3 — sans objet chez nous |
| Réécriture des payloads en attente référençant un ID temporaire | **Écarté** | Conséquence directe du point précédent |
| `ConflictResolutionSheet` (résolution manuelle champ par champ) | **Écarté en V2.0** | Voir §7 |

### 2.1 Pourquoi le remappage d'IDs ne nous concerne pas

C'est la partie la plus intriquée de leur architecture, et elle nous est inutile.

Invoice Ninja tourne sur Laravel avec des clés primaires **auto-incrémentées** :
le client ne peut pas connaître l'ID avant la réponse serveur. D'où les IDs
temporaires, la table `id_remap`, et la réécriture des payloads en attente qui
référençaient l'ancien ID.

Nos entités utilisent des **UUID** (`@PrimaryGeneratedColumn('uuid')`), et TypeORM
accepte un UUID fourni. Le mobile génère donc un `crypto.randomUUID()` v4 **qui est
définitif dès la création locale**. Un BL créé hors ligne référençant un client créé
hors ligne cinq minutes plus tôt pointe vers un UUID stable, qui ne changera jamais.

Toute cette machinerie disparaît. C'est un avantage structurel de notre modèle de
données qu'il faut exploiter, pas reproduire par mimétisme.

### 2.2 Ce qu'aucune référence externe ne résout : le numéro légal

L'ID technique est réglé. Le **numéro de document** ne l'est pas.

`BL-24-047` est séquentiel, contrôlé par le serveur (R013), et surtout : il est
imprimé sur un bon que le client signe sur place. Un identifiant provisoire de type
`tmp_a3f9…` ou `BL-TEMP-x` sur un document signé n'est pas acceptable dans un
contexte commercial et fiscal algérien.

C'est le seul problème que ni Invoice Ninja, ni Zoho, ni aucune analyse externe ne
traite — parce qu'aucun d'eux ne fait de saisie hors ligne avec numérotation légale.
La réponse est le pool pré-alloué (§4).

---

## 3. Modèle de données local

### 3.1 Colonnes ajoutées aux tables `cache_*`

```sql
ALTER TABLE cache_delivery_notes ADD COLUMN sync_state  TEXT DEFAULT 'synced';
ALTER TABLE cache_delivery_notes ADD COLUMN local_rev   INTEGER DEFAULT 0;
ALTER TABLE cache_delivery_notes ADD COLUMN base_version INTEGER;
```

| Colonne | Rôle |
|---------|------|
| `sync_state` | `synced` \| `pending` \| `conflict` \| `error` |
| `local_rev` | Incrémenté à chaque modification locale — détecte les modifications concurrentes pendant un envoi en cours |
| `base_version` | `updated_at` serveur au moment où l'agent a ouvert le document. Arbitre du conflit (§7). |

Migrations additives : les caches V1 existants restent valides, `sync_state` vaut
`synced` par défaut.

### 3.2 Table `outbox`

```sql
CREATE TABLE outbox (
  id               TEXT PRIMARY KEY,      -- UUID v4
  tenant_id        TEXT NOT NULL,
  entity_type      TEXT NOT NULL,         -- 'delivery_note', 'payment'…
  entity_id        TEXT NOT NULL,         -- UUID définitif de l'entité
  operation        TEXT NOT NULL,         -- 'create' | 'update' | 'delete'
  payload          TEXT NOT NULL,         -- graphe complet du document (JSON)
  idempotency_key  TEXT NOT NULL,         -- UUID v4, stable sur tous les retries
  base_version     INTEGER,
  state            TEXT NOT NULL DEFAULT 'pending',
  attempts         INTEGER NOT NULL DEFAULT 0,
  next_attempt_at  INTEGER,
  last_error       TEXT,
  created_at       INTEGER NOT NULL
);

CREATE INDEX idx_outbox_ready ON outbox(state, next_attempt_at);
CREATE INDEX idx_outbox_entity ON outbox(entity_id);
```

### 3.3 Règle de coalescence

Une entité a **au plus une ligne `outbox` en attente**. Une modification d'un
document déjà en file écrase le `payload` existant plutôt que d'ajouter une ligne.

| État en file | Action de l'agent | Résultat |
|--------------|-------------------|----------|
| `create` | modifie | `create`, payload remplacé |
| `create` | supprime | **ligne supprimée** — le serveur n'en saura jamais rien |
| `update` | modifie | `update`, payload remplacé |
| `update` | supprime | remplacé par `delete` |
| aucune | modifie | nouvelle ligne `update` |

Cette règle élimine par construction les séquences d'opérations contradictoires,
sans machine à états ni journal d'événements.

### 3.4 Écriture atomique

L'écriture métier et l'entrée en file sont dans **une seule transaction SQLite** :

```typescript
await db.transaction(async tx => {
  await tx.run(`UPDATE cache_delivery_notes
                SET data = ?, sync_state = 'pending', local_rev = local_rev + 1
                WHERE id = ? AND tenant_id = ?`, [json, id, tenantId]);
  await tx.run(`INSERT INTO outbox (...) VALUES (...)
                ON CONFLICT(entity_id) WHERE state = 'pending'
                DO UPDATE SET payload = excluded.payload`, [...]);
});
```

Un crash entre les deux ne peut pas produire un document modifié mais jamais envoyé.

### 3.5 Granularité : le document, pas la table

Un BL part avec ses lignes dans un **seul payload**. On n'envoie jamais
`delivery_notes` puis `delivery_note_items` séparément : une coupure entre les deux
laisserait le serveur avec un document sans lignes, invalidable et incalculable.

```json
{
  "id": "uuid",
  "number": "BL-26-047",
  "customerId": "uuid",
  "deliveryDate": "2026-08-07",
  "items": [ { "id": "uuid", "productId": "uuid", "quantity": 12, "unitPrice": 4500 } ]
}
```

---

## 4. Pool de numéros pré-alloués

### 4.1 Principe

Le serveur réserve à l'appareil un bloc de numéros définitifs. L'agent les consomme
hors ligne dans l'ordre. Le numéro imprimé sur le bon signé est le numéro final.

### 4.2 Table serveur (migration R002)

```sql
CREATE TABLE number_pool_allocations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"   uuid NOT NULL REFERENCES tenants(id),
  "userId"     uuid NOT NULL REFERENCES users(id),
  "deviceId"   varchar(100) NOT NULL,
  "entityType" varchar(50)  NOT NULL,
  number       varchar(50)  NOT NULL,
  "allocatedAt" timestamptz NOT NULL DEFAULT now(),
  "expiresAt"  timestamptz NOT NULL,
  "consumedAt" timestamptz,
  CONSTRAINT uq_pool_number UNIQUE ("tenantId", "entityType", number)
);

CREATE INDEX idx_pool_device  ON number_pool_allocations("tenantId", "deviceId", "entityType");
CREATE INDEX idx_pool_expiry  ON number_pool_allocations("expiresAt") WHERE "consumedAt" IS NULL;
```

### 4.3 Allocation (R013 + R020)

```
POST /api/v1/sync/number-pool
{ "entityType": "delivery_note", "count": 10, "deviceId": "…" }
```

Verrou consultatif **scopé par tenant**, dans une transaction :

```sql
SELECT pg_advisory_xact_lock(hashtext('numpool_' || $1 || '_' || $2));  -- tenantId, entityType
```

Le prochain numéro est le maximum entre le dernier document émis et la dernière
allocation non expirée. Durée de vie : **72 h**.

### 4.4 Trous de séquence — décision assumée

Un agent qui reçoit 10 numéros et n'en consomme que 3 laisse 7 numéros inutilisés.
À l'expiration ils sont libérés, mais les documents créés entre-temps par d'autres
agents auront pris des numéros supérieurs. **Des trous apparaissent dans la
séquence.**

C'est inhérent à toute numérotation pré-allouée. Deux atténuations :

- Taille de pool adaptée à l'usage réel observé en V1 (probablement 5, pas 10)
- Réallocation **au retour de sync**, pas au login : le pool reste petit et frais

> **Point à valider juridiquement avant implémentation.** La réglementation
> algérienne sur la numérotation séquentielle des documents commerciaux doit être
> vérifiée quant à la tolérance aux trous. Si elle exige une séquence stricte sans
> rupture, le pool pré-alloué devient inapplicable et la saisie hors ligne de
> documents numérotés doit être abandonnée — les autres entités (clients, dépenses)
> restant éligibles. **C'est le risque bloquant n°1 de cette spec.**

### 4.5 Épuisement

Pool vide et hors ligne → la création est refusée avec un message explicite :

```
   Plus de numéros disponibles

   Vous avez utilisé vos 5 numéros de BL
   hors ligne. Synchronisez pour en obtenir
   de nouveaux.

              [ Compris ]
```

Le compteur restant est affiché en permanence dans l'onglet `Moi`, et un
avertissement apparaît à 2 numéros restants. L'agent ne doit jamais découvrir
l'épuisement face au client.

---

## 5. Boucle d'envoi

### 5.1 Déclencheurs

- Retour de connectivité (`ConnectivityService`)
- Action manuelle « Synchroniser »
- Retour de l'app en avant-plan avec file non vide

**Pas de tâche de fond périodique.** Décision prise en V1 et maintenue : la
synchronisation est un acte conscient de l'agent, ce qui rend le débogage trivial
et supprime toute surprise en cours de saisie.

### 5.2 Algorithme

```
tant que (ligne = plus ancienne outbox où state='pending' et next_attempt_at <= maintenant)
    POST /api/v1/sync/push  { operations: [ligne] }
        Idempotency-Key: ligne.idempotency_key
    selon la réponse :
      ok        → sync_state='synced', ligne supprimée, entité remplacée par la version serveur
      conflict  → sync_state='conflict', ligne retirée de la file, entrée au journal
      invalid   → sync_state='error',    ligne retirée de la file, entrée au journal
      réseau    → attempts++, next_attempt_at = maintenant + backoff(attempts)
```

Backoff : 5 s, 30 s, 2 min, 10 min, 1 h — plafonné à 1 h, avec gigue ±20 %.
Au-delà de 8 tentatives, la ligne passe en `error` et requiert une action de l'agent.

**Envoi séquentiel, une opération par requête.** Le débit n'est pas le sujet
(quelques dizaines de documents), et l'isolation par opération vaut mieux qu'un lot
dont l'échec partiel est ambigu.

### 5.3 Retour à jour obligatoire

Après un `ok`, la réponse contient l'entité telle que le serveur l'a enregistrée —
montants recalculés (R008), statut, `updatedAt`. Le mobile **remplace** sa version
locale par celle-ci.

Ce n'est pas optionnel : sans ce remplacement, l'agent conserverait indéfiniment les
montants calculés localement, qui n'ont qu'une valeur indicative.

---

## 6. Backend — module `src/sync/`

### 6.1 Périmètre

Module strictement additif. **Aucun controller existant n'est modifié.**

```
src/sync/
├─ sync.controller.ts
├─ sync.service.ts
├─ number-pool.service.ts
├─ validators/
│  ├─ tenant-ownership.validator.ts   ← chaque UUID référencé appartient au tenant
│  └─ field-whitelist.ts              ← champs modifiables par entité et par rôle
└─ dto/
```

### 6.2 Endpoints

```
POST /api/v1/sync/push          — applique une opération
POST /api/v1/sync/number-pool   — alloue un bloc de numéros
```

### 6.3 Séquence de traitement

Chaque opération, dans une transaction `QueryRunner` (R005) :

```
1. Abonnement du tenant actif ?          → sinon 403, batch entier refusé
2. Rôle autorisé sur cette entité ?      → sinon 403
3. Numéro présent dans le pool du device et non consommé ? → sinon 403
4. Tous les UUID référencés appartiennent au tenant ?      → sinon 422
5. base_version < updatedAt serveur ?    → 409 conflit
6. Champs filtrés par la whitelist
7. UPSERT par UUID (jamais INSERT sec)
8. Recalcul serveur des montants (R008)
9. Side effects (stock, soldes) — idempotents (§6.5)
10. Marquage du numéro comme consommé
11. Commit
```

### 6.4 Points non négociables

**Étape 1 — tenant suspendu.** Un tenant suspendu pendant que l'agent était hors
ligne ne doit pas voir ses documents acceptés. Contrôle en tête, avant tout
traitement.

**Étape 4 — isolation multi-tenant (R020).** Un `customerId` ou `productId` reçu du
mobile est une donnée non fiable. Chacun est vérifié contre le `tenantId` du JWT.
Sans ce contrôle, un payload forgé lit ou lie les données d'un autre tenant.

**Étape 6 — whitelist.** Le mobile ne peut écrire que des champs de saisie. Sont
exclus par construction : `subtotal`, `taxAmount`, `totalAmount`, `amountPaid`,
`amountDue`, `status` calculé, `tenantId`, `createdBy`. Un DTO de sync distinct du
DTO métier, jamais un `Partial<Entity>`.

**Étape 8 — R008.** Les montants reçus sont ignorés, pas validés. Le serveur
recalcule depuis les lignes brutes et le `taxRate` des settings.

### 6.5 Idempotence des side effects — le vrai piège

L'`UPSERT` par UUID rend la **création** idempotente : le même paiement envoyé deux
fois après un timeout produit une seule ligne.

Mais le **side effect** ne l'est pas si on l'écrit naïvement :

```typescript
// ❌ Rejoué au retry → solde faux
invoice.amountPaid += payment.amount;

// ✅ Recalcul depuis la source de vérité → rejouable sans dommage
invoice.amountPaid = await sumPayments(qr, invoice.id);
invoice.amountDue  = invoice.totalAmount - invoice.amountPaid;
invoice.status     = invoice.amountDue <= 0 ? 'paid' : invoice.status;
```

**Règle générale : tout side effect de `/sync/push` se calcule par agrégation, jamais
par incrément.** C'est la différence entre un double paiement de 150 000 DA et un
retry sans conséquence.

### 6.6 Réponse

```json
{
  "data": {
    "id": "uuid",
    "status": "ok",
    "entity": { "…": "version serveur complète, montants recalculés" }
  }
}
```

En cas d'échec : `status` vaut `conflict` ou `invalid`, avec `code`, `field` et,
pour un conflit, l'entité serveur et l'identité de l'auteur de la version retenue.

---

## 7. Conflits

### 7.1 Stratégie V2.0 — le serveur gagne, l'agent est informé

Détection par `base_version` (l'`updatedAt` serveur au moment où l'agent a ouvert
le document) comparé à l'`updatedAt` courant. S'ils diffèrent, quelqu'un est passé
entre-temps.

**On ne compare pas les horloges client.** La dérive sur Android d'entrée de gamme
atteint couramment plusieurs minutes ; une résolution fondée dessus est
indéfendable. `base_version` est un jeton serveur, pas une mesure de temps locale.

En cas de conflit : la version serveur est conservée, la version locale est écartée
et **portée au journal**. Pas de fusion champ par champ — l'interface nécessaire est
hors de portée d'un écran mobile utilisé debout dans un entrepôt.

Cette stratégie tient parce que le contexte s'y prête : 1 à 3 agents par tenant,
chacun sur ses propres clients, sans travail simultané sur le même document.
Le rapport Sécurité avait chiffré ces conflits comme rares.

### 7.2 Restitution à l'agent

Jamais le mot « conflit ». Au journal d'activité :

```
  BL-26-047 · 07/08 à 14:32
  Une version plus récente a été enregistrée
  par Karim à 14:29. Vos modifications de 14:32
  n'ont pas été conservées.

                          [ Voir le document ]
```

Notification différée au retour de sync, jamais en cours de saisie.

### 7.3 Cas métier à traiter explicitement

| Situation | Réponse serveur | Restitution |
|-----------|-----------------|-------------|
| Facture déjà soldée, paiement reçu hors ligne | `409 INVOICE_ALREADY_PAID` | « Cette facture a été réglée le … par … » |
| Devis converti en facture entre-temps | `409 QUOTE_ALREADY_INVOICED` | « Ce devis est devenu FAC-26-015 » |
| Client créé en double (même NIF) | `409 DUPLICATE_ENTITY` + UUID existant | Proposer de basculer sur la fiche existante |
| Suppression d'un document lié à un paiement | `422 CANNOT_DELETE_HAS_PAYMENTS` | « Suppression impossible : un paiement est enregistré » |

Le cas du client en double est le plus coûteux : accepter la fiche existante impose
de réécrire l'`customerId` des documents locaux qui référençaient l'UUID abandonné.
C'est une opération en cascade locale, à spécifier avant implémentation.

---

## 8. Périmètre fonctionnel

### 8.1 Saisie hors ligne autorisée

| Entité | Opérations | Justification |
|--------|-----------|---------------|
| `delivery_notes` + lignes | create, update | Cas d'usage principal — livraison en zone blanche |
| `quotes` + lignes | create, update | Devis établi chez le client |
| `payments` | create | **Encaissement en espèces sur place** |
| `expenses` | create, update | Frais de tournée |
| `customers` | create, update | Nouveau client rencontré en tournée |

> **Les paiements sont autorisés hors ligne.** Une analyse externe recommandait de
> les bloquer pour écarter le risque de double encaissement. C'est inapplicable ici :
> en Algérie le règlement est massivement en espèces, remis à l'agent sur place. Un
> agent qui ne peut pas enregistrer un encaissement reçu ne peut pas faire son
> travail. Le risque est traité techniquement (§6.5, agrégation au lieu d'incrément)
> et non par une restriction fonctionnelle.

### 8.2 En ligne uniquement

Factures de vente (side effects stock trop lourds — à réévaluer en V2.1),
conversion devis → facture, envoi d'email, génération PDF, réceptions et commandes
d'achat, production, rapports, administration SaaS.

### 8.3 Impression d'un document non synchronisé

**Autorisée.** L'application imprime ce qu'elle affiche, avec la mention
`Document non synchronisé` en pied de page.

> Une analyse externe recommandait de bloquer l'impression tant que le serveur n'a
> pas confirmé. Écarté : le bon de livraison est signé par le client au moment de la
> livraison, pas le soir au bureau. L'application informe, le professionnel décide.

---

## 9. Ce que cette spec écarte, et pourquoi

Des recommandations issues d'analyses externes ne sont pas retenues. Elles sont
techniquement valables, mais dimensionnées pour un autre produit — une place de
marché logistique avec des courses disputées en temps réel entre livreurs.
Echango Invoice est un SaaS de facturation B2B avec 1 à 3 agents par tenant,
travaillant chacun sur son portefeuille.

| Recommandation écartée | Motif |
|------------------------|-------|
| **Event sourcing** (file d'événements métier immuables) | Résout la reconstruction déterministe d'un état disputé par plusieurs acteurs. Nos entités ont un propriétaire de fait. Le coût — rejeu, versionnage d'événements, projections — n'a pas de contrepartie ici. |
| **Machines à états serveur pour la résolution** | Les quatre cas métier réels sont traités par des contrôles explicites (§7.3). Un moteur générique serait plus de code pour les mêmes quatre cas. |
| **Double file prioritaire** | Quelques dizaines d'opérations par sync. Une file FIFO les traite en secondes. |
| **Dead Letter Queue** | L'état `error` avec restitution à l'agent joue ce rôle. Une DLQ serveur suppose un opérateur pour la dépiler — nous n'en avons pas. |
| **Remappage d'IDs temporaires** | Sans objet : nos clés primaires sont des UUID générés côté client (§2.1). |

Ces mécanismes redeviendront pertinents si Echango évolue vers un produit
multi-acteurs à contention réelle. Ce n'est pas le produit d'aujourd'hui.

---

## 10. Plan d'implémentation

| Phase | Contenu | Charge |
|-------|---------|--------|
| **1** | `number_pool_allocations` + allocation verrouillée + tests concurrence | 1,5 sem. |
| **2** | `src/sync/` : push, validators, whitelist, recalcul, side effects idempotents | 3 sem. |
| **3** | Tests backend adversariaux : cross-tenant, rejeu, conflits, suspension | 1,5 sem. |
| **4** | Mobile : `outbox`, coalescence, drain, backoff | 2 sem. |
| **5** | UX : journal d'activité, état du pool, badges, messages métier | 1,5 sem. |
| **6** | Terrain (3 agents, 3 semaines) + correctifs | 2 sem. |

**Total : 11,5 semaines**, un backend et un mobile en parallèle à partir de la phase 2.

---

## 11. Tests

### Backend — adversariaux (bloquants)

- Payload avec `customerId` d'un autre tenant → 422, aucune écriture
- Payload avec `tenantId` forgé dans le corps → ignoré, celui du JWT prévaut
- Payload contenant `totalAmount` falsifié → ignoré, recalcul serveur
- Numéro hors du pool du device → 403
- Numéro déjà consommé → 403
- Tenant suspendu → 403, aucune opération du batch appliquée
- **Même opération rejouée 3 fois → une seule entité, `amountPaid` correct**
- Rôle `agent` tentant d'écrire un champ réservé → champ ignoré
- Allocation concurrente de pools sur 20 requêtes parallèles → aucun doublon

### Backend — conflits

- `base_version` périmé → 409, entité serveur intacte
- Paiement sur facture soldée → 409 `INVOICE_ALREADY_PAID`
- Devis déjà facturé → 409 `QUOTE_ALREADY_INVOICED`
- Suppression d'un document avec paiements → 422

### Mobile

- Crash entre écriture métier et mise en file → aucun des deux, ou les deux
- Modification d'un document déjà en file → une seule ligne, payload à jour
- `create` puis `delete` hors ligne → aucune requête émise
- Coupure en plein envoi → retry avec la même `Idempotency-Key`
- Pool épuisé → création refusée avec message, aucune ligne créée
- Conflit reçu → document en `conflict`, journal alimenté, file non bloquée

### Terrain

3 agents, 3 semaines. Mesures : documents créés hors ligne, taux de conflit réel,
occurrences d'épuisement de pool, opérations restées en `error`.

---

## 12. Risques

| Risque | Gravité | Traitement |
|--------|---------|------------|
| **Numérotation séquentielle légale incompatible avec les trous** | **Bloquant** | Vérification juridique **avant** phase 1 (§4.4) |
| Side effect non idempotent rejoué → solde faux | Critique | Agrégation systématique (§6.5) + test de rejeu bloquant |
| Client créé en double → cascade de réécriture locale | Élevé | Spécifier la cascade avant la phase 4 |
| Dérive d'horloge sur Android d'entrée de gamme | Moyen | `base_version` serveur, jamais l'horloge client |
| Schéma mobile en retard sur le backend | Moyen | En-tête `X-Schema-Version`, `426` sous la version minimale |
| Conflits plus fréquents que prévu | Faible | Mesuré en phase 6 ; au-delà de 2 % des opérations, revoir §7.1 |

---

*Précédent → `17-mobile-v1-cache.md`*
