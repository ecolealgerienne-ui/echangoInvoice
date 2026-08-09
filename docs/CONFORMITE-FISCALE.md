# CONFORMITÉ FISCALE ALGÉRIENNE — état des lieux et écarts

> Étude du 2026-08-08. Complète `docs/BENCHMARK.md`, qui avait écarté ce volet
> sur arbitrage tout en signalant que c'est **l'argument de vente numéro un de
> presque tous les acteurs algériens observés**.
>
> Sources primaires privilégiées : ministère du Commerce, DGI, Journal officiel.
> Les guides d'éditeurs ne sont retenus que lorsqu'ils recoupent une source
> officielle — l'un d'eux a été pris en défaut, voir « Ce qui n'a pas pu être
> vérifié ».

---

## 1. Le socle : décret exécutif 05-468

La facture algérienne est régie par le **décret exécutif n° 05-468 du 10
décembre 2005**, qui fixe « les conditions et les modalités d'établissement de
la facture, du bon de livraison, du bon de transfert et de la facture
récapitulative ». Deux textes le complètent : le **décret 16-66 du 22 février
2016** (modèle de document tenant lieu de facture) et le **décret 20-389 du 27
décembre 2020** (constatation des infractions).

C'est un point de méthode important : **le texte de référence n'est pas fiscal,
il est commercial.** Il relève du ministère du Commerce, et ses sanctions sont
celles de la loi 04-02 sur les pratiques commerciales — distinctes des sanctions
fiscales de la DGI. Une facture peut donc être attaquée deux fois pour le même
défaut.

### Mentions obligatoires

| | Nous |
|---|---|
| **Vendeur** — raison sociale, forme juridique | ● |
| Adresse, téléphone, e-mail | ● |
| **NIF, NIS, RC, AI** | ● *(livré le 2026-08-08 ; les PDF sélectionnaient `NULL`)* |
| **Acheteur** — raison sociale, adresse | ● |
| **NIF de l'acheteur** | ● |
| RC / NIS de l'acheteur | ● |
| Numéro unique et séquentiel | ● |
| Date d'émission | ● |
| Désignation, quantité, unité | ● |
| Prix unitaire HT, total HT | ● |
| Taux et montant de TVA | ● |
| Total TTC en chiffres | ● |
| **Total TTC en toutes lettres** | **○** |
| Conditions et mode de paiement | ◐ échéance seulement |
| **Cachet et signature du vendeur** | **○** |
| **Mention « facture annulée » en diagonale** | **○** |

Le **NIF de l'acheteur** mérite d'être souligné : depuis la loi de finances
2022, une facture entre assujettis qui ne le porte pas fait **perdre au client
son droit à déduction de TVA**. Ce n'est pas notre amende, c'est celle de notre
client — et c'est ce qui fait qu'un acheteur refuse une facture.

### Numérotation

« Chronologique, unique et continue pour chaque exercice », sans saut ni
réutilisation.

Notre implémentation du 2026-08-08 tient cette règle : un compteur dédié par
locataire, type de document et exercice, incrémenté dans la transaction qui crée
le document — donc pas de trou en cas d'échec. **Un défaut a été trouvé en
écrivant cette étude et corrigé le jour même** : un format sans marqueur d'année
(« FAC-#### ») repartait à 1 au 1er janvier et heurtait un numéro déjà émis. La
séquence est désormais perpétuelle quand le format ne porte pas l'année.

Au-delà de 999, `###` s'élargit à quatre chiffres au lieu de tronquer :
tronquer recréerait des doublons, ce que la règle interdit.

### Conservation

**10 ans** minimum. Nous archivons chaque PDF émis sous
`ARCHIVES/AAAA/MM/TYPE/`. Le stockage est local au serveur : **la durée de
rétention n'est ni garantie ni documentée contractuellement**. C'est un écart à
traiter côté exploitation, pas côté code.

---

## 2. Le droit de timbre — notre écart le plus concret

**Rien n'existe chez nous.** Aucune colonne, aucun calcul, aucune ligne sur le
PDF. C'est le seul écart de cette étude qui empêche d'émettre une facture
correcte dans un cas d'usage courant : **la vente au comptant**.

La règle (article 100 du code du timbre) : toute facture **réglée en espèces**
donne lieu à un droit de timbre, barème par tranche de 100 DA :

| Montant TTC | Taux |
|---|---|
| ≤ 300 DA | exonéré |
| 301 – 30 000 DA | 1 DA par tranche de 100 (≈ 1 %) |
| 30 001 – 100 000 DA | 1,50 DA par tranche (≈ 1,5 %) |
| > 100 000 DA | 2 DA par tranche (≈ 2 %) |

Minimum **5 DA**. Le montant doit **figurer distinctement** sur la facture,
avec la mention « Timbre perçu au profit du trésor », et il est reversé via le
**G50** avant le 20 du mois.

**L'exonération pour paiement électronique** (virement, CCP, TPE), introduite
par l'article 47 de la loi de finances 2025, est ce qui rend la fonction
indispensable plutôt que décorative : le montant à payer **dépend du mode de
règlement**. Notre modèle enregistre déjà le mode sur l'encaissement
(`paymentMethod`), mais pas sur la facture au moment de l'émission — c'est là
que se situe le travail.

Ordre de grandeur : sur une facture de 150 000 DA réglée en espèces, le timbre
est d'environ 3 000 DA. Ce n'est pas un détail d'affichage.

---

## 3. TVA et déclaration G50

Taux en vigueur : **19 %** (normal), **9 %** (réduit — étendu en 2026 au
logement, à la santé, à la formation professionnelle et au transport de
voyageurs par autobus), **0 %** (exonérations).

Nos taux sont paramétrables et multiples par ligne : conforme.

**Le G50** se dépose dans les vingt premiers jours du mois, désormais par
télédéclaration sur **Jibaya'tic** — obligatoire pour les entreprises depuis
2022, et dont l'adresse a changé le 26 avril 2026 pour `jibayatic.mf.gov.dz`.

Notre rapport « Résumé TVA » calcule la **TVA collectée** par taux et par mois.
Il ne calcule **pas la TVA déductible** sur les achats, alors que nous avons
les factures fournisseurs et leurs lignes taxées. Un G50 se solde par
`collectée − déductible`, plus le timbre encaissé. **Nous fournissons donc la
moitié d'un G50**, ce qui oblige le comptable à reprendre l'autre moitié à la
main — exactement le genre de demi-mesure qui fait qu'un outil est contourné.

---

## 4. Bon de livraison et facture récapitulative

Le décret 05-468 encadre aussi le BL, et c'est directement notre sujet.

La vente sur bon de livraison, régularisée ensuite par une **facture
récapitulative**, n'est autorisée que pour des **ventes répétitives et
régulières** — le ministère du Commerce évoque un seuil de **trois transactions
par semaine au même client** — et **sur autorisation préalable**.

Nous avons le BL comme vrai document, avec sa série, ses statuts, sa signature
et sa conversion en facture. Nous n'avons **pas la facture récapitulative** :
regrouper plusieurs BL d'une période en une seule facture. Nous convertissons
un BL en une facture, un pour un.

C'est un écart fonctionnel modeste en effort et **directement réglementaire** :
le client qui livre trois fois par semaine au même acheteur est précisément la
cible du produit — un négociant en froid, par exemple.

---

## 5. Sanctions — ce que coûte une facture non conforme

Deux régimes distincts se cumulent.

**Loi 04-02 sur les pratiques commerciales**, appliquée par le ministère du
Commerce :

| Infraction | Sanction |
|---|---|
| Défaut de facturation (art. 33) | **amende égale à 80 %** du montant qui aurait dû être facturé, quel que soit son montant |
| Facture non conforme (art. 34) | **10 000 à 50 000 DA** |

**Régime fiscal**, appliqué par la DGI : rejet de la déduction de TVA côté
client, redressement, et qualification de dissimulation de recettes dans les
cas graves.

L'amende de 80 % sur le défaut de facturation explique à elle seule pourquoi
« émettre une facture conforme » n'est pas une préférence de confort sur ce
marché.

---

## 6. Facturation électronique — ce qu'on peut affirmer, et ce qu'on ne peut pas

**Ce qui est vérifié :**

- Le décret 05-468 **prévoit** la transmission télématique des factures, dont
  les modalités doivent être fixées par arrêté interministériel (commerce,
  finances, télécommunications).
- Le recueil réglementaire du **ministère du Commerce ne liste aucun texte** sur
  la facture électronique.
- La télédéclaration, elle, est bien obligatoire (Jibaya'tic) — mais c'est la
  **déclaration** qui est dématérialisée, pas la facture.
- La loi de finances 2026 poursuit la dématérialisation (paiement électronique
  du timbre, extension des télédéclarations), sans instaurer d'obligation de
  facture électronique.

**Ce qui n'a pas pu être vérifié.** Un éditeur affirme qu'une obligation existe
déjà, fondée sur « l'article 20 de la loi de finances 2022 » et un « décret
exécutif n° 22-402 ». **Aucune de ces deux références n'a pu être retrouvée au
Journal officiel algérien** ; la recherche sur « décret exécutif 22-402 » ne
remonte qu'un décret **tunisien** de 2022 portant le même numéro. Plusieurs
articles trouvés en recherche décrivent en réalité le calendrier **marocain**
(grandes entreprises au 1er janvier 2026, moyennes au 1er juillet 2026) ou
**français** (septembre 2026), attribués à l'Algérie par confusion.

**Conclusion prudente : à ce jour, aucune obligation générale de facturation
électronique n'est établie en Algérie.** C'est une échéance à surveiller, pas
une contrainte présente. Nous ne devons ni la vendre comme telle, ni bâtir
dessus.

---

## 7. Écarts, par ordre de valeur

**1. Le droit de timbre.** Le seul écart qui empêche d'émettre une facture
correcte au comptant. Calcul par tranches, exonération si le règlement est
électronique, ligne dédiée sur le PDF, et report au G50. Suppose de connaître le
mode de règlement à l'émission — donc un champ sur la facture, pas seulement sur
l'encaissement.

**2. Le total TTC en toutes lettres.** Mention obligatoire, absente. Effort
faible — une fonction de conversion en français —, sanction possible de 10 000 à
50 000 DA. Meilleur rapport valeur/effort de la liste.

**3. La TVA déductible et le G50 complet.** Nous avons les données ; il manque
la moitié du calcul et la mise en forme. Ce qui transforme un « rapport TVA » en
« aide à la déclaration ».

**4. Le cachet et la signature.** Le décret les exige, sauf transmission
télématique. Un emplacement de cachet sur le PDF, alimenté par une image dans
les Paramètres.

**5. La facture récapitulative.** Regrouper les BL d'une période en une facture.
Réglementaire, et aligné sur le profil de client visé.

**6. La mention « facture annulée ».** Une facture annulée doit porter la
mention en diagonale. Nous conservons le statut mais le PDF ne le montre pas.

**7. La conservation dix ans.** Question d'exploitation : politique de
rétention, sauvegardes, restitution en fin de contrat. À traiter avant le
premier client sérieux, pas dans le code.

---

## 8. Ce que j'en retiens

**Nous sommes plus près de la conformité que le benchmark ne le laissait
craindre**, et la journée du 2026-08-08 y est pour beaucoup : sans les
identifiants légaux de l'émetteur, livrés le matin même, aucune facture émise
n'était recevable. C'était le défaut le plus grave, et il était silencieux.

**Il reste un trou net : le timbre.** Tant qu'il n'est pas traité, l'outil ne
sait pas produire une facture correcte pour une vente au comptant — soit une
part importante du commerce de détail et de gros algérien.

**Le reste est du travail de finition** — toutes lettres, cachet, mention
d'annulation — dont le coût cumulé est faible et la valeur commerciale
disproportionnée : c'est exactement le vocabulaire qu'emploient les concurrents
locaux pour se vendre.

**Et l'argument à ne pas surjouer : la facture électronique.** Elle n'est pas
obligatoire aujourd'hui. Annoncer une conformité e-facture serait à la fois faux
et fragile, alors que les mentions du décret 05-468, le timbre et le G50 sont
vérifiables, exigibles maintenant, et suffisent à soutenir la comparaison.

---

## Sources

- [Ministère du Commerce — La facture (FAQ)](https://www.commerce.gov.dz/fr/questions-frequentes/themes/facture)
- [Ministère du Commerce — Recueil réglementaire : conditions et modalités d'établissement de la facture](https://www.commerce.gov.dz/fr/reglementation/recueil/conditions-et-modalites-d-etablissement-de-la-facture)
- [DGI — Communiqué général des dispositions fiscales de la loi de finances 2026](https://www.mfdgi.gov.dz/fr/a-propos/actu-fr/communique-general-des-dispositions-fiscales-de-la-loi-de-finances-2026)
- [Algeria Invest — Fiscalité 2026 : la DGI détaille les principaux changements](https://www.algeriainvest.com/fr/premium-news/fiscalite-en-2026-la-dgi-detaille-les-principaux-changements)
- [Legal Doctrine — Conditions et modalités d'établissement d'une facture en Algérie](https://legal-doctrine.com/en/edition/quelles-sont-les-conditions-et-modalites-detablissement-dune-facture-en-algerie)
- [L'entrepreneur algérien — Le droit de timbre (timbre de quittances)](https://lentrepreneuralgerien.com/impots/item/128-le-droit-de-timbre-timbre-de-quittances-en-algerie)
- [Costy — Calculer les frais de timbre en Algérie en 2026](https://costy.app/comment-calculer-les-frais-de-timbre-en-algerie-en-2026/)
- [Lamacta — Guide de facturation légale en Algérie 2026](https://lamacta.com/blog/guide-facturation-legale-algerie-2026/)
- [Almawarid — Facture conforme et décret 05-468](https://almawarid.app/blog/facture-conforme-algerie-decret-05-468-guide-complet/)
- [Merbouhi — Mentions obligatoires facture Algérie, guide DGI 2026](https://merbouhi.com/blog/mentions-obligatoires-facture-algerie.html)
- [Loi 04-02 sur les pratiques commerciales (recueil de textes)](https://drcoran.dz/images/documents/concurrence/receuildestextes04-02.pdf)
- [Almawarid — Jibaya'tic, télédéclaration 2026](https://almawarid.app/blog/jibayatic-teledeclaration-algerie-2026-guide-complet/)
- [Qompta — Télédéclaration G50 sur Jibaya'tic](https://qompta.com/guides/teledeclaration-g50-jibayatic)
