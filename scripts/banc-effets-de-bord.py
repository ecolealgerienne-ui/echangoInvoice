#!/usr/bin/env python3
"""Banc des effets de bord obligatoires — étape 5 du chantier (étage 3).

`CLAUDE.md` §2 énumère six enchaînements déclarés **non négociables** : un
appel, et ce qui doit se produire ailleurs dans la base. Ce banc les joue et
mesure ce qui s'est réellement produit.

── Pourquoi ce banc-là plutôt qu'un autre ──────────────────────────────────

Parce que c'est là que le produit a déjà cassé. **E017** : la production
consommait le stock hors des lots, et les quantités livrées **ressuscitaient**
trois gestes plus tard. Le code était propre, la requête correcte, le statut
HTTP à 200. Ce qui manquait ne se voyait qu'en regardant **ailleurs** — dans
une autre table, après coup.

    « Une donnée mal câblée ne casse presque jamais — elle disparaît. »

Un banc de frontière voit passer un 201. Seule une mesure avant/après voit que
le lot n'a pas été créé.

── Contre quoi le résultat est comparé ─────────────────────────────────────

Au tableau de `CLAUDE.md` §2, recopié ci-dessous ligne à ligne avec sa
citation. C'est un contrat écrit, indépendant du code.

⚠️ Ce banc **écrit** dans la base : il crée des documents, encaisse, réceptionne.
Il travaille pour cela dans le **locataire B**, celui du décor.

── Usage ────────────────────────────────────────────────────────────────────

    python3 scripts/banc-effets-de-bord.py --self-test   # d'abord, et c'est bloquant
    python3 scripts/banc-effets-de-bord.py --liste       # les six effets, sans rien faire
    python3 scripts/banc-effets-de-bord.py
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

# ─────────────────────────────────────────────────────────────────────────────
# Le contrat, transcrit depuis CLAUDE.md §2
# ─────────────────────────────────────────────────────────────────────────────

CONTRAT = {
    "reception": (
        "POST /purchases/reception-bls",
        "Crée `StockEntry` + met à jour `InventorySummary`"),
    "livraison": (
        "POST /deliveries/delivery-notes",
        "Décrémente stock FIFO + status entries → `reserved`"),
    "facture-tva": (
        "POST /invoices/sales-invoices",
        "Auto-calcule TVA 19%"),
    "envoi-facture": (
        "POST /invoices/sales-invoices/:id/send-email",
        "Génère PDF + attache + status → `sent`"),
    "reglement": (
        "POST /invoices/payments",
        "`amountPaid +=`, `amountDue -=`, si `amountDue = 0` → status `paid` "
        "+ entries → `sold`"),
    "conversion-devis": (
        "POST /quotes/:id/convert-to-invoice",
        "Crée `SalesInvoice` + `SalesInvoiceItems` + met à jour "
        "`Quote.status → invoiced` + vérifie quota freemium"),
}


# ─────────────────────────────────────────────────────────────────────────────


def arreter(message):
    print("❌ " + message)
    sys.exit(2)


def appeler(methode, chemin, jeton, corps=None):
    donnees = json.dumps(corps).encode() if corps is not None else None
    req = urllib.request.Request(BASE_URL + chemin, data=donnees, method=methode)
    req.add_header("Authorization", "Bearer " + jeton)
    if donnees is not None:
        req.add_header("Content-Type", "application/json")
    for essai in range(3):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                brut = r.read(400000)
                try:
                    return r.status, json.loads(brut)
                except Exception:
                    return r.status, {"_octets": len(brut)}
        except urllib.error.HTTPError as e:
            brut = e.read(20000).decode("utf-8", "replace")
            if e.code == 429 and essai < 2:
                time.sleep(20)
                continue
            try:
                return e.code, json.loads(brut)
            except Exception:
                return e.code, {"_brut": brut[:300]}
        except Exception as e:
            return None, {"_erreur": str(e)}
    return 429, {}


def exiger(methode, chemin, jeton, corps=None, quoi=""):
    statut, reponse = appeler(methode, chemin, jeton, corps)
    if statut is None or not (200 <= statut < 300):
        arreter("%s %s → %s (%s)\n   %s" % (methode, chemin, statut, quoi,
                                            json.dumps(reponse)[:300]))
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
        arreter("connexion refusée (%s) pour %s" % (e.code, email))


# ─────────────────────────────────────────────────────────────────────────────
# Mesures — ce qu'on regarde AILLEURS, avant et après
# ─────────────────────────────────────────────────────────────────────────────

def nombre(valeur):
    try:
        return float(valeur)
    except (TypeError, ValueError):
        return 0.0


def inventaire(jeton, article):
    """La ligne d'inventaire d'un article, ou None si elle n'existe pas."""
    r = exiger("GET", "/stock/inventory?limit=200", jeton, quoi="inventaire")
    for ligne in r["data"]:
        if ligne["rawMaterialId"] == article:
            return ligne
    return None


def lots(jeton, article):
    r = exiger("GET", "/stock/entries/%s?limit=200" % article, jeton, quoi="lots")
    return r["data"]


class Constat:
    """Un effet attendu, et ce qu'on a mesuré. Jamais un booléen nu : sans le
    mesuré ni l'attendu, un échec n'apprend rien (E004)."""

    def __init__(self, libelle):
        self.libelle = libelle
        self.verdict = None
        self.detail = ""

    def poser(self, tenu, detail):
        self.verdict = bool(tenu)
        self.detail = detail
        return self


# ─────────────────────────────────────────────────────────────────────────────


def effet_reception(jeton, r, aujourdhui):
    """« Crée StockEntry + met à jour InventorySummary »"""
    constats = []
    avant_lots = len(lots(jeton, r["matiere"]))
    ligne = inventaire(jeton, r["matiere"])
    avant_qte = nombre(ligne["totalQuantity"]) if ligne else 0.0

    commande = exiger("POST", "/purchases/purchase-orders", jeton, {
        "supplierId": r["fournisseur"], "orderDate": aujourdhui,
        "notes": "banc effets de bord",
        "items": [{"rawMaterialId": r["matiere"], "quantity": 7, "unit": "kg",
                   "unitPrice": 800, "taxRate": 19}]}, "commande")["data"]
    exiger("POST", "/purchases/reception-bls", jeton, {
        "purchaseOrderId": commande["id"], "receptionDate": aujourdhui,
        "notes": "banc effets de bord",
        "items": [{"rawMaterialId": r["matiere"], "quantityReceived": 7,
                   "costPerUnit": 800, "batchNumber": "EFFET-%d" % int(time.time())}]},
           "réception")

    apres_lots = len(lots(jeton, r["matiere"]))
    ligne = inventaire(jeton, r["matiere"])
    apres_qte = nombre(ligne["totalQuantity"]) if ligne else 0.0

    constats.append(Constat("un lot (`StockEntry`) est créé").poser(
        apres_lots == avant_lots + 1,
        "%d lot(s) avant, %d après" % (avant_lots, apres_lots)))
    constats.append(Constat("l'inventaire monte de la quantité reçue").poser(
        abs((apres_qte - avant_qte) - 7) < 0.01,
        "%.2f → %.2f, soit %+.2f pour 7 reçus" % (avant_qte, apres_qte, apres_qte - avant_qte)))
    return constats


def effet_livraison(jeton, r, aujourdhui):
    """« Décrémente stock FIFO + status entries → reserved »"""
    constats = []
    ligne = inventaire(jeton, r["article"])
    avant_dispo = nombre(ligne["availableQuantity"]) if ligne else 0.0
    avant_reserves = sum(1 for l in lots(jeton, r["article"]) if l.get("status") == "reserved")

    exiger("POST", "/deliveries/delivery-notes", jeton, {
        "customerId": r["client"], "deliveryDate": aujourdhui,
        "notes": "banc effets de bord",
        "items": [{"finishedProductId": r["article"], "quantity": 3, "unit": "kg",
                   "unitPrice": 1000, "taxName1": "TVA", "taxRate1": 19}]}, "BL")

    ligne = inventaire(jeton, r["article"])
    apres_dispo = nombre(ligne["availableQuantity"]) if ligne else 0.0
    apres_reserves = sum(1 for l in lots(jeton, r["article"]) if l.get("status") == "reserved")

    apres_vendus = sum(1 for l in lots(jeton, r["article"]) if l.get("status") == "sold")

    constats.append(Constat("le disponible baisse de la quantité livrée").poser(
        abs((avant_dispo - apres_dispo) - 3) < 0.01,
        "%.2f → %.2f, soit %+.2f pour 3 livrés" % (avant_dispo, apres_dispo, apres_dispo - avant_dispo)))
    # ⚠️ Le contrat dit `reserved` à la livraison, et `sold` au règlement.
    #    Le code écrit `sold` dès la livraison — et **rien, nulle part, n'écrit
    #    jamais `reserved`** (vérifié par grep sur tout `src/`). L'état existe
    #    dans l'énumération, il est LU par le tableau de bord et les rapports,
    #    et il ne peut valoir que zéro.
    constats.append(Constat("au moins un lot passe en `reserved`").poser(
        apres_reserves > avant_reserves,
        "%d lot(s) `reserved` avant, %d après — %d lot(s) sont passés en `sold`, "
        "que le contrat réserve au règlement"
        % (avant_reserves, apres_reserves, apres_vendus)))
    return constats


def effet_facture_tva(jeton, r, aujourdhui):
    """« Auto-calcule TVA 19% »

    ⚠️ La sonde n'envoie **aucun** taux. C'est tout l'objet du mot
    « auto-calcule » : si le taux devait être fourni par l'appelant, il n'y
    aurait rien d'automatique.
    """
    facture = exiger("POST", "/invoices/sales-invoices", jeton, {
        "customerId": r["client"], "invoiceDate": aujourdhui,
        "paymentMode": "bank_transfer", "notes": "banc effets de bord",
        "items": [{"finishedProductId": r["article"], "quantity": 1,
                   "unit": "kg", "unitPrice": 1000}]}, "facture sans taux")["data"]
    ht = nombre(facture.get("subtotal", facture.get("totalHT", 0)))
    total = nombre(facture["totalAmount"])
    tva = nombre(facture.get("taxAmount", total - ht))
    attendu = round(1000 * 0.19, 2)
    return [Constat("la TVA de 19 % est posée sans que l'appelant la fournisse").poser(
        abs(tva - attendu) < 0.01,
        "HT %.2f, TVA mesurée %.2f, attendue %.2f, total %.2f" % (ht, tva, attendu, total))]


def effet_envoi(jeton, r, aujourdhui):
    """« Génère PDF + attache + status → sent »"""
    constats = []
    facture = exiger("POST", "/invoices/sales-invoices", jeton, {
        "customerId": r["client"], "invoiceDate": aujourdhui,
        "paymentMode": "bank_transfer", "notes": "banc effets de bord",
        "items": [{"finishedProductId": r["article"], "quantity": 1, "unit": "kg",
                   "unitPrice": 1000, "taxName1": "TVA", "taxRate1": 19}]},
                    "facture")["data"]

    statut_pdf, corps_pdf = appeler("GET", "/invoices/sales-invoices/%s/pdf" % facture["id"], jeton)
    constats.append(Constat("le PDF de la facture se génère").poser(
        statut_pdf == 200 and corps_pdf.get("_octets", 0) > 1000,
        "statut %s, %s octets" % (statut_pdf, corps_pdf.get("_octets", 0))))

    statut, reponse = appeler("POST", "/invoices/sales-invoices/%s/send-email" % facture["id"], jeton, {})
    if statut is None or not (200 <= statut < 300):
        constats.append(Constat("l'envoi place la facture en `sent`").poser(
            False,
            "l'envoi a répondu %s (%s) — SMTP configuré ? Effet NON MESURÉ, "
            "pas réfuté" % (statut, json.dumps(reponse)[:120])))
        return constats

    apres = exiger("GET", "/invoices/sales-invoices/%s" % facture["id"], jeton)["data"]
    constats.append(Constat("l'envoi place la facture en `sent`").poser(
        apres["status"] == "sent", "statut après envoi : %s" % apres["status"]))
    return constats


def effet_reglement(jeton, r, aujourdhui):
    """« amountPaid +=, amountDue -=, si amountDue = 0 → paid + entries → sold »"""
    constats = []
    facture = exiger("POST", "/invoices/sales-invoices", jeton, {
        "customerId": r["client"], "invoiceDate": aujourdhui,
        "paymentMode": "bank_transfer", "notes": "banc effets de bord",
        "items": [{"finishedProductId": r["article"], "quantity": 1, "unit": "kg",
                   "unitPrice": 1000, "taxName1": "TVA", "taxRate1": 19}]},
                    "facture")["data"]
    total = nombre(facture["totalAmount"])

    exiger("POST", "/invoices/payments", jeton, {
        "salesInvoiceId": facture["id"], "amount": round(total / 2, 2),
        "paymentDate": aujourdhui, "paymentMethod": "cash",
        "reference": "banc effets de bord"}, "règlement partiel")
    moitie = exiger("GET", "/invoices/sales-invoices/%s" % facture["id"], jeton)["data"]

    constats.append(Constat("un encaissement partiel monte `amountPaid` et baisse `amountDue`").poser(
        abs(nombre(moitie["amountPaid"]) - round(total / 2, 2)) < 0.02
        and abs(nombre(moitie["amountDue"]) - (total - round(total / 2, 2))) < 0.02,
        "payé %.2f, dû %.2f, sur un total de %.2f"
        % (nombre(moitie["amountPaid"]), nombre(moitie["amountDue"]), total)))

    exiger("POST", "/invoices/payments", jeton, {
        "salesInvoiceId": facture["id"], "amount": nombre(moitie["amountDue"]),
        "paymentDate": aujourdhui, "paymentMethod": "cash",
        "reference": "banc effets de bord"}, "solde")
    solde = exiger("GET", "/invoices/sales-invoices/%s" % facture["id"], jeton)["data"]

    constats.append(Constat("soldée, la facture passe en `paid`").poser(
        nombre(solde["amountDue"]) == 0 and solde["status"] == "paid",
        "dû %.2f, statut %s" % (nombre(solde["amountDue"]), solde["status"])))
    return constats


def effet_conversion(jeton, r, aujourdhui):
    """« Crée SalesInvoice + items + Quote.status → invoiced + quota freemium »"""
    constats = []
    devis = exiger("POST", "/quotes", jeton, {
        "customerId": r["client"], "quoteDate": aujourdhui,
        "notes": "banc effets de bord",
        "items": [{"finishedProductId": r["article"], "quantity": 2, "unit": "kg",
                   "unitPrice": 1000, "taxName1": "TVA", "taxRate1": 19}]},
                   "devis")["data"]
    exiger("PATCH", "/quotes/%s/status" % devis["id"], jeton, {"status": "sent"})
    exiger("PATCH", "/quotes/%s/status" % devis["id"], jeton, {"status": "accepted"})

    # ⚠️ CLAUDE.md §2 nomme la route « /quotes/:id/convert-to-invoice ».
    #    Elle n'existe pas : le contrôleur expose « /quotes/:id/convert ».
    statut, reponse = appeler("POST", "/quotes/%s/convert-to-invoice" % devis["id"], jeton, {})
    constats.append(Constat("la route nommée dans le contrat existe").poser(
        statut is not None and 200 <= statut < 300,
        "`/convert-to-invoice` répond %s ; le contrôleur expose `/convert`" % statut))

    # La facture est rendue sous `data.invoiceCreated`, pas sous `data`.
    conversion = exiger("POST", "/quotes/%s/convert" % devis["id"], jeton, {},
                        "conversion")["data"]
    facture = conversion.get("invoiceCreated") or {}
    apres = exiger("GET", "/quotes/%s" % devis["id"], jeton)["data"]
    lignes = exiger("GET", "/invoices/sales-invoices/%s" % facture["id"],
                    jeton)["data"].get("items", []) if facture.get("id") else []

    constats.append(Constat("une facture est créée, avec les lignes du devis").poser(
        bool(facture.get("id")) and len(lignes) == 1,
        "facture %s, %d ligne(s)" % (facture.get("invoiceNumber"), len(lignes))))
    constats.append(Constat("le devis passe au statut `invoiced`").poser(
        apres["status"] == "invoiced",
        "statut après conversion : `%s`" % apres["status"]))
    return constats


EFFETS = {
    "reception": effet_reception,
    "livraison": effet_livraison,
    "facture-tva": effet_facture_tva,
    "envoi-facture": effet_envoi,
    "reglement": effet_reglement,
    "conversion-devis": effet_conversion,
}


# ─────────────────────────────────────────────────────────────────────────────
# Auto-test
# ─────────────────────────────────────────────────────────────────────────────

def self_test():
    echecs, passes = [], 0

    # ── Le constat porte toujours sa mesure ──
    c = Constat("x").poser(True, "mesuré 3, attendu 3")
    if c.verdict is not True or not c.detail:
        echecs.append("Constat.poser ne conserve pas la mesure")
    else:
        passes += 1
    # ⟵ refus : un constat non posé ne doit pas passer pour vrai.
    if Constat("y").verdict is not None:
        echecs.append("un constat non posé a un verdict")
    else:
        passes += 1

    # ── `nombre` : les montants arrivent en chaîne (« 1190.00 ») ──
    for valeur, attendu in (("1190.00", 1190.0), (7, 7.0), (None, 0.0),
                            ("", 0.0), ("abc", 0.0)):
        # ⟵ les trois derniers sont des refus : une valeur illisible vaut 0,
        #    jamais une exception qui ferait passer le banc pour cassé.
        if nombre(valeur) != attendu:
            echecs.append("nombre(%r) = %r" % (valeur, nombre(valeur)))
        else:
            passes += 1

    # ── Le contrat couvre-t-il exactement les six effets implémentés ? ──
    if set(CONTRAT) != set(EFFETS):
        echecs.append("contrat et sondes divergent : %s"
                      % (set(CONTRAT) ^ set(EFFETS)))
    else:
        passes += 1

    total = passes + len(echecs)
    print("auto-test : %d cas, dont 3 valeurs illisibles qui doivent valoir 0" % total)
    for e in echecs:
        print("  ❌ " + e)
    print("  %d/%d" % (passes, total))
    return not echecs


# ─────────────────────────────────────────────────────────────────────────────


def main():
    if "--self-test" in sys.argv:
        sys.exit(0 if self_test() else 1)
    if "--liste" in sys.argv:
        for cle, (declencheur, effet) in CONTRAT.items():
            print("%-18s %s\n%18s → %s\n" % (cle, declencheur, "", effet))
        return

    if not os.path.exists(MANIFESTE):
        arreter("manifeste absent — lancer ./scripts/provision-decor.sh")
    with open(MANIFESTE, encoding="utf-8") as fh:
        manifeste = json.load(fh)
    compte = manifeste["comptes"][LOCATAIRE]["owner"]
    jeton = connexion(compte["email"], compte["motDePasse"])
    ressources = manifeste["ressources"][LOCATAIRE]
    aujourdhui = time.strftime("%Y-%m-%d")

    print("── banc des effets de bord ──")
    print("   contrat  : CLAUDE.md §2 « SIDE EFFECTS OBLIGATOIRES (non-négociables) »")
    print("   locataire: %s (%s)\n"
          % (LOCATAIRE, manifeste["locataires"][LOCATAIRE]["libelle"]))

    tenus, rompus = 0, []
    for cle, sonde in EFFETS.items():
        declencheur, effet = CONTRAT[cle]
        print("── %s ──" % declencheur)
        print("   contrat : %s" % effet)
        for constat in sonde(jeton, ressources, aujourdhui):
            if constat.verdict:
                tenus += 1
                print("   ✅ %s" % constat.libelle)
            else:
                rompus.append((declencheur, constat))
                print("   ❌ %s" % constat.libelle)
            print("      %s" % constat.detail)
        print()

    total = tenus + len(rompus)
    print("── total, décomposé ──")
    print("   effets mesurés ....... %2d" % total)
    print("   tenus ................ %2d" % tenus)
    print("   rompus ............... %2d" % len(rompus))
    if rompus:
        print("\n❌ le contrat de CLAUDE.md §2 n'est pas tenu sur %d point(s) :"
              % len(rompus))
        for declencheur, constat in rompus:
            print("     %s" % declencheur)
            print("       %s — %s" % (constat.libelle, constat.detail))

    sys.exit(1 if rompus else 0)


if __name__ == "__main__":
    main()
