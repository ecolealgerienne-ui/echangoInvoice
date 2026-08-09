#!/usr/bin/env python3
"""Banc de cloisonnement multi-locataire — étape 3 du chantier (étage 3).

**C'est le banc le plus important de ce produit.**

Le jeton est **valide**. Le rôle est **le plus élevé** — propriétaire. Seule la
ressource nommée appartient à quelqu'un d'autre. La réponse attendue est
« introuvable » ; jamais la ressource d'autrui.

    Authentifier n'est pas autoriser. Le garde prouve *qui* vous êtes ; il ne
    prouve pas que la ressource que vous nommez est à vous. Cette seconde
    vérification vit dans chaque service — des dizaines d'endroits, chacun
    reposant sur le fait que son auteur y a pensé (R020).

Le banc de frontière (étape 2) prouve qu'un inconnu et un mauvais rôle sont
refusés. Il ne dit rien d'ici : c'est un **owner parfaitement légitime** qui
demande, et rien dans son jeton ne le distingue de celui qui aurait le droit.

── Ce que « refusé » veut dire, et ce que ça ne veut pas dire ───────────────

Quatre issues, et elles ne se valent pas :

  404 / 403          → refusé. C'est le résultat attendu.
  2xx **avec** une trace du locataire B  → **FUITE**. Le pire cas.
  2xx sans trace de B → accepté sans rien rendre. Ce n'est pas une fuite, mais
                        ce n'est pas un refus : la route a exécuté quelque
                        chose sur un identifiant qui n'est pas au demandeur.
  400 / 422          → **non concluant**. La validation du corps a répondu
                        avant que le service n'ait cherché la ressource. La
                        sonde n'a pas atteint ce qu'elle vise, et le compter
                        comme un refus serait annoncer une couverture qu'on n'a
                        pas. Chaque cas est nommé.

La distinction fuite / accepté-sans-rendre n'est pas cosmétique : sans elle, un
2xx serait rangé avec les autres échecs et personne ne saurait si des données
sont sorties.

── L'énumération vient du banc de frontière ────────────────────────────────

`toutes_les_routes` est **importée**, pas recopiée. Deux parseurs finiraient par
diverger, et le jour où ils divergent c'est le total qui devient faux sans que
rien ne rougisse (M2, R029).

── Usage ────────────────────────────────────────────────────────────────────

    python3 scripts/banc-cloisonnement.py --self-test   # d'abord, et c'est bloquant
    python3 scripts/banc-cloisonnement.py --list        # les cibles, sans rien appeler
    python3 scripts/banc-cloisonnement.py               # le banc

Prérequis : `scripts/provision-decor.sh` a tourné. Le banc lit ses identifiants
dans `.decor/manifeste.json` et n'en connaît aucun en dur.

⚠️ **Ce banc appelle des routes de suppression et de modification avec des
identifiants du locataire B.** Si le cloisonnement tient, elles répondent 404 et
rien ne bouge. S'il ne tient pas, le banc l'aura prouvé *en abîmant le décor* —
qui est idempotent et se repose en un passage. C'est le prix d'une sonde qui
peut réellement dire non.
"""

import importlib.util
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

BASE_URL = os.environ.get("BASE_URL", "http://localhost:3000/api/v1")
SRC_DIR = os.environ.get("SRC_DIR", os.path.join(RACINE, "src"))
MANIFESTE = os.environ.get("MANIFESTE", os.path.join(RACINE, ".decor", "manifeste.json"))
PACE_SECONDS = float(os.environ.get("PACE_SECONDS", "0.15"))

_spec = importlib.util.spec_from_file_location(
    "banc_refus", os.path.join(os.path.dirname(os.path.abspath(__file__)),
                               "banc-refus-http.py"))
_frontiere = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_frontiere)
toutes_les_routes = _frontiere.toutes_les_routes

# ─────────────────────────────────────────────────────────────────────────────
# Les routes écartées, épinglées une par une AVEC leur raison
#
# ⚠️ Une exclusion anonyme est indiscernable d'un oubli. Chacune dit pourquoi
# l'appartenance ne s'y pose pas — et non pourquoi elle serait pénible à tester.
# ─────────────────────────────────────────────────────────────────────────────

EXCLUES = {
    ("GET", "/admin/tenants/:id"):
        "console d'administration — l'accès transverse EST sa fonction (R020, "
        "exception explicite). Elle est gardée par AdminGuard, que le banc de "
        "frontière éprouve sur les trois sondes",
    ("PATCH", "/admin/tenants/:id/status"): "idem — console d'administration",
    ("DELETE", "/admin/tenants/:id"): "idem — console d'administration",
    ("PATCH", "/admin/subscriptions/:id"): "idem — console d'administration",
    ("PUT", "/admin/plans/:id"):
        "les plans sont un catalogue global, sans locataire propriétaire",
    ("GET", "/verify/:type/:id/:signature"):
        "route publique (R023) : le destinataire d'un document n'a pas de "
        "compte, et son locataire n'est pas le sien. L'appartenance n'y est pas "
        "la question — la signature HMAC l'est, et le décor la contrôle dans "
        "les deux sens (juste → 200, fausse → 404)",
    ("GET", "/export/:dataset"):
        "« dataset » nomme un jeu de données, pas une ressource : aucun "
        "identifiant à substituer. La fuite qu'on y craint est d'une autre "
        "nature — elle est sondée à part, plus bas",
}

# ─────────────────────────────────────────────────────────────────────────────
# Ce que chaque paramètre désigne, dans l'ordre où il apparaît dans le chemin
#
# ⚠️ Écrit à la main, et c'est assumé : personne ne peut déduire d'un chemin que
# « :linkId » désigne un lien article-fournisseur. Mais la table est **vérifiée
# exhaustive** au démarrage : une route à paramètre qui n'y figure pas arrête le
# banc. Une cible qu'on oublie ne peut donc pas sortir du total en silence (M11).
# ─────────────────────────────────────────────────────────────────────────────

PARAMETRES = {
    "/customers/:id": ["client"],
    "/customers/:id/contacts": ["client"],
    "/customers/:id/contacts/:contactId": ["client", "clientContact"],
    "/suppliers/:id": ["fournisseur"],
    "/suppliers/:id/contacts": ["fournisseur"],
    "/suppliers/:id/contacts/:contactId": ["fournisseur", "fournisseurContact"],
    "/products/:id": ["article"],
    "/products/:id/barcodes": ["article"],
    "/products/:id/suppliers": ["article"],
    "/products/barcodes/:barcodeId": ["codeBarres"],
    "/products/suppliers/:linkId": ["lienFournisseur"],
    "/products/by-barcode/:code": ["codeBarresValeur"],
    "/price-lists/:id": ["grille"],
    "/price-lists/:id/items": ["grille"],
    "/price-lists/for-customer/:customerId": ["client"],
    "/quotes/:id": ["devis"],
    "/quotes/:id/pdf": ["devis"],
    "/quotes/:id/status": ["devis"],
    "/quotes/:id/convert": ["devis"],
    "/quotes/:id/create-bl": ["devis"],
    "/deliveries/delivery-notes/:id": ["bonLivraison"],
    "/deliveries/delivery-notes/:id/pdf": ["bonLivraison"],
    "/deliveries/delivery-notes/:id/status": ["bonLivraison"],
    "/deliveries/delivery-notes/:id/signature": ["bonLivraison"],
    "/deliveries/delivery-notes/:id/create-invoice": ["bonLivraison"],
    "/deliveries/delivery-notes/:id/send-email": ["bonLivraison"],
    "/invoices/sales-invoices/:id": ["facture"],
    "/invoices/sales-invoices/:id/pdf": ["facture"],
    "/invoices/sales-invoices/:id/status": ["facture"],
    "/invoices/sales-invoices/:id/send-email": ["facture"],
    "/invoices/payments/:id": ["reglement"],
    "/invoices/credit-notes/:id": ["avoir"],
    "/invoices/credit-notes/:id/pdf": ["avoir"],
    "/invoices/credit-notes/:id/issue": ["avoir"],
    "/invoices/credit-notes/:id/cancel": ["avoir"],
    "/invoices/recurring/:id": ["factureRecurrente"],
    "/invoices/recurring/:id/toggle": ["factureRecurrente"],
    "/invoices/recurring/:id/generate": ["factureRecurrente"],
    "/expenses/:id": ["depense"],
    "/expenses/:id/approve": ["depense"],
    "/purchases/purchase-orders/:id": ["commandeAchat"],
    "/purchases/purchase-orders/:id/pdf": ["commandeAchat"],
    "/purchases/purchase-orders/:id/status": ["commandeAchat"],
    "/purchases/reception-bls/:id": ["receptionBl"],
    "/purchases/reception-bls/:id/pdf": ["receptionBl"],
    "/purchases/vendor-bills/:id": ["factureFournisseur"],
    "/purchases/vendor-bills/:id/pdf": ["factureFournisseur"],
    "/purchases/vendor-bills/:id/status": ["factureFournisseur"],
    "/purchases/vendor-bills/:id/payments": ["factureFournisseur"],
    "/production/nomenclatures/:id": ["nomenclature"],
    "/production/orders/:id": ["ordreProduction"],
    "/production/orders/:id/movements": ["ordreProduction"],
    "/production/orders/:id/movements/batch": ["ordreProduction"],
    "/production/orders/:id/start": ["ordreProduction"],
    "/production/orders/:id/complete": ["ordreProduction"],
    "/production/orders/:id/cancel": ["ordreProduction"],
    "/stock/entries/:rawMaterialId": ["matiere"],
    "/stock/inventory/:rawMaterialId/threshold": ["matiere"],
    "/users/:id": ["@compte.agent"],
    "/users/invitations/:id": ["invitation"],
}

# ─────────────────────────────────────────────────────────────────────────────
# Les corps d'appel — pour que la sonde ATTEIGNE la vérification d'appartenance
#
# ⚠️ Un corps vide fait répondre la validation avant le service, et la sonde ne
# mesure alors que la validation. Chaque corps ci-dessous est le minimum que le
# DTO accepte : le but n'est pas de réussir l'opération, c'est d'arriver jusqu'à
# la question « cette ressource est-elle à vous ? ».
#
# Les références croisées (`supplierId`, par exemple) pointent des ressources
# du locataire **A** — celui qui demande. C'est la situation réelle : on tente
# une opération légitime chez soi, sur un objet qui ne l'est pas.
# ─────────────────────────────────────────────────────────────────────────────

CORPS = {
    ("PATCH", "/quotes/:id/status"): {"status": "sent"},
    ("PATCH", "/invoices/sales-invoices/:id/status"): {"status": "sent"},
    ("PATCH", "/deliveries/delivery-notes/:id/status"): {"status": "sent"},
    ("PATCH", "/deliveries/delivery-notes/:id/signature"):
        {"customerSignature": "sonde-cloisonnement"},
    ("PATCH", "/purchases/purchase-orders/:id/status"): {"status": "sent"},
    ("PATCH", "/purchases/vendor-bills/:id/status"): {"status": "validated"},
    ("PATCH", "/stock/inventory/:rawMaterialId/threshold"): {"alertThreshold": 5},
    ("PATCH", "/users/:id"): {"isActive": True},
    ("POST", "/customers/:id/contacts"): {"name": "Sonde cloisonnement"},
    ("POST", "/suppliers/:id/contacts"): {"name": "Sonde cloisonnement"},
    ("PUT", "/customers/:id/contacts/:contactId"): {"name": "Sonde cloisonnement"},
    ("PUT", "/suppliers/:id/contacts/:contactId"): {"name": "Sonde cloisonnement"},
    ("POST", "/products/:id/barcodes"):
        {"barcode": "SONDECLOISON1", "type": "INTERNE"},
    ("POST", "/products/:id/suppliers"): {"supplierId": "@A.fournisseur"},
    ("POST", "/purchases/vendor-bills/:id/payments"):
        {"amount": 1, "paymentDate": "@aujourdhui", "method": "cash"},
    ("POST", "/production/orders/:id/movements"):
        {"type": "mp_consumption", "quantity": 1, "unit": "kg"},
    ("POST", "/production/orders/:id/movements/batch"):
        {"items": [{"type": "mp_consumption", "quantity": 1, "unit": "kg"}]},
    ("PUT", "/price-lists/:id/items"): {"items": []},

    # Ces six routes ne prennent pas de DTO partiel : elles exigent le document
    # complet. Un corps vide les faisait répondre 400 — la sonde s'arrêtait à la
    # validation, sans jamais poser la question qui nous intéresse. Les valeurs
    # ci-dessous sont celles du locataire A : un contenu parfaitement légitime,
    # adressé à un identifiant qui ne l'est pas.
    ("PUT", "/deliveries/delivery-notes/:id"): {
        "customerId": "@A.client", "deliveryDate": "@aujourdhui",
        "items": [{"finishedProductId": "@A.article", "quantity": 1,
                   "unit": "kg", "unitPrice": 1200}]},
    ("PUT", "/invoices/sales-invoices/:id"): {
        "customerId": "@A.client", "invoiceDate": "@aujourdhui",
        "items": [{"finishedProductId": "@A.article", "quantity": 1,
                   "unit": "kg", "unitPrice": 1200}]},
    ("PUT", "/purchases/vendor-bills/:id"): {
        "supplierId": "@A.fournisseur", "billDate": "@aujourdhui",
        "items": [{"finishedProductId": "@A.matiere", "quantity": 1,
                   "unit": "kg", "unitPrice": 800}]},
    ("PUT", "/expenses/:id"): {
        "expenseDate": "@aujourdhui", "description": "Sonde cloisonnement",
        "category": "other", "amount": 1},
    ("PUT", "/price-lists/:id"): {"name": "Sonde cloisonnement"},
    ("PATCH", "/production/orders/:id/complete"): {"quantityProduced": 1},
}

# Les jeux de données exportables, lus une fois sur `GET /export` et écrits ici
# pour que la sonde de fuite ait un dénominateur. Un jeu ajouté au serveur et
# absent d'ici serait un export non sondé : le banc le signale au démarrage.
JEUX_EXPORT = [
    "factures", "lignes-factures", "encaissements", "avoirs", "devis",
    "bons-livraison", "clients", "fournisseurs", "articles", "lots-stock",
    "depenses", "commandes-achat", "receptions", "factures-fournisseurs",
    "reglements-fournisseurs",
]

# ─────────────────────────────────────────────────────────────────────────────


def arreter(message):
    print("❌ " + message)
    sys.exit(2)


def charger_manifeste():
    if not os.path.exists(MANIFESTE):
        arreter("manifeste absent : %s\n   Lancer d'abord ./scripts/provision-decor.sh"
                % MANIFESTE)
    with open(MANIFESTE, encoding="utf-8") as fh:
        return json.load(fh)


def valeur(manifeste, locataire, cle):
    """La valeur du manifeste désignée par une clé de PARAMETRES."""
    if cle == "@compte.agent":
        return manifeste["comptes"][locataire]["agent"]["id"]
    trouvee = manifeste["ressources"][locataire].get(cle)
    if not trouvee:
        arreter("le manifeste ne porte pas « ressources.%s.%s » — le décor "
                "est-il à jour ? (./scripts/provision-decor.sh)" % (locataire, cle))
    return trouvee


def resoudre_corps(gabarit, manifeste, aujourdhui):
    """Remplace les renvois « @… » par des valeurs du locataire A."""
    if isinstance(gabarit, dict):
        return {k: resoudre_corps(v, manifeste, aujourdhui) for k, v in gabarit.items()}
    if isinstance(gabarit, list):
        return [resoudre_corps(v, manifeste, aujourdhui) for v in gabarit]
    if gabarit == "@aujourdhui":
        return aujourdhui
    if isinstance(gabarit, str) and gabarit.startswith("@A."):
        return valeur(manifeste, "A", gabarit[3:])
    return gabarit


def chemin_cible(chemin, manifeste, locataire):
    """Le chemin, ses paramètres remplacés par des valeurs du locataire visé."""
    cles = PARAMETRES[chemin]
    restantes = list(cles)

    def remplacer(_m):
        return str(valeur(manifeste, locataire, restantes.pop(0)))

    resultat = re.sub(r":([A-Za-z_]+)", remplacer, chemin)
    if restantes:
        arreter("PARAMETRES[%s] donne %d clé(s) pour %d paramètre(s)"
                % (chemin, len(cles), len(cles) - len(restantes)))
    return resultat


def connexion(email, motdepasse):
    corps = json.dumps({"email": email, "password": motdepasse}).encode()
    req = urllib.request.Request(BASE_URL + "/auth/login", data=corps, method="POST")
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return json.loads(r.read())["data"]["accessToken"]
    except urllib.error.HTTPError as e:
        if e.code == 429:
            arreter("plafond atteint sur /auth/login — ce n'est pas un défaut "
                    "d'authentification (M9). Attendre, puis rejouer.")
        arreter("connexion refusée (%s) pour %s" % (e.code, email))


def appeler(methode, chemin, jeton, corps=None):
    """Rend (statut, texte_de_reponse). Le corps est rendu BRUT : c'est en le
    fouillant qu'on distingue un refus d'une fuite."""
    donnees = json.dumps(corps).encode() if corps is not None else None
    req = urllib.request.Request(BASE_URL + chemin, data=donnees, method=methode)
    req.add_header("Authorization", "Bearer " + jeton)
    if donnees is not None:
        req.add_header("Content-Type", "application/json")
    for essai in range(3):
        try:
            with urllib.request.urlopen(req, timeout=40) as r:
                return r.status, r.read(200000).decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            texte = e.read(200000).decode("utf-8", "replace")
            if e.code == 429 and essai < 2:
                print("   ⏳ 429 — plafond, pas un refus. Attente 20 s.")
                time.sleep(20)
                continue
            return e.code, texte
        except Exception as e:
            return None, "ERREUR_RESEAU: %s" % e
    return 429, "throttle"


def traces_de_b(manifeste):
    """Ce dont la présence dans une réponse prouve qu'une donnée de B est sortie.

    On ne cherche pas « une erreur » : on cherche **les valeurs de B**. Un 200
    vide ne prouve rien ; un 200 contenant le nom du client de B prouve tout.
    """
    marques = {manifeste["locataires"]["B"]["id"]}
    marques.update(str(v) for v in manifeste["ressources"]["B"].values() if v)
    marques.add("%s-B" % manifeste["marque"])          # « DECOR-B », dans les libellés
    marques.discard("")
    return marques


# ─────────────────────────────────────────────────────────────────────────────
# Auto-test — autant de cas qui doivent ÉCHOUER que de cas qui doivent passer
# ─────────────────────────────────────────────────────────────────────────────

_MANIFESTE_TEST = {
    "marque": "DECOR",
    "locataires": {"A": {"id": "AAA"}, "B": {"id": "BBB"}},
    "ressources": {
        "A": {"client": "a-cli", "fournisseur": "a-four"},
        "B": {"client": "b-cli", "clientContact": "b-ct", "codeBarresValeur": "BCODE"},
    },
    "comptes": {"B": {"agent": {"id": "b-agent"}}},
}


def self_test():
    echecs, passes = [], 0

    # ── La substitution des paramètres, y compris à deux paramètres ──
    for chemin, locataire, attendu in (
        ("/customers/:id", "B", "/customers/b-cli"),
        ("/customers/:id/contacts/:contactId", "B", "/customers/b-cli/contacts/b-ct"),
        ("/products/by-barcode/:code", "B", "/products/by-barcode/BCODE"),
        ("/users/:id", "B", "/users/b-agent"),
        ("/customers/:id", "A", "/customers/a-cli"),
    ):
        obtenu = chemin_cible(chemin, _MANIFESTE_TEST, locataire)
        if obtenu != attendu:
            echecs.append("chemin_cible(%s, %s) = %s" % (chemin, locataire, obtenu))
        else:
            passes += 1

    # ── Les renvois dans les corps ──
    obtenu = resoudre_corps(
        {"supplierId": "@A.fournisseur", "paymentDate": "@aujourdhui",
         "items": [{"q": 1, "s": "@A.client"}], "fixe": "texte"},
        _MANIFESTE_TEST, "2026-08-09")
    attendu = {"supplierId": "a-four", "paymentDate": "2026-08-09",
               "items": [{"q": 1, "s": "a-cli"}], "fixe": "texte"}
    if obtenu != attendu:
        echecs.append("resoudre_corps → %s" % (obtenu,))
    else:
        passes += 1

    # ── La détection de fuite, et surtout ses cas de REFUS ──
    marques = traces_de_b(_MANIFESTE_TEST)
    for texte, doit_fuiter in (
        ('{"data":{"id":"b-cli","name":"x"}}', True),      # identifiant de B
        ('{"data":{"name":"DECOR-B Client"}}', True),      # libellé de B
        ('{"tenantId":"BBB"}', True),                      # locataire B
        ('{"statusCode":404,"message":"errors.not_found"}', False),  # ⟵ refus
        ('{"data":[]}', False),                            # ⟵ refus : 200 vide
        ('{"data":{"id":"a-cli","name":"DECOR-A Client"}}', False),  # ⟵ refus : c'est chez soi
        ('', False),                                       # ⟵ refus : rien
    ):
        fuite = any(marque in texte for marque in marques)
        if fuite != doit_fuiter:
            echecs.append("fuite(%r) = %s, attendu %s" % (texte[:40], fuite, doit_fuiter))
        else:
            passes += 1

    # ── La table des paramètres est-elle cohérente avec elle-même ? ──
    for chemin, cles in PARAMETRES.items():
        attendus = len(re.findall(r":([A-Za-z_]+)", chemin))
        if attendus != len(cles):
            echecs.append("PARAMETRES[%s] : %d clé(s) pour %d paramètre(s)"
                          % (chemin, len(cles), attendus))
    passes += 1 if not any("PARAMETRES[" in e for e in echecs) else 0

    total = passes + len(echecs)
    print("auto-test : %d cas, dont 4 qui doivent conclure « pas de fuite »" % total)
    for e in echecs:
        print("  ❌ " + e)
    print("  %d/%d" % (passes, total))
    return not echecs


# ─────────────────────────────────────────────────────────────────────────────


def main():
    if "--self-test" in sys.argv:
        sys.exit(0 if self_test() else 1)

    routes = toutes_les_routes(SRC_DIR)
    a_parametre = [(m, c) for m, c, _ in routes if ":" in c]

    # ⚠️ Le contrôle qui ferme le mode M11 : toute route à paramètre doit être
    # soit sondée, soit écartée nommément. Une route qu'on oublie de décrire
    # sortirait du total sans que rien ne rougisse.
    inconnues = [(m, c) for m, c in a_parametre
                 if (m, c) not in EXCLUES and c not in PARAMETRES]
    if inconnues:
        print("❌ %d route(s) à paramètre ni sondée(s) ni écartée(s) — chacune "
              "doit rejoindre PARAMETRES ou EXCLUES, avec sa raison :"
              % len(inconnues))
        for m, c in sorted(inconnues):
            print("     %s %s" % (m, c))
        sys.exit(1)

    orphelines = sorted(set(PARAMETRES) - {c for _, c in a_parametre})
    if orphelines:
        print("⚠️  décrites ici mais absentes du code (à retirer) :")
        for c in orphelines:
            print("     " + c)

    cibles = [(m, c) for m, c in a_parametre if (m, c) not in EXCLUES]

    if "--list" in sys.argv:
        for m, c in cibles:
            print("%-6s %-52s ← %s" % (m, c, " + ".join(PARAMETRES[c])))
        print("\n%d routes à paramètre = %d sondées + %d écartées"
              % (len(a_parametre), len(cibles), len(EXCLUES)))
        return

    manifeste = charger_manifeste()
    marques = traces_de_b(manifeste)
    aujourdhui = time.strftime("%Y-%m-%d")

    comptes = manifeste["comptes"]
    jeton_a = connexion(comptes["A"]["owner"]["email"],
                        comptes["A"]["owner"]["motDePasse"])

    print("── banc de cloisonnement ──")
    print("   demandeur : owner du locataire A (%s)" % comptes["A"]["owner"]["email"])
    print("   cibles    : ressources du locataire B (%s)"
          % manifeste["locataires"]["B"]["libelle"])
    print("   %d routes à paramètre = %d sondées + %d écartées, nommément\n"
          % (len(a_parametre), len(cibles), len(EXCLUES)))

    refuses, fuites, acceptes, non_concluants, autres = [], [], [], [], []

    for methode, chemin in cibles:
        url = chemin_cible(chemin, manifeste, "B")
        gabarit = CORPS.get((methode, chemin))
        corps = resoudre_corps(gabarit, manifeste, aujourdhui) if gabarit else (
            {} if methode in ("POST", "PUT", "PATCH") else None)

        statut, texte = appeler(methode, url, jeton_a, corps)
        time.sleep(PACE_SECONDS)
        etiquette = "%s %s" % (methode, chemin)

        if statut in (403, 404):
            refuses.append(etiquette)
        elif statut is not None and 200 <= statut < 300:
            trouvees = sorted(m for m in marques if m in texte)
            if trouvees:
                fuites.append("%s → %s a rendu des données de B : %s"
                              % (etiquette, statut, ", ".join(trouvees[:3])))
            else:
                acceptes.append("%s → %s sans rien rendre de B" % (etiquette, statut))
        elif statut in (400, 422):
            message = texte[:160].replace("\n", " ")
            non_concluants.append("%s → %s %s" % (etiquette, statut, message))
        else:
            autres.append("%s → %s %s" % (etiquette, statut, texte[:120]))

    # ── La sonde de fuite des exports, que la substitution ne couvre pas ──
    # `/export/:dataset` ne nomme pas de ressource : ce qu'on y craint n'est pas
    # d'atteindre celle d'autrui, c'est que la sienne en contienne.
    # Le catalogue servi fait foi : un jeu ajouté au serveur et absent de
    # JEUX_EXPORT serait un export jamais sondé, et le total mentirait.
    statut, texte = appeler("GET", "/export", jeton_a)
    servis = [j["cle"] for j in json.loads(texte)["data"]] if statut == 200 else []
    manquants = sorted(set(servis) - set(JEUX_EXPORT))
    if manquants:
        print("❌ jeux exportables servis mais absents de JEUX_EXPORT — non "
              "sondés : %s" % ", ".join(manquants))
        sys.exit(1)

    exports = []
    for jeu in JEUX_EXPORT:
        statut, texte = appeler("GET", "/export/%s" % jeu, jeton_a)
        time.sleep(PACE_SECONDS)
        if statut is None or not (200 <= statut < 300):
            exports.append((jeu, statut, None))
            continue
        trouvees = sorted(m for m in marques if m in texte)
        exports.append((jeu, statut, trouvees))

    # ─────────────────────────────────────────────────────────────────────────
    print("── issues ──")
    print("   refusé (404 / 403)            %3d / %3d" % (len(refuses), len(cibles)))
    print("   FUITE                         %3d" % len(fuites))
    print("   accepté sans rien rendre      %3d" % len(acceptes))
    print("   non concluant (400 / 422)     %3d" % len(non_concluants))
    print("   autre                         %3d" % len(autres))

    print("\n   écartées, avec leur raison :")
    for m, c in sorted(EXCLUES):
        print("     %-6s %-44s %s" % (m, c, EXCLUES[(m, c)][:70]))

    if fuites:
        print("\n❌ %d FUITE(S) — des données du locataire B sont sorties :"
              % len(fuites))
        for e in fuites:
            print("     " + e)
    if acceptes:
        print("\n❌ %d route(s) ayant accepté un identifiant qui n'est pas au "
              "demandeur :" % len(acceptes))
        for e in acceptes:
            print("     " + e)
    if non_concluants:
        print("\n⚠️  %d sonde(s) arrêtée(s) par la validation avant d'atteindre "
              "la vérification d'appartenance — non couvertes, à corriger dans "
              "CORPS :" % len(non_concluants))
        for e in non_concluants:
            print("     " + e)
    if autres:
        print("\n⚠️  %d réponse(s) inattendue(s) :" % len(autres))
        for e in autres:
            print("     " + e)

    print("\n── fuite par les exports ──")
    for jeu, statut, trouvees in exports:
        if trouvees is None:
            print("   %-12s %s — non exploitable" % (jeu, statut))
        elif trouvees:
            print("   %-12s ❌ contient du locataire B : %s"
                  % (jeu, ", ".join(trouvees[:3])))
        else:
            print("   %-12s ok — aucune trace du locataire B" % jeu)

    fuite_export = any(t for _, _, t in exports if t)
    sys.exit(1 if fuites or acceptes or autres or fuite_export else 0)


if __name__ == "__main__":
    main()
