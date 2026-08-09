#!/usr/bin/env python3
"""Banc des cycles de vie — étape 5 du chantier (étage 3).

    « Un cycle de vie n'est couvert que si ses refus le sont. »
    — docs/CHANTIER_TESTS.md, axe 4

Ce banc relève le **graphe de transitions réel** de chaque document — pas les
transitions qu'on croit permises, toutes celles qui le sont — et le compare au
graphe **documenté dans les specs**.

── Pourquoi le graphe observé, et pas le graphe attendu ────────────────────

Un banc qui n'éprouverait que les transitions documentées ne verrait jamais
celle que personne n'a écrite. Or c'est exactement celle qui fait mal : une
facture annulée qui repasse en brouillon, un BL livré qu'on annule après coup.

Le banc essaie donc **toutes les cases** : pour chaque état atteint, il tente
chacun des autres états, et note lequel passe. C'est possible parce qu'un refus
ne change rien — un document refusé reste dans son état, et la sonde suivante
part du même point. Seule une acceptation consomme le document ; il en faut
alors un neuf.

── Contre quoi le résultat est comparé ─────────────────────────────────────

Aux tableaux de transition des specs, qui sont écrits en français et n'ont pas
été dérivés du code :

    docs/specs/07-quotes.md    §« Transitions autorisées via PATCH …/status »
    docs/specs/08-deliveries.md §« Transitions autorisées »
    docs/specs/09-invoices.md   §« Transitions autorisées (manuelles) »
    docs/specs/04-purchases.md  §« Règle de transition de statut PurchaseOrder »

Comparer au `ALLOWED_TRANSITIONS` du service serait comparer le code à lui-même
(M2). Un écart ne dit pas lequel des deux a tort — il dit qu'ils ne disent pas
la même chose (R031).

── Où le banc travaille, et pourquoi ───────────────────────────────────────

**Dans le locataire B**, celui que le décor a créé pour les tests. Il fabrique
des dizaines de documents par passage : les poser chez A polluerait le jeu de
démonstration, qui sert à autre chose. Le cloisonnement étant éprouvé par
ailleurs, rien de ce qui est fait ici n'atteint A.

⚠️ Le banc **consomme du stock** : chaque BL sort une unité de l'article de B.

── Usage ────────────────────────────────────────────────────────────────────

    python3 scripts/banc-cycles-de-vie.py --self-test   # d'abord, et c'est bloquant
    python3 scripts/banc-cycles-de-vie.py --plan        # ce qui sera tenté, sans rien créer
    python3 scripts/banc-cycles-de-vie.py               # le banc
"""

import json
import os
import sys
import time
import urllib.error
import urllib.request

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE_URL = os.environ.get("BASE_URL", "http://localhost:3000/api/v1")
MANIFESTE = os.environ.get("MANIFESTE", os.path.join(RACINE, ".decor", "manifeste.json"))
PACE_SECONDS = float(os.environ.get("PACE_SECONDS", "0.1"))
LOCATAIRE = os.environ.get("LOCATAIRE", "B")

# ─────────────────────────────────────────────────────────────────────────────
# Les cycles, tels que les specs les décrivent
#
# ⚠️ `documentees` est une TRANSCRIPTION, pas une déduction. Chaque entrée cite
# le fichier et la section d'où elle vient. Si personne n'a écrit le graphe, on
# le dit — et l'observation est publiée sans verdict, comme pour `accountant`
# dans la matrice des rôles.
# ─────────────────────────────────────────────────────────────────────────────

CYCLES = {
    "devis": {
        "creation": "/quotes",
        "lecture": "/quotes/%s",
        "transition": "/quotes/%s/status",
        "etats": ["draft", "sent", "accepted", "rejected", "expired", "converted"],
        "source": "docs/specs/07-quotes.md §Transitions autorisées via PATCH /quotes/:id/status",
        "documentees": {
            "draft": ["sent"],
            "sent": ["accepted", "rejected"],
            "accepted": ["rejected"],
            "rejected": [],
            # « converted et expired sont des statuts finaux — non modifiables
            #   manuellement. »
            "converted": [],
            "expired": [],
        },
    },
    "bon-de-livraison": {
        "creation": "/deliveries/delivery-notes",
        "lecture": "/deliveries/delivery-notes/%s",
        "transition": "/deliveries/delivery-notes/%s/status",
        "etats": ["draft", "sent", "signed", "delivered", "cancelled"],
        "source": "docs/specs/08-deliveries.md §Transitions autorisées",
        "documentees": {
            "draft": ["sent"],
            "sent": ["signed"],
            "signed": ["delivered"],
            "delivered": [],
            # `cancelled` n'apparaît NI dans l'énumération de la spec
            # (« draft | sent | signed | delivered ») NI dans son tableau de
            # transitions. L'état existe pourtant dans le code.
            "cancelled": [],
        },
    },
    "facture": {
        "creation": "/invoices/sales-invoices",
        "lecture": "/invoices/sales-invoices/%s",
        "transition": "/invoices/sales-invoices/%s/status",
        "etats": ["draft", "sent", "partial", "paid", "overdue", "cancelled"],
        "source": "docs/specs/09-invoices.md §Transitions autorisées (manuelles)",
        "documentees": {
            "draft": ["sent", "cancelled"],
            "sent": ["cancelled"],
            "partial": ["cancelled"],
            "overdue": ["cancelled"],
            "paid": [],
            "cancelled": [],
        },
    },
    "commande-achat": {
        "creation": "/purchases/purchase-orders",
        "lecture": "/purchases/purchase-orders/%s",
        "transition": "/purchases/purchase-orders/%s/status",
        "etats": ["draft", "sent", "received", "invoiced", "cancelled"],
        "source": "docs/specs/04-purchases.md §Règle de transition de statut PurchaseOrder",
        "documentees": {
            "draft": ["sent", "cancelled"],
            # « sent → received : automatique lors de la création d'un
            #   ReceptionBL complet » — donc pas une transition manuelle.
            # « sent → cancelled : autorisé si aucun ReceptionBL existant »
            "sent": ["cancelled"],
            # `invoiced` n'est pas dans l'énumération documentée
            # (« draft | sent | received | cancelled »).
            "received": [],
            "invoiced": [],
            "cancelled": [],
        },
    },
}

# Les états qu'aucune sonde ne peut atteindre depuis l'API, et pourquoi.
# ⚠️ Nommés, parce qu'un état non atteint et un état oublié se ressemblent.
ETATS_INATTEIGNABLES = {
    ("devis", "expired"):
        "posé par l'âge du document (expiryDate dépassée), pas par un appel",
    ("devis", "converted"):
        "posé par POST /quotes/:id/convert, qui n'est pas une transition de "
        "statut — le banc des effets de bord (B2) le couvrira",
    ("facture", "overdue"):
        "posé par l'échéance dépassée, pas par un appel",
    ("facture", "partial"):
        "posé par un règlement partiel, pas par PATCH status — atteint ici en "
        "encaissant, puis sondé comme les autres",
    ("facture", "paid"):
        "posé par un règlement soldant, même remarque",
    ("bon-de-livraison", "signed"):
        "posé par PATCH /:id/signature — atteint ici en signant",
    ("commande-achat", "received"):
        "posé par la réception d'un BL fournisseur — atteint ici en réceptionnant",
    ("commande-achat", "invoiced"):
        "posé par la facture fournisseur — atteint ici en facturant",
}


# ─────────────────────────────────────────────────────────────────────────────


def arreter(message):
    print("❌ " + message)
    sys.exit(2)


DERNIER = {"statut": None, "corps": ""}


def appeler(methode, chemin, jeton, corps=None):
    donnees = json.dumps(corps).encode() if corps is not None else None
    req = urllib.request.Request(BASE_URL + chemin, data=donnees, method=methode)
    req.add_header("Authorization", "Bearer " + jeton)
    if donnees is not None:
        req.add_header("Content-Type", "application/json")
    for essai in range(3):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                brut = r.read(200000).decode("utf-8", "replace")
                DERNIER.update(statut=r.status, corps=brut)
                return r.status, (json.loads(brut) if brut else {})
        except urllib.error.HTTPError as e:
            brut = e.read(20000).decode("utf-8", "replace")
            if e.code == 429 and essai < 2:
                print("   ⏳ 429 — plafond, pas un refus. Attente 20 s.")
                time.sleep(20)
                continue
            DERNIER.update(statut=e.code, corps=brut)
            try:
                return e.code, json.loads(brut)
            except Exception:
                return e.code, {}
        except Exception as e:
            DERNIER.update(statut=None, corps=str(e))
            return None, {}
    return 429, {}


def exiger(methode, chemin, jeton, corps=None, quoi=""):
    statut, reponse = appeler(methode, chemin, jeton, corps)
    if statut is None or not (200 <= statut < 300):
        arreter("%s %s a répondu %s — %s\n   %s"
                % (methode, chemin, statut, quoi or "", DERNIER["corps"][:300]))
    return reponse


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


# ─────────────────────────────────────────────────────────────────────────────
# Fabrication d'un document dans un état donné
# ─────────────────────────────────────────────────────────────────────────────

class Atelier:
    """Fabrique des documents neufs dans le locataire de test."""

    def __init__(self, jeton, ressources):
        self.jeton = jeton
        self.r = ressources
        self.aujourdhui = time.strftime("%Y-%m-%d")
        self.compte = 0

    def _creer(self, cycle):
        self.compte += 1
        note = "Banc cycles de vie — sonde %d" % self.compte
        if cycle == "devis":
            corps = {"customerId": self.r["client"], "quoteDate": self.aujourdhui,
                     "notes": note,
                     "items": [{"finishedProductId": self.r["article"], "quantity": 1,
                                "unit": "kg", "unitPrice": 1000, "taxRate1": 19}]}
            return exiger("POST", "/quotes", self.jeton, corps, "création devis")
        if cycle == "bon-de-livraison":
            corps = {"customerId": self.r["client"], "deliveryDate": self.aujourdhui,
                     "notes": note,
                     "items": [{"finishedProductId": self.r["article"], "quantity": 1,
                                "unit": "kg", "unitPrice": 1000, "taxRate1": 19}]}
            return exiger("POST", "/deliveries/delivery-notes", self.jeton, corps,
                          "création BL")
        if cycle == "facture":
            corps = {"customerId": self.r["client"], "invoiceDate": self.aujourdhui,
                     "notes": note, "paymentMode": "bank_transfer",
                     "items": [{"finishedProductId": self.r["article"], "quantity": 1,
                                "unit": "kg", "unitPrice": 1000, "taxRate1": 19}]}
            return exiger("POST", "/invoices/sales-invoices", self.jeton, corps,
                          "création facture")
        if cycle == "commande-achat":
            corps = {"supplierId": self.r["fournisseur"], "orderDate": self.aujourdhui,
                     "notes": note,
                     "items": [{"rawMaterialId": self.r["matiere"], "quantity": 1,
                                "unit": "kg", "unitPrice": 800, "taxRate": 19}]}
            return exiger("POST", "/purchases/purchase-orders", self.jeton, corps,
                          "création commande")
        raise AssertionError(cycle)

    def dans_etat(self, cycle, etat):
        """Un document neuf, amené à `etat`. Rend son identifiant, ou None si
        l'état n'est pas atteignable — nommément, jamais en silence."""
        doc = self._creer(cycle)["data"]
        identifiant = doc["id"]
        if doc["status"] == etat:
            return identifiant

        chemins = CHEMINS_D_ACCES.get((cycle, etat))
        if chemins is None:
            return None
        for geste in chemins:
            if not geste(self, identifiant):
                return None
        courant = exiger("GET", CYCLES[cycle]["lecture"] % identifiant,
                         self.jeton)["data"]["status"]
        return identifiant if courant == etat else None


# ── Les gestes qui posent un état sans passer par PATCH …/status ────────────
#
# Ils ne sont pas des transitions : ce sont des actes métier dont le changement
# de statut est un **effet de bord**. Les mélanger avec les transitions
# manuelles ferait croire à un graphe plus riche qu'il n'est.

def _patch_statut(atelier, cycle, identifiant, etat):
    statut, _ = appeler("PATCH", CYCLES[cycle]["transition"] % identifiant,
                        atelier.jeton, {"status": etat})
    return statut is not None and 200 <= statut < 300


def _devis_vers_sent(a, i):
    return _patch_statut(a, "devis", i, "sent")


def _devis_vers_accepted(a, i):
    return _devis_vers_sent(a, i) and _patch_statut(a, "devis", i, "accepted")


def _devis_vers_rejected(a, i):
    return _devis_vers_sent(a, i) and _patch_statut(a, "devis", i, "rejected")


def _bl_vers_sent(a, i):
    return _patch_statut(a, "bon-de-livraison", i, "sent")


def _bl_vers_signed(a, i):
    if not _bl_vers_sent(a, i):
        return False
    statut, _ = appeler("PATCH", "/deliveries/delivery-notes/%s/signature" % i,
                        a.jeton, {"customerSignature": "banc-cycles-de-vie"})
    return statut is not None and 200 <= statut < 300


def _bl_vers_delivered(a, i):
    return _bl_vers_sent(a, i) and _patch_statut(a, "bon-de-livraison", i, "delivered")


def _bl_vers_cancelled(a, i):
    return _patch_statut(a, "bon-de-livraison", i, "cancelled")


def _facture_vers_sent(a, i):
    return _patch_statut(a, "facture", i, "sent")


def _facture_vers_cancelled(a, i):
    return _patch_statut(a, "facture", i, "cancelled")


def _facture_regler(a, i, part):
    """Encaisse une fraction du total — c'est ce qui pose `partial` ou `paid`."""
    doc = exiger("GET", "/invoices/sales-invoices/%s" % i, a.jeton)["data"]
    total = float(doc["totalAmount"])
    montant = round(total * part, 2) if part < 1 else total
    statut, _ = appeler("POST", "/invoices/payments", a.jeton,
                        {"salesInvoiceId": i, "amount": montant,
                         "paymentDate": a.aujourdhui, "paymentMethod": "cash",
                         "reference": "banc-cycles-de-vie"})
    return statut is not None and 200 <= statut < 300


def _facture_vers_partial(a, i):
    return _facture_vers_sent(a, i) and _facture_regler(a, i, 0.25)


def _facture_vers_paid(a, i):
    return _facture_vers_sent(a, i) and _facture_regler(a, i, 1)


def _commande_vers_sent(a, i):
    return _patch_statut(a, "commande-achat", i, "sent")


def _commande_vers_cancelled(a, i):
    return _patch_statut(a, "commande-achat", i, "cancelled")


def _commande_vers_received(a, i):
    if not _commande_vers_sent(a, i):
        return False
    statut, _ = appeler("POST", "/purchases/reception-bls", a.jeton,
                        {"purchaseOrderId": i, "receptionDate": a.aujourdhui,
                         "notes": "banc-cycles-de-vie",
                         "items": [{"rawMaterialId": a.r["matiere"],
                                    "quantityReceived": 1, "costPerUnit": 800}]})
    return statut is not None and 200 <= statut < 300


CHEMINS_D_ACCES = {
    ("devis", "sent"): [_devis_vers_sent],
    ("devis", "accepted"): [_devis_vers_accepted],
    ("devis", "rejected"): [_devis_vers_rejected],
    ("bon-de-livraison", "sent"): [_bl_vers_sent],
    ("bon-de-livraison", "signed"): [_bl_vers_signed],
    ("bon-de-livraison", "delivered"): [_bl_vers_delivered],
    ("bon-de-livraison", "cancelled"): [_bl_vers_cancelled],
    ("facture", "sent"): [_facture_vers_sent],
    ("facture", "partial"): [_facture_vers_partial],
    ("facture", "paid"): [_facture_vers_paid],
    ("facture", "cancelled"): [_facture_vers_cancelled],
    ("commande-achat", "sent"): [_commande_vers_sent],
    ("commande-achat", "received"): [_commande_vers_received],
    ("commande-achat", "cancelled"): [_commande_vers_cancelled],
}


# ─────────────────────────────────────────────────────────────────────────────
# Auto-test — la logique de comparaison, avec ses cas de refus
# ─────────────────────────────────────────────────────────────────────────────

def comparer(documentees, observees, etats_atteints):
    """Rend (accordees, en_trop, manquantes) sur les seuls états atteints.

    ⚠️ Un état non atteint ne produit AUCUN verdict : on ne peut pas conclure
    d'une case qu'on n'a pas mesurée. La confondre avec « conforme » gonflerait
    le total d'exactement ce qu'on n'a pas éprouvé (M1).
    """
    accordees, en_trop, manquantes = [], [], []
    for depuis in sorted(etats_atteints):
        attendues = set(documentees.get(depuis, []))
        constatees = set(observees.get(depuis, []))
        for vers in sorted(attendues | constatees):
            if vers in constatees and vers in attendues:
                accordees.append((depuis, vers))
            elif vers in constatees:
                en_trop.append((depuis, vers))
            else:
                manquantes.append((depuis, vers))
    return accordees, en_trop, manquantes


def self_test():
    echecs, passes = [], 0

    cas = [
        # (documentées, observées, atteints, accordées, en trop, manquantes)
        ({"a": ["b"]}, {"a": ["b"]}, {"a"}, [("a", "b")], [], []),
        # ⟵ une transition que personne n'a documentée : c'est ce que ce banc
        #    existe pour trouver.
        ({"a": ["b"]}, {"a": ["b", "c"]}, {"a"}, [("a", "b")], [("a", "c")], []),
        # ⟵ une transition promise et refusée : elle bloque un utilisateur.
        ({"a": ["b", "c"]}, {"a": ["b"]}, {"a"}, [("a", "b")], [], [("a", "c")]),
        # ⟵ un état non atteint ne produit aucun verdict, ni bon ni mauvais.
        ({"a": ["b"], "z": ["y"]}, {"a": ["b"]}, {"a"}, [("a", "b")], [], []),
        # ⟵ un état terminal documenté et observé terminal : rien à dire.
        ({"f": []}, {"f": []}, {"f"}, [], [], []),
    ]
    for documentees, observees, atteints, ac, tr, ma in cas:
        obtenu = comparer(documentees, observees, atteints)
        if obtenu != (ac, tr, ma):
            echecs.append("comparer(%s, %s, %s) = %s" % (documentees, observees, atteints, obtenu))
        else:
            passes += 1

    # ── Cohérence des tables : tout état cité doit être un état déclaré ──
    for cycle, spec in CYCLES.items():
        etats = set(spec["etats"])
        for depuis, vers in spec["documentees"].items():
            if depuis not in etats:
                echecs.append("%s : état documenté « %s » hors de l'énumération" % (cycle, depuis))
            for v in vers:
                if v not in etats:
                    echecs.append("%s : cible documentée « %s » hors de l'énumération" % (cycle, v))
        manquants = etats - set(spec["documentees"])
        if manquants:
            echecs.append("%s : états sans ligne documentée : %s" % (cycle, sorted(manquants)))
        else:
            passes += 1

    total = passes + len(echecs)
    print("auto-test : %d cas, dont 3 qui doivent signaler un écart" % total)
    for e in echecs:
        print("  ❌ " + e)
    print("  %d/%d" % (passes, total))
    return not echecs


# ─────────────────────────────────────────────────────────────────────────────


def main():
    if "--self-test" in sys.argv:
        sys.exit(0 if self_test() else 1)

    if "--plan" in sys.argv:
        for cycle, spec in CYCLES.items():
            n = len(spec["etats"])
            print("%-18s %d états → jusqu'à %d sondes de transition   (%s)"
                  % (cycle, n, n * (n - 1), spec["source"]))
        print("\nÉtats posés autrement que par PATCH …/status, "
              "et atteints par leur geste métier :")
        for (cycle, etat), raison in sorted(ETATS_INATTEIGNABLES.items()):
            print("   %-18s %-12s %s" % (cycle, etat, raison))
        return

    if not os.path.exists(MANIFESTE):
        arreter("manifeste absent — lancer ./scripts/provision-decor.sh")
    with open(MANIFESTE, encoding="utf-8") as fh:
        manifeste = json.load(fh)

    compte = manifeste["comptes"][LOCATAIRE]["owner"]
    jeton = connexion(compte["email"], compte["motDePasse"])
    atelier = Atelier(jeton, manifeste["ressources"][LOCATAIRE])

    print("── banc des cycles de vie ──")
    print("   locataire de travail : %s (%s)"
          % (LOCATAIRE, manifeste["locataires"][LOCATAIRE]["libelle"]))
    print("   attendu : les tableaux de transition des specs\n")

    resultats = {}
    for cycle, spec in CYCLES.items():
        etats = spec["etats"]
        observees = {}
        atteints, inatteignables = set(), []

        for depuis in etats:
            # Un document dans l'état de départ. S'il n'est pas atteignable, on
            # le dit et on ne conclut rien sur cette ligne.
            sonde = atelier.dans_etat(cycle, depuis)
            if sonde is None:
                inatteignables.append(depuis)
                continue
            atteints.add(depuis)
            observees[depuis] = []

            restants = [e for e in etats if e != depuis]
            courant = sonde
            for vers in restants:
                statut, _ = appeler("PATCH", spec["transition"] % courant, jeton,
                                    {"status": vers})
                time.sleep(PACE_SECONDS)
                if statut is not None and 200 <= statut < 300:
                    observees[depuis].append(vers)
                    # Le document a bougé : il en faut un neuf pour la suite,
                    # sinon les sondes suivantes partiraient du mauvais état.
                    courant = atelier.dans_etat(cycle, depuis)
                    if courant is None:
                        break
                # Un refus ne change rien : on continue sur le même document.

        accordees, en_trop, manquantes = comparer(
            spec["documentees"], observees, atteints)
        resultats[cycle] = dict(accordees=accordees, en_trop=en_trop,
                                manquantes=manquantes, atteints=atteints,
                                inatteignables=inatteignables, observees=observees)

        total = len(accordees) + len(en_trop) + len(manquantes)
        print("── %s ──  %d/%d états atteints, %d transitions éprouvées"
              % (cycle, len(atteints), len(etats), total))
        print("   source : %s" % spec["source"])
        if inatteignables:
            for etat in inatteignables:
                raison = ETATS_INATTEIGNABLES.get(
                    (cycle, etat), "aucune raison écrite — à documenter")
                print("   état non atteint : %-12s %s" % (etat, raison))
        for depuis, vers in en_trop:
            print("   ❌ %-10s → %-10s permise, **non documentée**" % (depuis, vers))
        for depuis, vers in manquantes:
            print("   ❌ %-10s → %-10s documentée, **refusée**" % (depuis, vers))
        if not en_trop and not manquantes:
            print("   ✅ le graphe observé est exactement celui de la spec")
        print()

    total_trop = sum(len(r["en_trop"]) for r in resultats.values())
    total_manque = sum(len(r["manquantes"]) for r in resultats.values())
    total_ok = sum(len(r["accordees"]) for r in resultats.values())
    non_atteints = sum(len(r["inatteignables"]) for r in resultats.values())

    print("── total, décomposé ──")
    print("   transitions conformes à la spec ......... %3d" % total_ok)
    print("   permises et NON documentées ............. %3d" % total_trop)
    print("   documentées et REFUSÉES ................. %3d" % total_manque)
    print("   états non atteints (aucun verdict) ...... %3d" % non_atteints)
    print("   documents fabriqués pour ce passage ..... %3d" % atelier.compte)

    sys.exit(1 if total_trop or total_manque else 0)


if __name__ == "__main__":
    main()
