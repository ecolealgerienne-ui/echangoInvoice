# Méthode de test — echangoInvoice

> Adaptée de `echangopromo/docs/METHODE_TEST.md`. La doctrine est la même ; les
> étages, les exemples et les squelettes sont ceux de **cette** pile — NestJS +
> React + Playwright, pas Flutter. Les modes M12 et M13 sont propres à ce dépôt.

---

## Ce que ce document est, et ce qu'il n'est pas

**C'est** un recueil de modes de défaillance : les façons dont un test peut être
au vert sans rien prouver. Chaque mode vient d'un défaut réellement mesuré, ici
ou sur `echangopromo`.

**Ce n'en est pas** une liste de tests à écrire. Il ne dit pas *quoi* couvrir —
`docs/ERREURS.md` s'en charge, et bien mieux : chacune de ses dix-sept entrées
décrit un défaut qui a traversé tous les contrôles en place à ce moment-là.

---

## Lexique

| Terme | Sens précis |
|---|---|
| **Banc** | Un scénario métier complet joué en HTTP contre le serveur réel et sa base réelle. Ni test unitaire, ni test d'intégration au sens framework : un enchaînement d'appels qui reproduit une situation qu'un utilisateur peut produire. |
| **Décor** | L'état posé **avant** un test et qu'il ne peut pas poser lui-même. Il ne vérifie rien. Le séparer est une règle — voir M8. |
| **Témoin** | Le cas symétrique qui doit **réussir** quand le cas testé doit échouer. Sans témoin, un banc qui refuse tout passe au vert. |
| **Mutation** | Un fichier réel volontairement cassé, sur lequel on fait tourner un contrôle pour vérifier qu'il **refuse**. |
| **Auto-test** | La batterie interne d'un vérificateur, avec autant de cas qui doivent échouer que de cas qui doivent passer. Bloquante. |
| **Frontière** | La surface HTTP exposée : routes, exigence d'authentification, de rôle, et d'appartenance au locataire. |
| **Persona** | Un rôle applicatif avec son parcours et sa projection : `owner`, `manager`, `agent`, `accountant`, `superadmin`. |

---

## Le principe fondateur

> **Une donnée mal câblée ne casse presque jamais — elle disparaît.**

Pas d'exception, pas de pile d'appels, rien dans les journaux. Le serveur répond
**200** avec une liste vide, un champ absent, un montant à zéro.

Ce dépôt en donne la démonstration la plus nette : **E010**. Le QR de
vérification était généré, transmis au gabarit, déclaré dans son interface — et
jamais dessiné. La compilation passait (le champ est optionnel), le PDF sortait,
valide, simplement amputé. Le client l'a signalé, pas nos contrôles.

Corollaire, qui gouverne tout le reste — c'est **R030** du `CLAUDE.md` :

> **Un contrôle au vert n'a montré qu'une chose : sa capacité à dire oui.**

---

## Les quatre étages

| Étage | Outil, ici | Ce qu'il voit | Ce qu'il ne peut pas voir |
|---|---|---|---|
| **1. Vérificateurs statiques** | les 14 `scripts/verifier-*.js` | désynchronisations silencieuses : clés i18n, jetons de thème, colonnes de tri, formes de code interdites | tout ce qui dépend de l'exécution |
| **2. Tests unitaires** | **inexistants dans ce dépôt** | la logique pure : `montant-en-lettres`, `droit-de-timbre`, `echeance`, `codes-barres` — tous testés aujourd'hui par un vérificateur maison | tout ce qui dépend de la base |
| **3. Bancs HTTP** | **à écrire** — c'est le chantier | règles métier de bout en bout, refus d'accès, cloisonnement des locataires, courses de concurrence | l'interface : un écran peut être muet sans qu'un banc rougisse |
| **4. Parcours écran** | `e2e/` — **24 fichiers Playwright existants** | ce qu'un utilisateur voit et peut faire | les cas de bord inatteignables à l'écran, la concurrence |

**Le piège classique** est de croire que l'étage 3 couvre l'étage 4. Il ne le
couvre pas : E010 était invisible à tout banc HTTP — le PDF sortait avec un
code 200.

**Le piège inverse** est de croire que l'étage 4 couvre l'étage 3. Un parcours
Playwright ne peut faire que ce qu'un utilisateur peut faire : il ne peut pas
appeler une route avec le jeton d'un autre locataire.

**L'étage 2 est vide, et c'est un choix à réexaminer.** Les fonctions pures du
projet sont éprouvées par des vérificateurs maison (`verifier-conformite`,
`verifier-echeances`…) qui font office de tests unitaires sans en avoir le
harnais. Ça marche ; ça ne se documente nulle part comme tel.

---

## Les modes de défaillance

### M1 — Le contrôle qui n'a jamais dit non

**Symptôme.** Un vérificateur est au vert depuis sa création. Personne ne l'a
jamais vu refuser.

**Pourquoi ça échappe.** Un contrôle qui ne regarde pas la bonne chose est au
vert exactement comme un contrôle qui regarde la bonne chose.

**Trois occurrences dans ce dépôt, et elles sont instructives :**

- **E009** — `verify:tri` cherchait `resoudreTri|appliquerTri` *n'importe où*
  dans le fichier : **la ligne d'import suffisait à le satisfaire**. Deux
  services avaient perdu leur appel de tri, donc tout `ORDER BY` — le contrôle
  restait vert. Renforcé, il a d'abord échoué sur du code correct : la regex
  contenait un **octet backspace** (0x08) au lieu des deux caractères `\b`,
  invisible à la relecture, trouvé par `od -c`.
- **E013** — `verifier-contraste.js` ne savait lire que `rgb()`, or Chrome
  conserve `oklch()` dans le style calculé. La lecture rendait `null`, la boucle
  passait au suivant. « Aucun texte sous 3:1 » voulait dire « aucun texte
  mesuré ». Il a été présenté **deux fois** comme preuve.
- **E017** — `verify:production` cherchait le motif `stockQuantity − n`.
  Rejouer l'ancien geste avec un `+` le laissait vert sur du code fautif.

**Remède.** Voir le contrôle **refuser**, sur une mutation du vrai fichier. Et
quand la règle est absolue, l'assertion doit l'être : « le service de production
ne nomme jamais `stockQuantity` », pas « ne contient pas ce motif-ci ».

---

### M2 — Le test qui recopie ce qu'il vérifie

**Symptôme.** Un test contient sa propre version de la règle qu'il éprouve.

**Pourquoi ça échappe.** Les deux sont d'accord au moment de l'écriture, puis
divergent en silence.

**Remède.** Un test **importe** ce que le code exécute. `verifier-pdf-achats.js`
le fait bien : il démarre le conteneur Nest, remplace le rendu Chrome par une
capture, et lit le HTML que **le vrai service** a composé. Il aurait été bien
plus facile — et parfaitement inutile — de recopier le mapping.

**Corollaire.** Une vérification qui partage un composant avec ce qu'elle
vérifie ne dit rien de ce composant.

---

### M3 — Le repli qui rassure

**Symptôme.** `|| 0`, `?? []`, `catch { return [] }`, un identifiant technique
affiché faute de mieux.

**Pourquoi ça échappe.** Le repli **détruit l'information d'absence**, et
l'absence est presque toujours l'information qui compte. Une liste vidée par une
erreur réseau s'affiche « aucun résultat » — une affirmation fausse présentée
avec l'aplomb d'un fait.

**Ici :** `resolveApiError` tente `t(clé)` puis `t('errors.' + clé)` avant de
retomber sur `errors.generic`. Une clé absente n'échoue nulle part ; elle affiche
un message générique. La désynchronisation est silencieuse des deux côtés — le
`CLAUDE.md` le dit lui-même sous R006.

**⚠️ Le pire endroit pour un repli est un test.** Un décor qui annonce
« compte créé » sans l'avoir obtenu fait échouer trois étapes plus loin, en
accusant la mauvaise.

---

### M4 — La capacité servie et jamais appelée

**Symptôme.** Une route existe, est testée, documentée — et aucun écran ne
l'appelle. Ou un champ servi et jamais lu.

**Pourquoi ça échappe.** Ça ne produit **aucune erreur**. Ça produit une
fonctionnalité absente que personne ne cherche, puisque le code existe.

**Ici, trois fois :**

- **E010** — champ déclaré, transmis, jamais rendu.
- **E016** — `unpaidInvoicesCount` additionnait `sent` + `partial` alors que le
  filtre serveur n'accepte qu'un statut. Le compteur affichait 276 ; **aucune
  liste ne pouvait valoir 276**. Tant qu'il n'était cliquable nulle part, rien
  ne l'obligeait à correspondre à quoi que ce soit.
- Le champ `version` de la nomenclature : existait, valait 1, ne servait à rien
  (E017).

**Remède.** C'est **R022** : une route neuve n'est pas finie tant qu'un écran ne
l'appelle pas ; ce qui n'a plus d'appelant se supprime. Et rendre un chiffre
cliquable est le meilleur moyen de l'obliger à être juste.

---

### M5 — Les deux copies d'accord entre elles

**Symptôme.** Un commentaire dit « doit rester identique à X ».

**Le critère** — c'est **R029** : la question n'est pas « ces deux bouts se
ressemblent-ils » mais **« si l'un change, l'autre doit-il changer ? »** Oui ⇒
un seul endroit. Non ⇒ deux endroits et un commentaire qui dit pourquoi. Fusion
trop coûteuse ⇒ **un contrôle exécuté**, jamais une phrase.

**Cas vivants ici :** clés d'erreur serveur ↔ `shared/src/i18n/{fr,ar}.json`
(tenu par `verify:i18n`) ; jetons de thème clair ↔ sombre (tenu par
`verify:design`) ; bornes `@Max` des DTO ↔ contraintes de colonne ; l'accent PDF
par défaut `#1e3a5f` écrit **deux fois** — `document-template.ts` côté serveur et
`SettingsPage.tsx` côté client — et rien ne les tient.

---

### M6 — Le test lié à la langue

**Symptôme.** Un test d'écran cherche un élément par son **libellé**.

**Pourquoi ça échappe.** Il passe sur la machine de son auteur et échoue dès que
l'interface change de langue — **pour une raison sans rapport avec le défaut**.

**⚠️ C'est un risque immédiat sur ce dépôt.** L'application est passée en
bilingue français/arabe complet (1077 clés), et les 24 fichiers Playwright
existants désignent presque tout par le texte :

```ts
await page.getByRole('button', { name: /nouvelle facture/i }).click();
```

En arabe, ce test échoue en annonçant que le bouton n'existe pas.

**Remède.** Désigner par ce que les éléments **sont**, pas par ce qu'ils
**disent** : `data-testid`, rôle + position, une donnée que le décor a posée
(un numéro de facture, un nom propre). L'exception — quand la distinction testée
**est** une différence de texte — se traite en calculant les deux attendus par le
traducteur de l'application.

---

### M7 — Ce qui n'est pas rendu n'existe pas

**Symptôme.** Un test ne trouve pas une ligne dont on sait que le serveur la
sert.

**Ici, ce n'est pas la virtualisation mais la pagination** : les listes rendent
20 lignes. Une facture créée par le test peut se trouver page 3. Le test conclut
que la création a échoué, et le diagnostic part dans la mauvaise direction.

**Remède.** Attendre **la liste**, jamais la ligne cherchée — qu'une ligne
quelconque soit rendue prouve que le chargement a abouti. Puis filtrer par la
recherche plutôt que défiler : elle interroge le serveur, la pagination
disparaît du problème.

---

### M8 — Le décor mêlé au test

**Symptôme.** Un test crée ses propres données, ou dépend de ce que le
précédent a laissé.

**Pourquoi ça échappe.** Deux tests qui se passent un état **échouent
ensemble**, et le second accuse le premier.

**Déjà rencontré ici** — le `CLAUDE.md` le consigne sous R030 : *« un test e2e
(`07-purchases`) passait ou échouait selon les données créées par les tests
précédents »*.

**Remède.** Un script de décor séparé, qui ne vérifie rien, **idempotent**, à
identifiants **stables** — jamais aléatoires, parce que `/auth/login` est
rate-limité et qu'un décor à identifiants aléatoires devient inutilisable au
second passage. Il imprime la commande de test avec ses paramètres.

---

### M9 — Le plafond pris pour un bug métier

**Symptôme.** Une suite qui passait échoue, et le message parle de mot de passe
ou de compte introuvable.

**Pourquoi ça échappe.** Le rate-limiting sort déguisé. Un plafond atteint peut
se présenter comme « identifiants incorrects » — ce qui envoie chercher un bug
d'authentification pour un problème qui se résout en attendant.

**Ici :** `@Throttle` est posé sur `/auth/login`, `/auth/refresh` et leurs
équivalents admin (R017, R023).

**Remède.** Temporiser **par défaut**, détecter `429` / `ThrottlerException` dans
le journal et l'annoter « throttle — rejouer plus tard » au lieu de le compter
comme un échec métier. Documenter le budget consommé par la suite.

---

### M10 — Le pipe qui masque le code de sortie

**Symptôme.** Une commande affiche toujours « code 0 ».

`commande | tail -20 && echo "code $?"` relève le code de `tail`.

**Rencontré ici, et pas qu'une fois.** Le `CLAUDE.md` l'interdit sous R025 :
*« ne jamais filtrer la sortie d'un `run` sur les seules lignes de succès »*.

**Le cousin, spécifique à ce dépôt et coûteux :** `npx tsc --noEmit` depuis
`client/` **ne vérifie aucun fichier** — le `tsconfig.json` y porte
`"files": []` et ne fait que référencer `tsconfig.app.json`. Tout « tsc : 0 »
obtenu ainsi est vide de sens. La commande réelle est
`npx tsc --noEmit -p tsconfig.app.json`.

---

### M11 — La cible prise dans la donnée examinée

**Symptôme.** Un banc énumère ses cibles depuis la même source que celle qu'il
contrôle.

**Le cas d'école :** un banc de refus qui énumérerait les routes protégées
**depuis leurs décorateurs de garde**. Ouvrir une route la ferait quitter
l'ensemble testé — le total tomberait, **rien ne passerait au rouge**.

**Ici, c'est structurant** : il n'existe **aucun garde global**, chaque
contrôleur pose son `@UseGuards`. C'est écrit noir sur blanc dans R023 :
*« la route qu'on oublie est OUVERTE »*, et les routes publiques y sont épinglées
nommément avec leur justification.

**Remède.** Énumérer **toutes** les routes, et épingler les publiques une par
une. Un total sans sa décomposition ne se vérifie pas.

---

### M12 — La formule juste sur la mauvaise grandeur

> Propre à ce dépôt. C'est **E015**, et c'est le défaut le plus coûteux qu'on y
> ait trouvé.

**Symptôme.** Aucun. Le code est propre, la requête est correcte, les tests
passent. **C'est la définition qui est fausse.**

Le tableau de bord annonçait **96,83 % de marge brute** pour un grossiste en
surgelés. La formule :

```ts
grossMargin = totalRevenue - totalPurchaseCost;   // achats REÇUS sur la période
```

Ce n'est pas une marge, c'est une trésorerie d'approvisionnement. Un mois de
ventes sur stock affichait près de 100 % ; un mois de gros réassort aurait
affiché une marge négative. Le résultat net, qui en dérivait, était surestimé
d'un facteur cinq.

**Pourquoi ça échappe à tout.** Il n'y a pas de faute de syntaxe dans une
soustraction qui soustrait la mauvaise chose. Aucun contrôle de forme ne peut le
voir. **Trois revues de design sont passées sur cet écran** sans le remarquer :
on regardait comment le chiffre était présenté.

**Qui l'a trouvé.** Une relecture extérieure, à l'œil, sur l'ordre de grandeur :
« 96,83 % de marge brute pour de l'alimentaire, c'est extrêmement inhabituel ».

**Remède.** Un banc qui vérifie la **propriété comptable**, pas la forme du
code : `marge = CA − coût des marchandises vendues`, `résultat = marge −
charges`, plus des **bornes de plausibilité** larges. Ce sont les bornes qui
attrapent une définition fausse — pas l'égalité, qu'une formule fausse satisfait
avec elle-même. Voir `scripts/verifier-comptabilite.js`.

> Pour tout agrégat affiché, se demander : **quelle valeur serait absurde ?**
> Puis l'écrire.

---

### M13 — Le même geste écrit ailleurs

> Propre à ce dépôt. C'est **E017**.

**Symptôme.** Un défaut est corrigé à l'endroit où on l'a vu. Le même geste
existe ailleurs, non corrigé.

Le stock est tenu par lots. Les ventes le respectaient depuis le 2026-08-08,
après un défaut mesuré : un `UPDATE finished_products SET stockQuantity` qui ne
touchait pas aux lots, et que `recomputeProductStock()` écrasait au mouvement
suivant — **les quantités livrées ressuscitaient**. La correction a été faite,
documentée, commentée dans le code avec les chiffres exacts.

**Elle n'a pas été portée à la production.** Le même `UPDATE`, le même effet,
découvert trois mois plus tard.

**Pourquoi ça échappe.** Chaque module est cohérent avec lui-même. Le défaut
n'apparaît qu'à l'intersection, et seulement après un enchaînement de trois
opérations.

**Remède.** Après chaque correction, la question n'est pas « est-ce réparé ? »
mais **« où ailleurs ce même geste est-il écrit ? »** — et la réponse s'obtient
par un `grep`, pas par la mémoire. Quand le geste est interdit, un vérificateur
statique (étage 1) l'interdit **partout**, pas seulement là où il a mordu.

---

## L'ordre d'adoption

Classé par rapport valeur / coût de mise en route. Chaque étape a un critère de
sortie.

### Étape 1 — Le banc de refus de la frontière (étage 3)

**Pourquoi en premier.** Il est automatique : il énumère les routes depuis la
source et n'a presque rien à écrire par route.

Chaque route protégée est appelée **sans jeton**, avec le jeton d'un **autre
rôle**, et avec un jeton **expiré**. Les trois doivent être refusées, avec le
bon statut **et** la bonne clé — un refus sans clé est un refus que l'interface
ne sait pas traduire (R006).

**Critère de sortie.** Le banc énumère toutes les routes, les publiques sont
épinglées avec leur raison, et le total est décomposé.

**Squelette.** `docs/methode-test/banc-refus-http.py`

### Étape 2 — Le banc de cloisonnement (étage 3)

**C'est le plus important de ce produit.** Le jeton est valide, mais la ressource
nommée appartient à un **autre locataire**. Le pire cas attendu est
« introuvable », jamais « la ressource d'autrui ».

> **Authentifier n'est pas autoriser.** Le garde prouve *qui* vous êtes ; il ne
> prouve pas que la ressource que vous nommez est à vous. Cette seconde
> vérification vit dans chaque service — des dizaines d'endroits, chacun
> reposant sur le fait que son auteur y a pensé (R020).

**Squelette.** `docs/methode-test/banc-cloisonnement.py`

### Étape 3 — Le décor (préalable à tout le reste)

Idempotent, identifiants stables, ne vérifie rien, imprime la commande de test.

**Squelette.** `docs/methode-test/provision-decor.sh`

### Étape 4 — Les bancs métier, un par règle qui a déjà cassé

**Le critère de sélection est le seul qui compte : une règle qui a déjà produit
un défaut.** Pas « couvrons le module X ». `docs/ERREURS.md` est la liste, et
elle est déjà écrite.

Chaque banc porte en tête ce qu'il éprouve **et le défaut réel qui l'a fait
naître** — c'est cette phrase qui permet de reconnaître un cas de la même
famille.

**Squelette d'orchestrateur.** `docs/methode-test/run-all-scenarios.sh`

---

## Le registre de couverture

L'artefact le plus sous-estimé : **un document qui dit ce qui n'est pas couvert,
et pourquoi.** Sans lui, l'absence de test et la décision de ne pas tester sont
indiscernables.

```
Routes à identifiant : NN
  couvertes par banc-cloisonnement ......... NN
  exclues (l'appartenance n'y est pas la question) ... N
      /health, /auth/login, /v/:type/:id/:sig — raison épinglée
  NON couvertes ............................ N
      … — raison
```

**Deux règles.** Un total sans sa décomposition ne se vérifie pas. Ce qui est
exclu est épinglé **nommément**, avec la raison — une exclusion anonyme est
indiscernable d'un oubli.

---

## Ce que cette méthode ne couvre pas

- **La charge et la tenue en durée.** Aucun banc ne dit ce qui se passe à
  cinquante utilisateurs simultanés.
- **Le rendu visuel.** `verifier-contraste.js` mesure la lisibilité, pas la
  beauté ni la mise en page. Une carte qui déborde reste invisible aux
  contrôles.
- **Les PDF chez le destinataire.** On vérifie le HTML composé et le nombre
  d'images du PDF, pas ce que voit un comptable qui l'ouvre dans Acrobat.
- **La conformité fiscale réelle.** Le barème du droit de timbre attend
  confirmation par un comptable ; aucun test ne peut la remplacer.

---

## Résumé en une page

1. Un contrôle au vert n'a prouvé que sa capacité à dire oui. **Le voir
   refuser** (R030).
2. Une donnée mal câblée **disparaît** au lieu de casser. Comparer à un témoin,
   jamais « ça n'a pas levé ».
3. Le décor est **séparé** du test, idempotent, à identifiants stables.
4. Désigner les éléments d'écran par ce qu'ils **sont**, pas par ce qu'ils
   **disent** — l'application est bilingue.
5. Énumérer les cibles depuis une source **indépendante** de ce qu'on contrôle ;
   épingler les exceptions une par une.
6. Pour tout agrégat, se demander **quelle valeur serait absurde**, et l'écrire.
7. Après chaque correction : **où ailleurs ce même geste est-il écrit ?**
8. `docs/ERREURS.md` est la liste des bancs à écrire. Elle est déjà rédigée.
