# BENCHMARK.md — Echango Invoice vs Invoice Ninja

> Analyse comparative réalisée le 2026-06-19.
> Source : code source Invoice Ninja v5-stable (GitHub), documentation officielle, retours communauté.
> Objectif : identifier les gaps et bonnes pratiques à intégrer dans Echango Invoice.

---

## 1. Clients / Customers

### Invoice Ninja — ce qu'ils font

- **32 champs** : adresse facturation + adresse livraison séparées, `vat_number`, `id_number` (NIF), `classification` (individual/business/company/partnership/trust/charity/government/other), `is_tax_exempt`, `routing_id`, `custom_value1–4` avec labels configurables
- **Contacts multiples** par client : chaque contact a `is_primary`, `send_email`, `cc_only`, `can_sign` (e-signature), mot de passe portail propre
- **Paramètres per-client** : devise, langue, `lock_invoices` (bloque les modifications après envoi)
- **Groupes clients** : appliquer des paramètres communs à une catégorie entière (ex : grossistes, détaillants)
- **Portail client** : le client consulte ses factures/devis/paiements, télécharge les PDFs, paie en ligne, approuve un devis d'un clic, génère ses relevés de compte

### Echango Invoice — état actuel

| Fonctionnalité | Echango | Ninja |
|---|---|---|
| Adresse facturation | ✅ | ✅ |
| Adresse livraison | ❌ | ✅ |
| NIF (`id_number`) | ❌ | ✅ |
| RC, AI (Algeria) | ❌ | — (via custom_value) |
| Contacts multiples | ❌ (1 seul) | ✅ (n contacts) |
| `is_tax_exempt` | ❌ | ✅ |
| Groupes clients | ❌ | ✅ |
| Portail client self-serve | ❌ | ✅ |
| Champs custom configurables | ❌ | ✅ (4 client + 4 contact) |

### Gaps prioritaires pour nous

1. **NIF + RC + AI** — champs obligatoires sur toute facture algérienne (Code de commerce)
2. **Adresse livraison** — le BL est livré à un entrepôt différent du siège social
3. **Contacts multiples** — une entreprise a un comptable ET un directeur des achats

---

## 2. Produits / Catalogue

### Invoice Ninja — ce qu'ils font

- Champs : `name`, `cost` (prix achat), `price` (prix vente), `notes`, `unit`, `tax_name1/rate1`, `tax_name2/rate2`, `custom_value1–4`
- **Stock tracking** intégré (v5+) : `in_stock`, `stock_notification`, `stock_notification_threshold` — comptage simple (pas FIFO)
- Produit marqué taxable/non-taxable
- Bibliothèque avec recherche rapide lors de la saisie de lignes de facture

### Echango Invoice — état actuel

| Fonctionnalité | Echango | Ninja |
|---|---|---|
| Prix vente | ✅ | ✅ |
| Prix achat (`cost`) | ❌ | ✅ |
| TVA par produit (2 niveaux) | ✅ (sur item BL/facture) | ✅ |
| Seuil alerte stock | ✅ (matières premières) | ✅ (produits finis) |
| Gestion stock FIFO | ✅ | ❌ (comptage simple) |
| Champs custom | ❌ | ✅ |

**Notre avantage** : gestion FIFO + matières premières + entrées/sorties = bien au-delà de ce que Ninja propose. C'est un différenciateur ERP fort.

---

## 3. Devis (Quotes)

### Invoice Ninja — ce qu'ils font

- États : `draft → sent → approved → expired → converted`
- Expiration automatique par cron (quotidien)
- **Approbation depuis portail client** : 1 clic → `approved` + conversion automatique en facture
- Le client peut **signer** électroniquement avant d'approuver
- Case d'acceptation des CGV obligatoire avant approbation (configurable)
- Conversion devis → facture : copie les lignes + conserve le lien `quoteId`
- Webhook déclenché sur approbation

### Echango Invoice — état actuel

| Fonctionnalité | Echango | Ninja |
|---|---|---|
| États complets | ✅ | ✅ |
| Cron expiration | ✅ | ✅ |
| Conversion quote → invoice | ✅ | ✅ |
| Approbation portail client | ❌ | ✅ |
| Signature électronique client | ❌ | ✅ |
| Webhooks | ❌ | ✅ |

---

## 4. Bons de Livraison (Delivery Notes)

### Invoice Ninja — ce qu'ils font

Invoice Ninja **ne gère pas les BL** comme document indépendant. Ils ont des "packing slips" (bordereau d'emballage), qui sont une vue alternative de la facture — pas un document de livraison avec workflow propre. La numérotation séquentielle des BL est une **feature request ouverte** (GitHub #7110, toujours non implémentée).

### Echango Invoice — état actuel

✅ BL indépendant avec numérotation `BL-YY-###`
✅ Workflow : `draft → sent → signed → delivered`
✅ Signature client + date de signature
✅ Décrémentation FIFO stock à la création
✅ Libération stock si annulation ou modification (PUT draft)
✅ Lien BL → Facture

**Conclusion : nous sommes significativement en avance sur Ninja sur ce module.** Le BL est un document légal de livraison en Algérie — c'est un vrai avantage concurrentiel.

---

## 5. Factures (Sales Invoices)

### Invoice Ninja — ce qu'ils font

- États : `draft → sent → partial → paid → overdue → cancelled`
- **Paiement partiel** : `amountPaid` + `amountDue` + status `partial`
- **Sur-paiement** : l'excédent crée un **crédit client** (avoir) réutilisable sur la prochaine facture
- **Note de crédit (avoir)** : document distinct qui réduit le solde client — obligation légale
- **Supprimer un paiement** : recalcule automatiquement le statut de la facture
- **Factures récurrentes** : template + fréquence (daily/weekly/monthly/quarterly/yearly) + auto-send
- **Rappels automatiques** : 1er rappel J+7, 2ème J+14, 3ème J+21 — templates email distincts par rappel
- **Pattern numérotation custom** : `{$year}-{$counter:5}` configurable dans settings
- **Verrou après envoi** : modification bloquée une fois la facture envoyée (configurable per-client)
- **Archive automatique** quand statut = paid

### Echango Invoice — état actuel

| Fonctionnalité | Echango | Ninja |
|---|---|---|
| Paiement partiel | ✅ | ✅ |
| Cron overdue | ✅ | ✅ |
| PUT (modifier brouillon) | ✅ | ✅ |
| Sur-paiement → crédit client | ❌ | ✅ |
| Note de crédit / avoir | ❌ | ✅ |
| Supprimer un paiement | ❌ | ✅ |
| Factures récurrentes | ❌ | ✅ |
| Rappels email automatiques | ❌ | ✅ |
| Pattern numérotation custom | ❌ (hardcodé FAC-YY-###) | ✅ |
| Verrou après envoi | ❌ | ✅ |

**Gap critique** : le sur-paiement sans gestion du crédit client crée une perte silencieuse. La note de crédit (avoir) est une obligation légale en Algérie.

---

## 6. Paiements

### Invoice Ninja — ce qu'ils font

- **Types de paiement** : Cash, Chèque, Virement bancaire, Carte bancaire, + 40 gateways en ligne (Stripe, PayPal, etc.)
- **Application sur plusieurs factures** : un paiement peut couvrir plusieurs factures à la fois
- **Refund** : remboursement partiel ou total → recalcule le solde client
- **Crédit client** : sur-paiement alimente un solde crédit applicable aux prochaines factures
- **Référence externe** : numéro de virement, numéro de chèque, etc.

### Echango Invoice — état actuel

| Fonctionnalité | Echango | Ninja |
|---|---|---|
| Enregistrement paiement | ✅ | ✅ |
| amountPaid / amountDue | ✅ | ✅ |
| Type de paiement | ❌ | ✅ |
| Référence externe | ❌ | ✅ |
| Application sur plusieurs factures | ❌ | ✅ |
| Remboursement | ❌ | ✅ |
| Crédit client | ❌ | ✅ |

---

## 7. Dépenses (Expenses)

### Invoice Ninja — ce qu'ils font

- **Dépense facturable** : cocher "billable" → la dépense apparaît comme ligne dans la prochaine facture du client concerné
- Fournisseur lié à chaque dépense
- **Catégories** de dépenses personnalisables
- **Dépenses récurrentes** : template + fréquence
- **Pièces jointes** : scan de reçu uploadé
- Conversion devise automatique si dépense en devise étrangère

### Echango Invoice — état actuel

| Fonctionnalité | Echango | Ninja |
|---|---|---|
| CRUD dépenses | ✅ | ✅ |
| Approbation manager | ✅ | ✅ |
| Résumé mensuel | ✅ | ✅ |
| Dépense facturable | ❌ | ✅ |
| Dépenses récurrentes | ❌ | ✅ |
| Pièces jointes | ❌ | ✅ |
| Catégories configurables | ❌ | ✅ |

---

## 8. PDF & Email

### Invoice Ninja — ce qu'ils font

- **Moteur PDF** : Chromium headless (Puppeteer) — haute fidélité HTML/CSS
- **Templates multiples** : Modern, Bold, Business, Clean, Plain + custom HTML/CSS illimité
- **Tracking email** : pixel 1×1 → sait si le client a ouvert l'email et cliqué sur le lien
- **Rappels automatiques** : 3 niveaux configurables (délai + template distinct par rappel)
- **CC/BCC** configurables par défaut par type de document
- **SMTP custom** ou Mailgun/Postmark
- **Archivage** : PDF stocké une fois, réutilisé sans régénération

### Echango Invoice — état actuel

| Fonctionnalité | Echango | Ninja |
|---|---|---|
| Génération PDF | ❌ | ✅ |
| Templates multiples | ❌ | ✅ |
| Envoi email | ❌ | ✅ |
| Tracking email (ouverture) | ❌ | ✅ |
| Rappels automatiques | ❌ | ✅ |
| SMTP configurable | ❌ | ✅ |
| Archivage ARCHIVES/YYYY/MM/ | ❌ (prévu R014) | ✅ |

**C'est le plus grand gap opérationnel.** Sans PDF et sans email, aucune facture ne peut être envoyée aux clients.

---

## 9. Rapports

### Invoice Ninja — ce qu'ils font

- Rapport Factures, Paiements, Dépenses, Produits
- **P&L (Profits & Pertes)** : revenus − dépenses = résultat net
- **AR Aging (Créances par ancienneté)** : qui doit quoi, depuis combien de jours (0–30j / 31–60j / 61–90j / 90j+) — clé pour le recouvrement
- **Résumé TVA** : total TVA collectée par taux, par période — obligatoire pour la déclaration DGI en Algérie
- Export CSV sur tous les rapports

### Echango Invoice — état actuel

| Rapport | Echango | Ninja |
|---|---|---|
| Ventes | ✅ | ✅ |
| Achats | ✅ | ✅ |
| Dépenses | ✅ | ✅ |
| Stock | ✅ | ❌ |
| P&L | ❌ | ✅ |
| AR Aging (créances) | ❌ | ✅ |
| Résumé TVA | ❌ | ✅ |
| Export CSV | ❌ | ✅ |

---

## 10. Multi-tenancy, Auth & Rôles

### Invoice Ninja — ce qu'ils font

- **Modèle "Companies"** : un user peut appartenir à plusieurs companies (multi-entreprise) — utile pour expert-comptable gérant plusieurs clients
- Base de données partagée partitionnée par `company_id` (même approche que nous avec `tenantId`)
- **Rôles** : Admin, Manager, Viewer + rôles custom granulaires (Enterprise)
- **Invitation par email** : owner invite un collaborateur → lien d'acceptation
- **API tokens** par utilisateur (pour intégrations tierces)
- **2FA** (TOTP — Google Authenticator)

### Echango Invoice — état actuel

| Fonctionnalité | Echango | Ninja |
|---|---|---|
| tenantId sur toutes les queries | ✅ (R020) | ✅ |
| Rôles owner/manager/agent | ✅ | ✅ |
| Invitation par email | ❌ (prévu) | ✅ |
| 2FA | ❌ | ✅ |
| API tokens | ❌ | ✅ |
| Multi-company par user | ❌ | ✅ |

---

## 11. Ce que Ninja ne fait pas — notre avantage ERP

Invoice Ninja est un outil de facturation. **Il n'est pas un ERP.** Tout ce qui suit est notre différenciateur fort pour l'industrie (Chambre Froide, agroalimentaire, manufacturing) :

| Module | Echango | Invoice Ninja |
|---|---|---|
| Matières premières | ✅ | ❌ |
| Commandes d'achat (PO) | ✅ | ❌ |
| Bons de réception (BL achat) | ✅ | ❌ |
| Stock FIFO avec entrées datées | ✅ | ❌ |
| Alertes stock avec seuils | ✅ | ❌ |
| BL de vente indépendant | ✅ | ❌ |
| Workflow BL → Signature → Livraison | ✅ | ❌ |
| Réservation stock à la création BL | ✅ | ❌ |
| Libération stock si annulation BL | ✅ | ❌ |

---

## 12. Tableau des priorités

### 🔴 Critique — impact légal ou opérationnel bloquant

| # | Gap | Justification |
|---|---|---|
| 1 | **Génération PDF** | Sans PDF, aucune facture ne peut être envoyée. Bloquant. |
| 2 | **NIF + RC sur client et facture** | Obligation légale algérienne (Code de commerce art. 31). |
| 3 | **Note de crédit / avoir** | Annulation partielle d'une facture = obligation légale comptable. |
| 4 | **Résumé TVA** | Déclaration mensuelle à la DGI — obligatoire. |

### 🟠 Fort — impact fort sur l'usage quotidien

| # | Gap | Justification |
|---|---|---|
| 5 | **Type + référence de paiement** | Virement/chèque/espèces = piste d'audit comptable essentielle. |
| 6 | **Envoi email** | Lié au PDF — les deux forment un seul bloc fonctionnel. |
| 7 | **AR Aging (créances)** | Recouvrement — savoir qui doit quoi depuis combien de jours. |
| 8 | **Rappels email automatiques** | Réduction des impayés. Ninja les envoie J+7, J+14, J+21. |
| 9 | **Invitation collaborateurs** | Déjà dans les specs, non implémenté. |

### 🟡 Moyen — amélioration qualité

| # | Gap | Justification |
|---|---|---|
| 10 | **Contacts multiples par client** | Grandes entreprises ont un comptable + un directeur achats. |
| 11 | **Adresse livraison** | BL livré à un entrepôt différent du siège social. |
| 12 | **Pattern numérotation custom** | FAC-YY-### hardcodé ; configurable dans settings (spec 14). |
| 13 | **Adresse livraison sur BL** | Adresse de destination ≠ adresse de facturation. |

### ✅ Ce que nous n'avons pas besoin de copier de Ninja

| Feature Ninja | Pourquoi pas pertinent pour nous |
|---|---|
| Portail client en ligne | Marché algérien B2B : les clients ne paient pas en ligne |
| Gateways paiement en ligne | Carte bancaire Algérie = très limité (CIB non intégrable facilement) |
| Dépenses facturables | Segment freelance — pas pour l'industrie de la chaîne du froid |
| Factures récurrentes | Leurs clients ne sont pas en abonnement mensuel |
| 2FA TOTP | Pas un blocant pour le marché cible actuellement |

---

## Sources

- [Invoice Ninja — Client Model source (v5-stable)](https://github.com/invoiceninja/invoiceninja/blob/v5-stable/app/Models/Client.php)
- [Invoice Ninja — ClientContact Model source](https://github.com/invoiceninja/invoiceninja/blob/v5-stable/app/Models/ClientContact.php)
- [Invoice Ninja — Documentation officielle](https://invoiceninja.github.io/docs/)
- [Invoice Ninja — Client Portal](https://invoice-ninja.readthedocs.io/en/latest/client_portal.html)
- [Invoice Ninja — GitHub Issues (feature requests)](https://github.com/invoiceninja/invoiceninja/issues)
- [Feature request delivery note numbering — #7110](https://github.com/invoiceninja/invoiceninja/issues/7110)
- [Invoice Ninja vs Zoho Invoice vs Wave — Capterra 2025](https://www.capterra.com/billing-and-invoicing-software/compare/145215-178021/Invoice-Ninja-vs-Wave-Apps)
- [Invoice Ninja limitations — research.com](https://research.com/software/reviews/invoice-ninja)
