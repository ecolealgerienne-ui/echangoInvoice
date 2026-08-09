# BENCHMARK — Echango Invoice face au marché

> Étude du 2026-08-08. **Remplace** la version du 2026-06-19, devenue trompeuse :
> elle donnait comme gaps prioritaires le NIF/RC/AI, l'adresse de livraison et
> les contacts multiples, tous implémentés depuis. L'ancienne version reste dans
> l'historique git.
>
> **Mise à jour du soir du 2026-08-08.** Les six écarts de la section 4 ont été
> traités dans la journée. Les colonnes de la section 2 et le classement de la
> section 4 ont été révisés en conséquence — laisser un état périmé dans ce
> document reproduirait exactement le défaut qu'on reproche à `STATUS.md`.
> Le paysage, les prix et la méthode n'ont pas changé.

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
- **Conformité fiscale** (mentions obligatoires, G50, facture normalisée) —
  **l'étude a été faite le 2026-08-08 : voir `docs/CONFORMITE-FISCALE.md`.**
  C'est bien l'argument de vente numéro un de presque tous les acteurs algériens
  observés : la barrière à l'entrée face aux éditeurs étrangers y est
  réglementaire avant d'être technique. Écart principal restant : le **droit de
  timbre** sur les ventes au comptant.

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
| Avoirs | ● effet comptable réel | ● | ● | ● |
| **Stock par lots** | ● FIFO, coût, péremption | **○** un entier par article | ◐ CUMP, pas de FIFO | **○** |
| Réservé / entrant distincts | ● physique / réservé / dispo / entrant | ○ | ● | ○ |
| Multi-dépôt | ○ | ○ | ● + emplacements | ○ |
| Inventaire physique | ◐ quantité absolue | ○ | ◐ mise à jour en masse | ○ |
| Quantités décimales | ● | **○** colonne entière | ● | ● |
| Commandes fournisseurs | ● | ● + portail fournisseur | ● | ○ |
| Réception partielle | ◐ statut prévu, pas de reprise | ○ tout ou rien | ● | ○ |
| **Factures fournisseurs + dette** | ● avec règlements | **○** la dépense est un fait de caisse binaire | **○** délégué à QuickBooks | ◐ archivage seul |
| **Production / nomenclatures** | ● BOM, ordres, mouvements | ○ | ○ kits simples | ○ |
| Tarifs par client | ● grilles par client | **○** | ● niveaux + règles | ○ |
| Catégories produits | ◐ via `type` | **○** | ● | ◐ |
| Unités de mesure | ● paramétrables | **○** | ● | ◐ |
| Relances impayés | ● cron J+7/14/21 | ● 3 niveaux + pénalités | ◐ | ◐ auto en payant |
| Fiches client / fournisseur | ● encours, dette, historiques | ● | ● | ◐ |
| Portail client | ○ | ● très complet | ● B2B Store | ○ |
| Numérotation paramétrable | ● 8 formats, compteurs dédiés | ● | ◐ | ◐ |
| Modèles PDF personnalisables | ◐ identité, RIB, couleur, pied de page | ● le meilleur de sa catégorie | ● | ◐ |
| Export CSV / Excel | ● 15 jeux, 2 dialectes | ● | ● | ● |
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

## 4. Où nous étions derrière — et ce qu'il en reste

Les six écarts identifiés le matin du 2026-08-08 ont été traités le jour même.
Ce qui suit est l'état à la fin de cette journée.

**Traité — 1. Tarifs par client.** Grilles tarifaires affectées à la fiche
client, prix proposé et non imposé, repli sur le tarif de base pour les articles
absents d'une grille. Reste sous la barre d'Erplain, qui ajoute des règles
conditionnelles par période, catégorie et lieu — mais l'écart qui coûtait des
ventes en B2B est comblé.

**Traité — 2. Réservé / disponible / entrant.** Quatre nombres, calculés depuis
les lots et les documents plutôt que stockés dans une colonne. L'alerte de stock
bas se juge désormais sur le disponible.

**Traité — 3. Export CSV.** Quinze jeux de données, deux dialectes (Excel
francophone et CSV standard), filtres de l'écran repris dans le fichier.

**Traité — 4. Pages détail.** Facture, devis, BL, commande, réception, facture
fournisseur, client et fournisseur, reliés par des liens dans les deux sens.

**Partiellement traité — 5. Modèles PDF.** L'identité de l'émetteur (NIF, RC, AI,
NIS, RIB), le pied de page et la couleur sont paramétrables ; le gabarit est
unique et testable. Restent hors périmètre le logo positionnable, le choix des
colonnes et un gabarit par type de document — Ninja garde l'avantage ici, avec
onze modèles et un moteur de templates.

**Reporté — 6. Portail client.** Ninja et Erplain en ont un. **Arbitré le
2026-08-08 : reporté à la fin.** Chantier lourd, valeur incertaine pour une PME
algérienne. L'écart reste connu et assumé.

**Écarts restants, par ordre d'importance :** le portail client, la réception
partielle, le multi-dépôt, et l'inventaire physique par saisie de masse. Aucun
n'a été réclamé par un utilisateur.

---

## 5. Notre faiblesse la plus coûteuse n'était pas fonctionnelle

> **Résolu le 2026-08-08.** Les onze capacités listées ci-dessous ont reçu leur
> écran, les deux pages hors menu y sont entrées, et les formats de numérotation
> gouvernent réellement les huit compteurs. Le constat est conservé parce qu'il
> décrit le mode de défaillance le plus coûteux du produit — livrer ce que
> personne ne peut atteindre — et qu'il resservira.

**Une trentaine d'endpoints n'avaient aucun écran.** Nous avions développé, testé
et déployé des capacités que personne ne pouvait atteindre :

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

**Les trois chantiers identifiés le matin ont été faits le jour même** — rendre
atteignable l'existant, les tarifs par client, l'export et les pages détail — et
avec eux les modèles PDF, la numérotation et la décomposition du stock.

**Ce que cela change au positionnement.** Nous ne sommes plus « en avance sur
quelques points, en retard sur six autres » : sur la case facturation + stock,
il ne reste face à Erplain que le multi-dépôt, la réception partielle et le
portail — trois sujets de structure, pas d'usage quotidien. Et nous conservons
les quatre avantages qui ne se rattrapent pas en un trimestre : le cycle achat
jusqu'à la dette fournisseur, le BL comme vrai document, le stock par lots FIFO
et la production.

**Deux décisions prises le 2026-08-08 :**

- **Le portail client est reporté à la fin.** Chantier lourd, valeur incertaine
  pour une PME algérienne.
- **L'application mobile attend la stabilisation du logiciel**, pour être bâtie
  sur des briques qui ne bougent plus. Cette seule semaine a modifié la
  numérotation, les gabarits PDF, le calcul du stock et la forme des réponses de
  sept endpoints : un client mobile écrit avant aurait été à réécrire deux fois.

**Le point à trancher reste entier, et il n'est pas fonctionnel** : notre
tarification est plus chère que l'ancrage local, et notre modèle SaaS heurte un
argument de souveraineté activement porté par les concurrents. Maintenant que
l'écart fonctionnel est refermé, **c'est le premier obstacle commercial, et le
seul qui reste vraiment.**

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
