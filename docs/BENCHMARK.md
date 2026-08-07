# BENCHMARK — Echango Invoice face au marché

> Étude du 2026-08-08. **Remplace** la version du 2026-06-19, devenue trompeuse :
> elle donnait comme gaps prioritaires le NIF/RC/AI, l'adresse de livraison et
> les contacts multiples, tous implémentés depuis. L'ancienne version reste dans
> l'historique git.

---

## Périmètre et méthode

**Ce que nous sommes.** Un outil de **facturation et de suivi de stock** pour
PME. Pas un ERP : ni comptabilité générale, ni paie, ni liasse fiscale, ni CRM.
C'est un choix, pas un manque — couvrir ce que demande le plus grand nombre
d'entreprises plutôt que tout couvrir.

**Conséquence directe sur cette étude :** Odoo, PC Compta, Silwane, OnyxComm ou
GestiumERP ne sont **pas** des points de comparaison. Ce sont d'autres
catégories, et se mesurer à eux ne dirait rien d'utile.

**Comparé ici :**

| Outil | Pourquoi lui |
|---|---|
| **Invoice Ninja** v5.13 | La référence open-source de la facturation. Étudié en profondeur |
| **Erplain** | Le comparable le plus proche : facturation **et** stock, sans être un ERP |
| **Henrri** (+ Facture.net) | La concurrence par la gratuité — il fixe le prix plancher |
| **Marché algérien** | Une vingtaine d'acteurs vérifiés sur source primaire |

**Écarté du périmètre**, sur arbitrage :
- **Paiement en ligne** et passerelles bancaires — sans objet en Algérie
- **Conformité fiscale** (mentions obligatoires, G50, facture normalisée) — fera
  l'objet d'une étude à part. ⚠️ *À noter quand même : c'est l'argument de vente
  numéro un de presque tous les acteurs algériens observés. La barrière à
  l'entrée face aux éditeurs étrangers y est réglementaire avant d'être
  technique.*

**Notre état de référence** a été établi **en lisant le code**, pas la
documentation — `docs/STATUS.md` s'était déjà révélé faux sur au moins un point.

---

## 1. Le paysage se scinde en trois

**Les outils de facturation pure** — Henrri, Facture.net, Wysii, Facture AE, et
vraisemblablement la majorité des SaaS algériens. Ils émettent des documents.
**Aucun stock.** Henrri le fait gratuitement, sans limite de factures, de clients
ni d'utilisateurs.

**Les ERP** — Odoo, Silwane, OnyxComm, Inabex, GestiumERP. Ils couvrent tout, y
compris la comptabilité et la paie, au prix d'une mise en œuvre lourde.

**Entre les deux, la case « facturation + stock »** — c'est la nôtre, et elle est
**occupée mais mal servie**. Sur le marché algérien, les acteurs positionnés
exactement là avec un tarif public se comptent sur une main : Dolisoft,
GestiumGo, ProPOS, Factury, girili. À l'international, Erplain est à peu près
seul à l'assumer pleinement.

---

## 2. Comparaison fonction par fonction

● mûr · ◐ limité · ○ absent

| | **Nous** | **Invoice Ninja** | **Erplain** | **Henrri** |
|---|---|---|---|---|
| Devis → facture | ● | ● | ● | ● |
| **Bon de livraison comme document** | ● série propre, statuts, signature | **○** simple PDF d'une facture sans les prix | ● | ◐ décoratif, sans effet stock |
| Avoirs | ◐ sans effet comptable | ● | ● | ● |
| **Stock par lots** | ● FIFO, coût, péremption | **○** un entier par article | ◐ CUMP, pas de FIFO | **○** |
| Réservé / entrant distincts | ○ | ○ | ● | ○ |
| Multi-dépôt | ○ | ○ | ● + emplacements | ○ |
| Inventaire physique | ◐ quantité absolue | ○ | ◐ mise à jour en masse | ○ |
| Quantités décimales | ● | **○** colonne entière | ● | ● |
| Commandes fournisseurs | ● | ● + portail fournisseur | ● | ○ |
| Réception partielle | ◐ statut prévu, pas de reprise | ○ tout ou rien | ● | ○ |
| **Factures fournisseurs + dette** | ● avec règlements | **○** la dépense est un fait de caisse binaire | **○** délégué à QuickBooks | ◐ archivage seul |
| **Production / nomenclatures** | ● BOM, ordres, mouvements | ○ | ○ kits simples | ○ |
| Tarifs par client | **○** | **○** | ● niveaux + règles | ○ |
| Catégories produits | ◐ via `type` | **○** | ● | ◐ |
| Unités de mesure | ● paramétrables | **○** | ● | ◐ |
| Relances impayés | ● cron J+7/14/21 | ● 3 niveaux + pénalités | ◐ | ◐ auto en payant |
| Portail client | ○ | ● très complet | ● B2B Store | ○ |
| Modèles PDF personnalisables | ○ 3 documents figés | ● le meilleur de sa catégorie | ● | ◐ |
| Export CSV / Excel | **○** | ● | ● | ● |
| Rapports | ● 5 + TVA | ● + planification | ● + marges | ◐ |
| Multi-société | ● multi-tenant SaaS | ● jusqu'à 10 | ○ | ○ |

---

## 3. Où nous sommes devant — et c'est défendable

**Le cycle achat complet, jusqu'à la dette fournisseur.** C'est **l'angle mort
commun** d'Invoice Ninja et d'Erplain. Ninja n'a pas de facture fournisseur du
tout : sa dépense est un fait de trésorerie binaire, sans échéance, sans solde,
sans règlement partiel. Erplain s'arrête à la réception et **délègue le reste à
QuickBooks ou Pennylane** — deux outils qui ne sont pas des options réalistes en
Algérie.

Nous avons `vendor_bills`, ses lignes, ses statuts et ses `vendor_payments`.
C'est un avantage réel, et il est structurel : un négociant qui achète à crédit
ne peut pas piloter son activité sans ça.

**Le bon de livraison comme vrai document.** Chez Invoice Ninja, le BL
**n'existe pas** : c'est un rendu PDF d'une facture, sans numérotation propre,
sans statut, sans quantités livrées distinctes. Un flux « livrer d'abord,
facturer ensuite » y est impossible. Chez Henrri, le BL n'a aucun effet sur un
stock qui n'existe pas. Nous avons une série `BL-YY-###`, cinq statuts, une
conversion en facture et un champ de signature.

**Le stock par lots.** Invoice Ninja n'a qu'un entier par article, sans
mouvements, sans historique, sans valorisation — leurs écritures contournent même
le journal d'audit. Erplain valorise en CUMP mais sans FIFO. Nous avons des lots
datés, avec coût, numéro de lot et péremption, et une consommation FIFO.

**La production.** Ni l'un ni l'autre n'en a. Nomenclatures, ordres, mouvements,
écarts prévu/réel : c'est un module entier qu'aucun des deux ne propose.

---

## 4. Où nous sommes derrière — par ordre d'importance

**1. Pas de tarifs par client.** Erplain a des niveaux de prix affectés à la
fiche client, plus des règles conditionnelles par période, par catégorie, par
lieu. C'est **la réalité du B2B**, pas un raffinement : un grossiste ne vend pas
au même prix à un détaillant et à une centrale. Nous n'avons qu'un
`defaultSalesPrice` par article, ressaisi à la main sur chaque ligne. Invoice
Ninja a la même lacune — mais Erplain montre où est la barre.

**2. Pas de distinction réservé / disponible / entrant.** Erplain expose quatre
niveaux ; sans eux, **on survend**. Nous avons bien une colonne
`reservedQuantity`, mais seule la production s'en sert : une commande client ne
réserve rien.

**3. Pas d'export CSV, nulle part.** Nos trois concurrents l'ont. C'est la
première chose que demande un comptable, et l'absence est totale — aucun écran,
aucun endpoint.

**4. Pas de page détail, pour aucune entité.** Tout passe par des modales, et
plusieurs sont réservées aux brouillons : les lignes d'une facture envoyée ou
payée sont tout simplement **inconsultables**. C'est un manque d'usage quotidien,
pas de fonctionnalité.

**5. Pas de modèles PDF personnalisables.** Trois documents figés (facture, BL,
devis), sans logo positionnable, sans mentions paramétrables. Ninja en fait le
domaine le plus abouti de son produit, avec onze modèles et un moteur de
templates. Sur un marché où la facture est la vitrine de l'entreprise, ça compte.

**6. Pas de portail client.** Ninja et Erplain en ont un. C'est un chantier
lourd, à mettre en regard de la valeur réelle pour une PME algérienne — sans doute
pas prioritaire, mais l'écart doit être connu.

---

## 5. Notre faiblesse la plus coûteuse n'est pas fonctionnelle

**Une trentaine d'endpoints n'ont aucun écran.** Nous avons développé, testé et
déployé des capacités que personne ne peut atteindre :

| Existe côté API | État côté interface |
|---|---|
| Envoi par e-mail des factures et des BL | **aucun bouton** — l'e-mail n'existe que par les crons de relance |
| Signature d'un BL | aucun écran → le statut `signed` est **inatteignable** |
| Liste et annulation des règlements | aucun écran → **impossible d'annuler un encaissement** |
| Invitation d'un collaborateur | aucun écran → **aucun moyen d'ajouter un utilisateur** |
| Consultation des lots de stock | aucun écran → n° de lot et péremption invisibles après réception |
| Graphiques du tableau de bord | aucun appel → tableau de bord sans aucun graphique |
| Résumé mensuel des dépenses | aucun appel |
| Tableau de bord production | aucun appel |

S'y ajoutent deux écrans **routés mais absents du menu** — Avoirs et Matières
premières — atteignables par URL seulement.

Et les **formats de numérotation** des Paramètres sont stockés, validés,
éditables… et lus par personne : les huit compteurs sont codés en dur. Modifier
un format dans l'interface n'a aucun effet.

**C'est le meilleur rapport valeur/effort du produit.** Chaque ligne ci-dessus
est une fonctionnalité déjà payée, qu'il suffit de rendre atteignable. Aucun
concurrent ne nous départage là-dessus : c'est de la dette purement interne.

---

## 6. Le prix — l'ancrage est net, et il nous est défavorable

Ce qui a pu être **vérifié sur les sites des éditeurs** algériens :

| Modèle | Fourchette |
|---|---|
| Licence perpétuelle sur poste | **12 000 – 25 000 DA** par poste (Dolisoft, GestiumGo) |
| Abonnement SaaS | **2 900 DA/mois** à **39 000 – 69 000 DA/an** (girili, Factury, Wysii) |

Nos plans actuels : **2 000 / 5 000 / 10 000 DA par mois**.

**Notre offre d'entrée coûte donc 24 000 DA la première année, contre 12 000 DA
une fois pour toutes chez Dolisoft** — et l'écart se creuse chaque année. Nous
sommes dans la fourchette haute du SaaS local, face à un marché où la licence
perpétuelle reste vivante précisément parce qu'elle est moins chère à terme.

Deux arguments observés chez les concurrents locaux, à mettre en regard de notre
choix SaaS : **« vos données restent sur votre ordinateur »** et **« hébergé en
Algérie »**. La réticence au cloud étranger est un argument de vente actif.

En face, Erplain va de 350 à 1 200 €/an, facturé en euros, avec +30 €/mois par
utilisateur supplémentaire sur les offres basses. Hors de portée du marché visé —
ce n'est pas un concurrent commercial ici, seulement un étalon fonctionnel.

---

## 7. Ce que j'en retiens

**La case que nous occupons est la bonne**, et le pari de Pareto tient : les
outils dérivent soit vers la facturation seule, soit vers l'ERP. Peu de monde
tient sérieusement le milieu.

**Trois chantiers, dans cet ordre :**

1. **Rendre atteignable ce qui existe déjà** — les trente endpoints sans écran,
   les deux pages hors menu, les formats de numérotation inertes. Effort faible,
   valeur immédiate, aucun risque produit.
2. **Les tarifs par client** — c'est le seul écart fonctionnel qui coûte des
   ventes en B2B, et Erplain montre que la barre est là.
3. **L'export CSV et les pages détail** — le confort quotidien qui fait qu'un
   outil est adopté ou contourné.

**Un point à trancher hors de cette étude** : notre tarification est plus chère
que l'ancrage local et notre modèle SaaS heurte un argument de souveraineté
activement porté par les concurrents. Ce n'est pas un problème fonctionnel, mais
c'est probablement le premier obstacle commercial.

---

## Limites de cette étude

**Deux angles morts assumés** sur le volet algérien :

- **Ouedkniss n'a pas pu être lu** (rendu JavaScript). C'est probablement le
  premier canal de distribution du segment TPE — donc le trou le plus grave.
- **Fatoura.app**, l'acteur le plus visible en recherche, n'a rien livré : site
  entièrement rendu côté client. Ni périmètre, ni tarif, ni éditeur.

Aucun prix issu d'un résumé de moteur de recherche n'a été retenu : plusieurs se
sont révélés fabriqués par du mauvais parsing d'annonces. **Aucune part de marché
n'est avancée** — désigner un leader sur la base d'un bon référencement ne
mesurerait que l'effort SEO.

**Sources** : documentation officielle et dépôt GitHub d'Invoice Ninja, sites et
support d'Erplain et Henrri, sites des éditeurs algériens, lecture directe de
notre code source.
