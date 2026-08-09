#!/usr/bin/env python3
"""Banc des compteurs du tableau de bord — étape 5 du chantier (étage 3).

    « Le compteur affichait 276 ; **aucune liste ne pouvait valoir 276**. »
    — docs/ERREURS.md, E016

Chaque chiffre du tableau de bord qui mène quelque part doit valoir **le total
de la liste où il mène**. Ce banc clique à la place de l'utilisateur : il lit le
compteur, suit le filtre, et compare.

── Pourquoi ce banc, et pourquoi pas un de plus sur la marge ───────────────

**E015 — la marge brute — est déjà couverte**, et bien mieux que ne le ferait
une sonde HTTP : `scripts/verifier-comptabilite.js` démarre le conteneur Nest,
appelle le vrai service, et vérifie l'identité comptable *et* les bornes de
plausibilité. Le redoubler ici créerait deux contrôles qui doivent s'accorder
entre eux — c'est exactement M5, et le jour où ils divergent aucun des deux
n'aurait raison. **On ne le refait pas.**

Ce qui n'est couvert nulle part, c'est **E016** : la correspondance entre un
chiffre et la liste qu'il annonce.

── Contre quoi le résultat est comparé ─────────────────────────────────────

Contre l'**écran**, pas contre le serveur. `DashboardPage.tsx` porte le contrat
en toutes lettres, à côté du tableau qu'il construit :

    « Le travail en attente, dans l'ordre où il presse. Chaque entrée porte le
      filtre qui rendra exactement le nombre annoncé. »

et chaque tuile déclare son `vers:` — `/invoices?status=overdue`,
`/stock?tab=alerts`… C'est cette destination qui **définit** ce que le chiffre
veut dire. Comparer le compteur à la requête qui l'a produit ne prouverait
rien : les deux viennent du même service.

> R022 : rendre un chiffre cliquable est le meilleur moyen de l'obliger à être
> juste. Ce banc est ce qui rend cette obligation exécutable.

── Ce qu'il regarde aussi ──────────────────────────────────────────────────

Les compteurs **servis et lus par personne** (M4) et ceux qui ne peuvent que
valoir zéro parce que rien n'écrit l'état qu'ils comptent (E022).

── Usage ────────────────────────────────────────────────────────────────────

    python3 scripts/banc-compteurs.py --self-test
    python3 scripts/banc-compteurs.py
"""

import json
import os
import sys
import urllib.error
import urllib.request

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE_URL = os.environ.get("BASE_URL", "http://localhost:3000/api/v1")
MANIFESTE = os.environ.get("MANIFESTE", os.path.join(RACINE, ".decor", "manifeste.json"))
# Le locataire A porte le jeu de démonstration — 1007 factures, 301 clients.
# Un compteur ne se juge pas sur trois lignes : il faut du volume pour qu'un
# écart de définition se voie.
LOCATAIRE = os.environ.get("LOCATAIRE", "A")

# ─────────────────────────────────────────────────────────────────────────────
# Les compteurs cliquables, et la liste où l'écran les envoie
#
# ⚠️ La colonne « vers » est recopiée de `DashboardPage.tsx`, champ `vers:`.
# Elle n'est pas déduite du service qui produit le chiffre — ce serait
# comparer le serveur à lui-même.
# ─────────────────────────────────────────────────────────────────────────────

CLIQUABLES = [
    {
        "compteur": "alerts.overdueInvoicesCount",
        "ecran": "/invoices?status=overdue",
        "liste": "/invoices/sales-invoices?status=overdue&limit=1",
        "total": lambda r: r["pagination"]["total"],
    },
    {
        "compteur": "alerts.sentInvoicesCount",
        "ecran": "/invoices?status=sent",
        "liste": "/invoices/sales-invoices?status=sent&limit=1",
        "total": lambda r: r["pagination"]["total"],
    },
    {
        "compteur": "alerts.partialInvoicesCount",
        "ecran": "/invoices?status=partial",
        "liste": "/invoices/sales-invoices?status=partial&limit=1",
        "total": lambda r: r["pagination"]["total"],
    },
    {
        "compteur": "alerts.expiringStockCount",
        "ecran": "/stock?tab=alerts",
        "liste": "/stock/alerts",
        "total": lambda r: len(r["data"]["expiringSoon"]),
    },
    {
        "compteur": "alerts.lowStockCount",
        "ecran": "/stock?tab=alerts",
        "liste": "/stock/alerts",
        "total": lambda r: len(r["data"]["lowStock"]),
    },
]

# La ventilation par statut de la période : chaque case doit valoir la liste
# filtrée sur le même statut **et la même période**.
VENTILATION = "sales.byStatus"
LISTE_VENTILATION = "/invoices/sales-invoices?status=%s&dateFrom=%s&dateTo=%s&limit=1"

# Ce que le serveur sert et que plus personne ne lit (M4, R022). Vérifié par
# `grep` sur `client/src` et `shared/src` : aucune occurrence hors traduction.
ORPHELINS = {
    "alerts.unpaidInvoicesCount":
        "remplacé par `sentInvoicesCount` + `partialInvoicesCount` en corrigeant "
        "E016 ; l'ancien champ est resté servi, et la clé `dashboard.unpaidInvoices` "
        "reste traduite en deux langues. R022 : ce qui n'a plus d'appelant se supprime",
    "alerts.unpaidInvoicesTotal": "idem",
}

# Les compteurs qui ne peuvent que valoir zéro, parce que rien n'écrit l'état.
TOUJOURS_NULS = {
    "stock.byStatus.reserved.count":
        "aucun chemin d'écriture ne pose `reserved` — voir E022 ①",
    "stock.byStatus.reserved.value": "idem",
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
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read())
        except Exception:
            return e.code, {}
    except Exception as e:
        return None, {"_erreur": str(e)}


def exiger(chemin, jeton):
    statut, reponse = appeler("GET", chemin, jeton)
    if statut != 200:
        arreter("GET %s → %s" % (chemin, statut))
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


def chemin_valeur(objet, chemin):
    """Lit « alerts.lowStockCount » dans une réponse imbriquée.

    ⚠️ Rend `None` quand le chemin n'existe pas — jamais 0. Confondre « absent »
    et « zéro » ferait passer un compteur disparu pour un compteur à zéro, et
    c'est précisément l'information qui compte (M3).
    """
    courant = objet
    for morceau in chemin.split("."):
        if not isinstance(courant, dict) or morceau not in courant:
            return None
        courant = courant[morceau]
    return courant


# ─────────────────────────────────────────────────────────────────────────────


def self_test():
    echecs, passes = [], 0

    arbre = {"alerts": {"lowStockCount": 9, "zero": 0},
             "sales": {"byStatus": {"draft": 27}}}
    for chemin, attendu in (
        ("alerts.lowStockCount", 9),
        ("sales.byStatus.draft", 27),
        ("alerts.zero", 0),
        # ⟵ les trois suivants sont des refus : un chemin absent ne vaut pas 0.
        ("alerts.inexistant", None),
        ("rien.du.tout", None),
        ("alerts.lowStockCount.trop.loin", None),
    ):
        obtenu = chemin_valeur(arbre, chemin)
        if obtenu != attendu:
            echecs.append("chemin_valeur(%s) = %r, attendu %r" % (chemin, obtenu, attendu))
        else:
            passes += 1

    # ⚠️ Distinguer « absent » de « zéro » n'a de sens que si le banc les traite
    #    différemment. On l'éprouve.
    if chemin_valeur(arbre, "alerts.zero") == chemin_valeur(arbre, "alerts.inexistant"):
        echecs.append("« absent » et « zéro » sont confondus")
    else:
        passes += 1

    # ── Les extracteurs de total lisent-ils la bonne forme ? ──
    for entree, faux, attendu in (
        (CLIQUABLES[0], {"pagination": {"total": 381}}, 381),
        (CLIQUABLES[3], {"data": {"expiringSoon": [1, 2, 3], "lowStock": []}}, 3),
        (CLIQUABLES[4], {"data": {"expiringSoon": [1, 2, 3], "lowStock": []}}, 0),
    ):
        obtenu = entree["total"](faux)
        if obtenu != attendu:
            echecs.append("%s : total lu %r, attendu %r"
                          % (entree["compteur"], obtenu, attendu))
        else:
            passes += 1

    total = passes + len(echecs)
    print("auto-test : %d cas, dont 3 chemins absents qui ne doivent PAS valoir 0" % total)
    for e in echecs:
        print("  ❌ " + e)
    print("  %d/%d" % (passes, total))
    return not echecs


# ─────────────────────────────────────────────────────────────────────────────


def main():
    if "--self-test" in sys.argv:
        sys.exit(0 if self_test() else 1)

    if not os.path.exists(MANIFESTE):
        arreter("manifeste absent — lancer ./scripts/provision-decor.sh")
    with open(MANIFESTE, encoding="utf-8") as fh:
        manifeste = json.load(fh)
    compte = manifeste["comptes"][LOCATAIRE]["owner"]
    jeton = connexion(compte["email"], compte["motDePasse"])

    stats = exiger("/dashboard/stats", jeton)["data"]
    periode = stats["period"]

    print("── banc des compteurs ──")
    print("   locataire : %s (%s)" % (LOCATAIRE, manifeste["locataires"][LOCATAIRE]["libelle"]))
    print("   attendu   : la destination que l'écran donne au chiffre")
    print("               (DashboardPage.tsx, champ `vers:`)")
    print("   période   : %s → %s\n" % (periode["dateFrom"], periode["dateTo"]))

    justes, faux, absents = 0, [], []
    cache = {}

    print("── compteurs cliquables ──")
    for entree in CLIQUABLES:
        annonce = chemin_valeur(stats, entree["compteur"])
        if annonce is None:
            absents.append("%s — servi par aucune réponse ; la tuile de l'écran "
                           "affichera 0 sans que rien ne le signale" % entree["compteur"])
            print("   ⚠️  %-34s ABSENT de /dashboard/stats" % entree["compteur"])
            continue
        if entree["liste"] not in cache:
            cache[entree["liste"]] = exiger(entree["liste"], jeton)
        reel = entree["total"](cache[entree["liste"]])
        if int(annonce) == int(reel):
            justes += 1
            print("   ✅ %-34s %6d = la liste %s" % (entree["compteur"], annonce, entree["ecran"]))
        else:
            faux.append("%s annonce %s ; %s en contient %s"
                        % (entree["compteur"], annonce, entree["ecran"], reel))
            print("   ❌ %-34s %6d ≠ %-6d %s" % (entree["compteur"], annonce, reel, entree["ecran"]))

    print("\n── ventilation par statut de la période ──")
    ventilation = chemin_valeur(stats, VENTILATION) or {}
    for statut, annonce in sorted(ventilation.items()):
        reponse = exiger(LISTE_VENTILATION % (statut, periode["dateFrom"], periode["dateTo"]), jeton)
        reel = reponse["pagination"]["total"]
        if int(annonce) == int(reel):
            justes += 1
            print("   ✅ %-34s %6d = la liste filtrée" % ("%s.%s" % (VENTILATION, statut), annonce))
        else:
            faux.append("%s.%s annonce %s ; la liste filtrée sur la même période "
                        "en contient %s" % (VENTILATION, statut, annonce, reel))
            print("   ❌ %-34s %6d ≠ %-6d" % ("%s.%s" % (VENTILATION, statut), annonce, reel))

    print("\n── compteurs qui ne peuvent que valoir zéro ──")
    for chemin, raison in sorted(TOUJOURS_NULS.items()):
        valeur = chemin_valeur(stats, chemin)
        marque = "❌" if valeur == 0 else "✅"
        print("   %s %-34s %s — %s" % (marque, chemin, valeur, raison))

    print("\n── servis, lus par personne (M4 / R022) ──")
    for chemin, raison in sorted(ORPHELINS.items()):
        valeur = chemin_valeur(stats, chemin)
        etat = "encore servi (%s)" % valeur if valeur is not None else "retiré ✅"
        print("   %-36s %s" % (chemin, etat))
        if valeur is not None:
            print("      %s" % raison)

    encore_orphelins = [c for c in ORPHELINS if chemin_valeur(stats, c) is not None]
    zeros = [c for c in TOUJOURS_NULS if chemin_valeur(stats, c) == 0]

    print("\n── total, décomposé ──")
    print("   compteurs vérifiés contre leur liste ... %2d" % (justes + len(faux)))
    print("   justes ................................. %2d" % justes)
    print("   faux ................................... %2d" % len(faux))
    print("   annoncés par l'écran, absents de l'API . %2d" % len(absents))
    print("   à zéro perpétuel ....................... %2d" % len(zeros))
    print("   servis sans appelant ................... %2d" % len(encore_orphelins))

    if faux:
        print("\n❌ %d compteur(s) ne valent pas la liste où ils mènent :" % len(faux))
        for e in faux:
            print("     " + e)
    if absents:
        print("\n⚠️  %d compteur(s) attendus par l'écran et absents de la réponse :" % len(absents))
        for e in absents:
            print("     " + e)

    sys.exit(1 if faux or absents or zeros or encore_orphelins else 0)


if __name__ == "__main__":
    main()
