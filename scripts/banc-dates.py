#!/usr/bin/env python3
"""Banc des dates — étape 5 du chantier (étage 3). Défaut d'origine : **E007**.

    Une colonne `date` n'a ni heure ni fuseau. La convertir en `Date` lui en
    invente un, et toute reconversion en texte le fait payer d'un jour. Le
    décalage est invisible à Greenwich et systématique ailleurs.

Ce banc envoie des dates, les relit, et vérifie qu'elles sont **identiques**.
Rien de plus. C'est suffisant, parce que le défaut ne se manifeste jamais
autrement que par un jour de moins.

── Pourquoi la classe, et pas le symptôme ──────────────────────────────────

E007 a été corrigé dans la génération des factures récurrentes. **Il est revenu
deux heures plus tard**, dans la requête de liste du même module : l'écran
annonçait le 31 août pour une échéance au 1er septembre.

    « Corriger une occurrence ne corrige pas la classe. Le repérage se fait sur
      la forme — toute colonne `date` lue puis rendue au client — pas sur le
      symptôme. »

Ce banc balaie donc **toutes** les dates de tous les documents, et pas la seule
qui a mordu.

── Pourquoi ces dates-là ───────────────────────────────────────────────────

Un décalage d'un jour se voit à peine sur le 15 d'un mois : le 14 reste dans le
même mois, la même semaine, le même trimestre. Il devient visible aux
**bords** :

  · **le 31** d'un mois de 31 jours — recule au 30, et le 31 disparaît ;
  · **le 1er** — recule au dernier jour du mois **précédent**, ce qui change
    de mois, et donc de total de période ;
  · **le 1er mars** — recule au 28 ou 29 février selon l'année ;
  · **le 1er janvier** — recule au 31 décembre, ce qui change **d'année**, et
    donc d'exercice comptable et de séquence de numérotation.

⚠️ Ce banc ne prouve rien s'il tourne à Greenwich. Il vérifie donc d'abord que
le fuseau du serveur décale bien quelque chose — sinon il l'annonce, plutôt que
de rendre un vert qui ne coûterait rien.

── Ce qu'il ne couvre pas ──────────────────────────────────────────────────

`verifier-echeances.js` couvre déjà l'arithmétique des échéances — mois courts,
années bissextiles, non-dérive sur douze mois — et il **passait au vert pendant
le défaut**, parce qu'il manipule des chaînes en amont de la lecture. Les deux
sont complémentaires : l'un éprouve le calcul, celui-ci le **chemin**.

── Usage ────────────────────────────────────────────────────────────────────

    python3 scripts/banc-dates.py --self-test
    python3 scripts/banc-dates.py
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
LOCATAIRE = os.environ.get("LOCATAIRE", "B")

# Les bords, et ce que chacun révèle s'il recule d'un jour.
BORDS = [
    ("2026-01-31", "dernier jour d'un mois de 31"),
    ("2026-03-01", "recule au 28 ou 29 février selon l'année"),
    ("2026-01-01", "recule au 31 décembre — change d'ANNÉE et d'exercice"),
    ("2026-12-31", "dernier jour de l'année"),
]

# Un seul bord suffit aux documents lourds à fabriquer ; les quatre sont
# réservés aux documents dont la date est le cœur du sujet.
BORD_UNIQUE = BORDS[0][0]


def arreter(message):
    print("❌ " + message)
    sys.exit(2)


def appeler(methode, chemin, jeton, corps=None):
    donnees = json.dumps(corps).encode() if corps is not None else None
    req = urllib.request.Request(BASE_URL + chemin, data=donnees, method=methode)
    req.add_header("Authorization", "Bearer " + jeton)
    if donnees is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=45) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read())
        except Exception:
            return e.code, {}
    except Exception as e:
        return None, {"_erreur": str(e)}


def exiger(methode, chemin, jeton, corps=None, quoi=""):
    statut, reponse = appeler(methode, chemin, jeton, corps)
    if statut is None or not (200 <= statut < 300):
        arreter("%s %s → %s (%s) %s" % (methode, chemin, statut, quoi,
                                        json.dumps(reponse)[:200]))
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
            arreter("plafond sur /auth/login — pas un défaut d'authentification (M9)")
        arreter("connexion refusée (%s)" % e.code)


def jour(valeur):
    """Le jour calendaire d'une valeur rendue par l'API.

    ⚠️ Rend `None` quand il n'y a rien — jamais une chaîne vide. Un champ absent
    et un champ décalé sont deux défauts différents, et les confondre ferait
    passer le premier pour le second (M3).
    """
    if valeur is None:
        return None
    texte = str(valeur)
    return texte[:10] if len(texte) >= 10 else None


# ─────────────────────────────────────────────────────────────────────────────
# Les allers-retours, un par famille de document
# ─────────────────────────────────────────────────────────────────────────────

class Sonde:
    def __init__(self, famille, champ, envoye, relu, chemin_relecture):
        self.famille, self.champ = famille, champ
        self.envoye, self.relu = envoye, relu
        self.chemin = chemin_relecture

    @property
    def intact(self):
        return self.envoye == self.relu

    @property
    def ecart(self):
        if self.relu is None:
            return "champ absent à la relecture"
        return "envoyé %s, relu %s" % (self.envoye, self.relu)


def balayer(jeton, r, sondes):
    a = time.strftime("%Y-%m-%d")

    def relire(chemin, cle_id):
        return exiger("GET", chemin % cle_id, jeton)["data"]

    for date, _ in BORDS:
        # ── Facture : deux dates, et le cœur du sujet ──
        f = exiger("POST", "/invoices/sales-invoices", jeton, {
            "customerId": r["client"], "invoiceDate": date, "dueDate": date,
            "paymentMode": "bank_transfer", "notes": "banc dates",
            "items": [{"finishedProductId": r["article"], "quantity": 1,
                       "unit": "kg", "unitPrice": 1000, "taxName1": "TVA",
                       "taxRate1": 19}]}, "facture")["data"]
        relu = relire("/invoices/sales-invoices/%s", f["id"])
        sondes.append(Sonde("facture", "invoiceDate", date, jour(relu.get("invoiceDate")), "GET /:id"))
        sondes.append(Sonde("facture", "dueDate", date, jour(relu.get("dueDate")), "GET /:id"))
        # La liste est un second chemin de lecture — c'est là qu'E007 est revenu.
        liste = exiger("GET", "/invoices/sales-invoices?limit=100&dateFrom=%s&dateTo=%s"
                       % (date, date), jeton)["data"]
        ligne = next((x for x in liste if x["id"] == f["id"]), None)
        sondes.append(Sonde("facture", "invoiceDate", date,
                            jour(ligne.get("invoiceDate")) if ligne else None,
                            "GET / (liste filtrée sur ce jour)"))

        # ── Devis ──
        d = exiger("POST", "/quotes", jeton, {
            "customerId": r["client"], "quoteDate": date, "expiryDate": date,
            "notes": "banc dates",
            "items": [{"finishedProductId": r["article"], "quantity": 1,
                       "unit": "kg", "unitPrice": 1000, "taxRate1": 19}]},
                    "devis")["data"]
        relu = relire("/quotes/%s", d["id"])
        sondes.append(Sonde("devis", "quoteDate", date, jour(relu.get("quoteDate")), "GET /:id"))
        sondes.append(Sonde("devis", "expiryDate", date, jour(relu.get("expiryDate")), "GET /:id"))

    # ── Les documents lourds : un seul bord ──
    date = BORD_UNIQUE

    bl = exiger("POST", "/deliveries/delivery-notes", jeton, {
        "customerId": r["client"], "deliveryDate": date, "notes": "banc dates",
        "items": [{"finishedProductId": r["article"], "quantity": 1, "unit": "kg",
                   "unitPrice": 1000, "taxRate1": 19}]}, "BL")["data"]
    sondes.append(Sonde("bon de livraison", "deliveryDate", date,
                        jour(relire("/deliveries/delivery-notes/%s", bl["id"]).get("deliveryDate")),
                        "GET /:id"))

    c = exiger("POST", "/purchases/purchase-orders", jeton, {
        "supplierId": r["fournisseur"], "orderDate": date,
        "expectedDeliveryDate": date, "notes": "banc dates",
        "items": [{"rawMaterialId": r["matiere"], "quantity": 1, "unit": "kg",
                   "unitPrice": 800, "taxRate": 19}]}, "commande")["data"]
    relu = relire("/purchases/purchase-orders/%s", c["id"])
    sondes.append(Sonde("commande d'achat", "orderDate", date, jour(relu.get("orderDate")), "GET /:id"))
    sondes.append(Sonde("commande d'achat", "expectedDeliveryDate", date,
                        jour(relu.get("expectedDeliveryDate")), "GET /:id"))

    rec = exiger("POST", "/purchases/reception-bls", jeton, {
        "purchaseOrderId": c["id"], "receptionDate": date, "notes": "banc dates",
        "items": [{"rawMaterialId": r["matiere"], "quantityReceived": 1,
                   "costPerUnit": 800, "batchNumber": "DATE-%d" % int(time.time()),
                   "expiresAt": date}]}, "réception")["data"]
    sondes.append(Sonde("réception", "receptionDate", date,
                        jour(relire("/purchases/reception-bls/%s", rec["id"]).get("receptionDate")),
                        "GET /:id"))

    ff = exiger("POST", "/purchases/vendor-bills", jeton, {
        "supplierId": r["fournisseur"], "billDate": date, "dueDate": date,
        "notes": "banc dates",
        "items": [{"finishedProductId": r["matiere"], "quantity": 1, "unit": "kg",
                   "unitPrice": 800, "taxRate": 19}]}, "facture fournisseur")["data"]
    relu = relire("/purchases/vendor-bills/%s", ff["id"])
    sondes.append(Sonde("facture fournisseur", "billDate", date, jour(relu.get("billDate")), "GET /:id"))
    sondes.append(Sonde("facture fournisseur", "dueDate", date, jour(relu.get("dueDate")), "GET /:id"))

    dep = exiger("POST", "/expenses", jeton, {
        "expenseDate": date, "description": "banc dates", "category": "other",
        "amount": 100}, "dépense")["data"]
    sondes.append(Sonde("dépense", "expenseDate", date,
                        jour(relire("/expenses/%s", dep["id"]).get("expenseDate")),
                        "GET /:id"))

    # ── La facture récurrente : là où E007 a mordu, deux fois ──
    #
    # `startDate` sert d'ancrage : un abonnement au 31 doit revenir au 31. Le
    # défaut d'origine le ramenait au 30, puis dérivait à chaque échéance.
    rc = exiger("POST", "/invoices/recurring", jeton, {
        "label": "banc dates %d" % int(time.time()), "customerId": r["client"],
        "frequency": "monthly", "startDate": date, "paymentTermsDays": 30,
        "paymentMode": "bank_transfer",
        "items": [{"finishedProductId": r["article"], "quantity": 1, "unit": "kg",
                   "unitPrice": 1000, "taxRate1": 19}]}, "récurrente")["data"]
    liste = exiger("GET", "/invoices/recurring?limit=200", jeton)["data"]
    ligne = next((x for x in liste if x["id"] == rc["id"]), None)
    sondes.append(Sonde("facture récurrente", "startDate", date,
                        jour(rc.get("startDate")), "réponse de création"))
    sondes.append(Sonde("facture récurrente", "startDate", date,
                        jour(ligne.get("startDate")) if ligne else None,
                        "GET / (liste — le second chemin, où E007 est revenu)"))
    # L'ancrage : la prochaine échéance doit tomber le même jour du mois.
    prochaine = jour(ligne.get("nextRunDate")) if ligne else None
    sondes.append(Sonde("facture récurrente", "nextRunDate (jour d'ancrage)",
                        date[-2:], prochaine[-2:] if prochaine else None,
                        "GET / — le jour du mois doit être conservé"))

    p = exiger("POST", "/invoices/payments", jeton, {
        "salesInvoiceId": f["id"], "amount": 1, "paymentDate": date,
        "paymentMethod": "cash", "reference": "banc dates"}, "règlement")["data"]
    sondes.append(Sonde("règlement", "paymentDate", date,
                        jour(relire("/invoices/payments/%s", p["id"]).get("paymentDate")),
                        "GET /:id"))
    return sondes


# ─────────────────────────────────────────────────────────────────────────────


def self_test():
    echecs, passes = [], 0

    for valeur, attendu in (
        ("2026-01-31", "2026-01-31"),
        ("2026-01-31T00:00:00.000Z", "2026-01-31"),
        ("2026-01-30T23:00:00.000Z", "2026-01-30"),   # le décalage, vu tel quel
        # ⟵ refus : rien n'est pas une date, et ne doit pas devenir "".
        (None, None),
        ("", None),
        ("2026-01", None),
    ):
        if jour(valeur) != attendu:
            echecs.append("jour(%r) = %r, attendu %r" % (valeur, jour(valeur), attendu))
        else:
            passes += 1

    # ── Une sonde intacte, et trois qui doivent signaler ──
    for envoye, relu, doit_etre_intact in (
        ("2026-01-31", "2026-01-31", True),
        ("2026-01-31", "2026-01-30", False),    # ⟵ E007, exactement
        ("2026-01-01", "2025-12-31", False),    # ⟵ E007 franchissant l'année
        ("2026-01-31", None, False),            # ⟵ champ absent
    ):
        s = Sonde("f", "c", envoye, relu, "x")
        if s.intact != doit_etre_intact:
            echecs.append("Sonde(%s→%s).intact = %s" % (envoye, relu, s.intact))
        else:
            passes += 1
    if "absent" not in Sonde("f", "c", "2026-01-31", None, "x").ecart:
        echecs.append("un champ absent n'est pas nommé comme tel")
    else:
        passes += 1

    total = passes + len(echecs)
    print("auto-test : %d cas, dont 6 qui doivent refuser" % total)
    for e in echecs:
        print("  ❌ " + e)
    print("  %d/%d" % (passes, total))
    return not echecs


def main():
    if "--self-test" in sys.argv:
        sys.exit(0 if self_test() else 1)

    if not os.path.exists(MANIFESTE):
        arreter("manifeste absent — lancer ./scripts/provision-decor.sh")
    with open(MANIFESTE, encoding="utf-8") as fh:
        manifeste = json.load(fh)
    compte = manifeste["comptes"][LOCATAIRE]["owner"]
    jeton = connexion(compte["email"], compte["motDePasse"])

    print("── banc des dates ──")
    print("   défaut d'origine : E007 — une colonne `date` lue puis reformatée")
    print("                      recule d'un jour hors de Greenwich")
    # ⚠️ Un banc qui ne peut pas échouer ne prouve rien (R030). Si le serveur
    # tourne à UTC, le décalage n'existe pas et un vert ici ne coûte rien : on
    # le dit, plutôt que de l'encaisser.
    decalage = -time.timezone // 3600
    print("   fuseau de ce poste : UTC%+d" % decalage)
    if decalage == 0:
        print("   ⚠️  À UTC+0, ce banc NE PEUT PAS voir E007. Son vert ne prouve")
        print("       rien ici — le relancer sur un poste décalé, ou en TZ=Africa/Algiers.")
    print("   locataire : %s\n" % LOCATAIRE)

    sondes = balayer(jeton, manifeste["ressources"][LOCATAIRE], [])

    intactes = [s for s in sondes if s.intact]
    cassees = [s for s in sondes if not s.intact]
    familles = sorted({s.famille for s in sondes})

    for famille in familles:
        groupe = [s for s in sondes if s.famille == famille]
        mauvaises = [s for s in groupe if not s.intact]
        marque = "❌" if mauvaises else "✅"
        print("   %s %-22s %2d/%2d date(s) rendues à l'identique"
              % (marque, famille, len(groupe) - len(mauvaises), len(groupe)))
        for s in mauvaises:
            print("        %s — %s   (%s)" % (s.champ, s.ecart, s.chemin))

    print("\n── total, décomposé ──")
    print("   dates envoyées puis relues ..... %2d" % len(sondes))
    print("   rendues à l'identique .......... %2d" % len(intactes))
    print("   décalées ou absentes ........... %2d" % len(cassees))
    print("   familles de documents .......... %2d" % len(familles))
    print("   bords éprouvés ................. %2d — %s"
          % (len(BORDS), ", ".join(d for d, _ in BORDS)))

    sys.exit(1 if cassees else 0)


if __name__ == "__main__":
    main()
