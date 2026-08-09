#!/usr/bin/env python3
"""Banc de la matrice des rôles — étape 4 du chantier (étage 3).

Chaque route, appelée par chacun des cinq personas. Autorisé, ou refusé ?

── Contre quoi le résultat est comparé, et pourquoi pas contre `@Roles` ─────

Comparer le comportement observé aux décorateurs `@Roles` serait comparer le
code à lui-même : les deux seraient toujours d'accord, et le banc n'aurait
montré que sa capacité à dire oui (M2, R030). Un `@Roles` trop permissif
passerait au vert en emportant le banc avec lui.

L'attendu vient donc d'une **source indépendante** : le tableau de permissions
de `docs/specs/02-auth.md` §« Roles & Permissions Matrix ». C'est une politique
écrite, en français humain, qui n'a jamais été dérivée du code.

    | Permission           | owner | manager | agent   |
    | View all resources   | Yes   | Yes     | Partial |
    | Create invoices / BL | Yes   | Yes     | Yes     |
    | Edit all resources   | Yes   | Yes     | No      |
    | Delete resources     | Yes   | No      | No      |
    | Approve expenses     | Yes   | Yes     | No      |
    | Manage users         | Yes   | No      | No      |
    | Change settings      | Yes   | No      | No      |
    | View dashboard/rep.  | Yes   | Yes     | No      |

    « Agent scope: Can only create and view DeliveryNote and SalesInvoice.
      All other module routes return 403. »

Un écart ne dit pas lequel des deux a tort. Il dit qu'ils ne disent pas la même
chose, et que quelqu'un doit trancher — c'est R031 : un document périmé et un
code fautif se ressemblent, seule l'arbitrage les distingue.

⚠️ **`accountant` n'existe dans aucune politique écrite.** Ni dans ce tableau,
ni dans `CLAUDE.md` §4, ni dans les specs. Le rôle existe pourtant en base, dans
l'énumération, et dans 60 décorateurs. Le banc ne peut donc rien attendre de
lui : il **publie ce qu'il observe**, et c'est au produit d'écrire la règle.

── Ce qui distingue un refus de rôle d'un autre refus ──────────────────────

`errors.forbidden` n'est levé qu'à un seul endroit du dépôt :
`RolesGuard.canActivate`. Vérifié par `grep`, pas de mémoire. Les autres 403
portent leur propre clé — `errors.admin_only`, `errors.plan_feature_disabled`,
`errors.superadmin_cannot_access_tenant_routes` — et disent donc quel garde a
parlé. Le message **est** le discriminant.

── Ce que ce banc ne prouve pas ────────────────────────────────────────────

Qu'un rôle autorisé peut **réellement** faire la chose. Les sondes portent un
identifiant inexistant et un corps vide : elles franchissent — ou non — le
garde de rôle, puis meurent en 404 ou en 400, ce qui est sans importance ici.
« Autorisé » signifie donc **« le garde de rôle a laissé passer »**, et rien de
plus. C'est ce qui rend ce banc sûr : aucune sonde ne peut modifier de donnée.

── Usage ────────────────────────────────────────────────────────────────────

    python3 scripts/banc-matrice-roles.py --self-test   # d'abord, et c'est bloquant
    python3 scripts/banc-matrice-roles.py               # le banc
    python3 scripts/banc-matrice-roles.py --matrice     # la grille observée, entière

Prérequis : `scripts/provision-decor.sh` a tourné — les cinq personas des deux
locataires en viennent.
"""

import importlib.util
import json
import os
import sys
import time
import urllib.error
import urllib.request

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

BASE_URL = os.environ.get("BASE_URL", "http://localhost:3000/api/v1")
SRC_DIR = os.environ.get("SRC_DIR", os.path.join(RACINE, "src"))
MANIFESTE = os.environ.get("MANIFESTE", os.path.join(RACINE, ".decor", "manifeste.json"))
PACE_SECONDS = float(os.environ.get("PACE_SECONDS", "0.12"))

_spec = importlib.util.spec_from_file_location(
    "banc_refus", os.path.join(os.path.dirname(os.path.abspath(__file__)),
                               "banc-refus-http.py"))
_frontiere = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_frontiere)
toutes_les_routes = _frontiere.toutes_les_routes
url_sondable = _frontiere.url_sondable
ROUTES_PUBLIQUES = _frontiere.ROUTES_PUBLIQUES

PERSONAS = ["owner", "manager", "agent", "accountant", "superadmin"]

# ─────────────────────────────────────────────────────────────────────────────
# Les routes écartées de la matrice, épinglées avec leur raison
# ─────────────────────────────────────────────────────────────────────────────

EXCLUES = dict(
    [(cle, "publique (R023) — aucun rôle n'y est demandé, donc aucune matrice "
            "à éprouver") for cle in ROUTES_PUBLIQUES]
    + [
        (("GET", "/auth/me"),
         "route de session, pas une route de module : la politique écrite borne "
         "la portée de l'agent aux « module routes ». Savoir qui l'on est n'en "
         "est pas une"),
        (("POST", "/auth/logout"),
         "idem — se déconnecter n'est pas un geste de module"),
    ]
)

# ─────────────────────────────────────────────────────────────────────────────
# La politique ÉCRITE, transcrite en prédicats
#
# ⚠️ Chaque branche cite la ligne du tableau qu'elle applique. Une règle sans sa
# citation serait une règle inventée ici, et le banc comparerait le code à
# l'opinion de son auteur.
# ─────────────────────────────────────────────────────────────────────────────

AUTORISE, REFUSE, NON_SPECIFIE = "autorisé", "refusé", "non spécifié"

# ── § « manager — les trois exceptions, nommément », exception 1 ──
# Les entités qui portent de l'historique : les supprimer efface une trace,
# sans reprise possible. Réservées au propriétaire.
SUPPRESSIONS_RESERVEES = {
    "/customers/:id", "/suppliers/:id", "/products/:id", "/quotes/:id",
    "/deliveries/delivery-notes/:id", "/invoices/sales-invoices/:id",
    "/invoices/credit-notes/:id", "/invoices/recurring/:id",
    "/purchases/purchase-orders/:id", "/purchases/vendor-bills/:id",
}

# ── § « agent — la portée exacte » ──
# Les agrégats : le chiffre d'affaires, la marge et la balance âgée ne relèvent
# pas du poste de saisie.
AGREGATS = ("/dashboard", "/reports", "/export", "/expenses/summary",
            "/production/dashboard")

ECRITURES_AGENT = {
    ("POST", "/deliveries/delivery-notes"),
    ("PUT", "/deliveries/delivery-notes/:id"),
    ("PATCH", "/deliveries/delivery-notes/:id/signature"),
    ("POST", "/invoices/sales-invoices"),
    ("PUT", "/invoices/sales-invoices/:id"),
    ("POST", "/quotes"),
    ("POST", "/expenses"),
    ("PUT", "/expenses/:id"),
    ("POST", "/production/orders/:id/movements"),
    ("POST", "/production/orders/:id/movements/batch"),
}


def attendu(persona, methode, chemin):
    """Transcription de `docs/specs/02-auth.md` §Roles & Permissions Matrix.

    ⚠️ Chaque branche applique une phrase de la spec, et la cite. Ce que ce
    banc compare, c'est le **code au document** — jamais le code à lui-même
    (M2). Si la spec change, ce bloc doit changer avec elle : c'est un couple
    assumé au sens de R029, et il est écrit ici plutôt que tu.
    """
    administration = chemin.startswith("/admin/")

    if persona == "superadmin":
        # « la console d'administration et rien d'autre — TenantGuard le refuse
        #   partout ailleurs, car il n'a pas de locataire »
        return AUTORISE if administration else REFUSE
    if administration:
        return REFUSE

    if persona == "owner":
        return AUTORISE                       # « tout, sauf la console »

    if persona == "accountant":
        # « Les 67 routes de lecture hors administration lui sont ouvertes.
        #   Aucune route d'écriture. Pas une exception dans un sens ni dans
        #   l'autre. »
        return AUTORISE if methode == "GET" else REFUSE

    if persona == "manager":
        if methode == "DELETE" and chemin in SUPPRESSIONS_RESERVEES:
            return REFUSE                     # exception 1 — les dix nommées
        if methode == "PATCH" and chemin == "/users/:id":
            return REFUSE                     # exception 2 — modifier un compte
        if methode == "PUT" and chemin == "/settings":
            return REFUSE                     # exception 3 — les réglages
        return AUTORISE

    if persona == "agent":
        if methode == "GET":
            # « Il lit tout, sauf les agrégats et les comptes. »
            if chemin.startswith("/users") or chemin.startswith(AGREGATS):
                return REFUSE
            return AUTORISE
        # « Il écrit sur dix routes, et seulement celles-là. »
        return AUTORISE if (methode, chemin) in ECRITURES_AGENT else REFUSE

    raise AssertionError("persona inconnu : %s" % persona)


# ─────────────────────────────────────────────────────────────────────────────


def arreter(message):
    print("❌ " + message)
    sys.exit(2)


def connexion(email, motdepasse, chemin="/auth/login"):
    corps = json.dumps({"email": email, "password": motdepasse}).encode()
    req = urllib.request.Request(BASE_URL + chemin, data=corps, method="POST")
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return json.loads(r.read())["data"]["accessToken"]
    except urllib.error.HTTPError as e:
        if e.code == 429:
            arreter("plafond atteint sur %s — ce n'est pas un défaut "
                    "d'authentification (M9). Attendre, puis rejouer." % chemin)
        arreter("connexion refusée sur %s (%s) pour %s" % (chemin, e.code, email))


def appeler(methode, chemin, jeton):
    """Rend (statut, message). Corps vide, identifiant inexistant : la sonde
    franchit le garde de rôle ou meurt dessus, sans jamais rien modifier."""
    corps = b"{}" if methode in ("POST", "PUT", "PATCH") else None
    req = urllib.request.Request(BASE_URL + chemin, data=corps, method=methode)
    req.add_header("Authorization", "Bearer " + jeton)
    if corps is not None:
        req.add_header("Content-Type", "application/json")
    for essai in range(3):
        try:
            with urllib.request.urlopen(req, timeout=25) as r:
                return r.status, None
        except urllib.error.HTTPError as e:
            brut = e.read(4000)
            try:
                message = json.loads(brut).get("message")
            except Exception:
                message = None
            if e.code == 429 and essai < 2:
                print("   ⏳ 429 — plafond, pas un refus. Attente 20 s.")
                time.sleep(20)
                continue
            return e.code, message
        except Exception as e:
            return None, "ERREUR_RESEAU: %s" % e
    return 429, "throttle"


def observer(statut, message):
    """Traduit une réponse en « autorisé » ou « refusé », et par quel garde.

    ⚠️ Tout 403 n'est pas un refus de rôle. `errors.forbidden` n'est levé que
    par RolesGuard ; les autres gardes portent leur propre clé, et confondre
    les deux ferait passer pour une règle de rôle ce qui est une règle de
    locataire, de plan, ou d'administration.
    """
    if statut == 403:
        if message == "errors.forbidden":
            return REFUSE, "rôle"
        if message == "errors.superadmin_cannot_access_tenant_routes":
            return REFUSE, "locataire"
        if message == "errors.admin_only":
            return REFUSE, "administration"
        if message in ("errors.plan_feature_disabled", "production_module_disabled"):
            return REFUSE, "plan/module"
        return REFUSE, "autre 403 (%s)" % message
    if statut is None:
        return "erreur", str(message)
    # 404, 400, 422, 2xx… : le garde de rôle a laissé passer. Ce qui arrive
    # ensuite ne regarde pas ce banc.
    return AUTORISE, ""


# ─────────────────────────────────────────────────────────────────────────────
# Auto-test — autant de cas qui doivent refuser que de cas qui doivent passer
# ─────────────────────────────────────────────────────────────────────────────

def self_test():
    echecs, passes = [], 0

    cas = [
        # ── owner : tout, sauf la console d'administration ──
        ("owner", "DELETE", "/customers/:id", AUTORISE),
        ("owner", "PUT", "/settings", AUTORISE),
        ("owner", "GET", "/admin/tenants", REFUSE),

        # ── manager : les trois exceptions, et rien qu'elles ──
        ("manager", "GET", "/customers", AUTORISE),
        ("manager", "POST", "/customers", AUTORISE),
        ("manager", "DELETE", "/customers/:id", REFUSE),       # entité principale
        ("manager", "DELETE", "/quotes/:id", REFUSE),
        # ⚠️ Le cas qui distingue la règle d'un « pas de suppression » global :
        #    ce qui se reprend se supprime.
        ("manager", "DELETE", "/invoices/payments/:id", AUTORISE),
        ("manager", "DELETE", "/customers/:id/contacts/:contactId", AUTORISE),
        ("manager", "PATCH", "/users/:id", REFUSE),            # modifier un compte
        ("manager", "GET", "/users", AUTORISE),                # lire n'est pas gérer
        ("manager", "PUT", "/settings", REFUSE),
        ("manager", "GET", "/settings", AUTORISE),
        ("manager", "GET", "/reports/sales", AUTORISE),

        # ── agent : lit tout sauf les agrégats et les comptes ──
        ("agent", "GET", "/customers", AUTORISE),
        ("agent", "GET", "/purchases/vendor-bills/:id/pdf", AUTORISE),
        ("agent", "GET", "/dashboard/stats", REFUSE),          # agrégat
        ("agent", "GET", "/reports/tax-summary", REFUSE),      # agrégat
        ("agent", "GET", "/export/:dataset", REFUSE),          # agrégat
        ("agent", "GET", "/expenses/summary", REFUSE),         # agrégat
        # ⚠️ ...mais /expenses et /expenses/:id ne sont PAS des agrégats : le
        #    préfixe seul ne suffit pas à trancher.
        ("agent", "GET", "/expenses", AUTORISE),
        ("agent", "GET", "/expenses/:id", AUTORISE),
        ("agent", "GET", "/users/quota", REFUSE),              # comptes
        # ── agent : dix écritures, et seulement celles-là ──
        ("agent", "POST", "/deliveries/delivery-notes", AUTORISE),
        ("agent", "PUT", "/invoices/sales-invoices/:id", AUTORISE),
        ("agent", "POST", "/quotes", AUTORISE),
        ("agent", "PUT", "/quotes/:id", REFUSE),               # l'asymétrie consignée
        ("agent", "POST", "/deliveries/delivery-notes/:id/send-email", REFUSE),
        ("agent", "POST", "/deliveries/delivery-notes/:id/create-invoice", REFUSE),
        ("agent", "DELETE", "/deliveries/delivery-notes/:id", REFUSE),

        # ── accountant : toute lecture, aucune écriture, sans exception ──
        ("accountant", "GET", "/reports/sales", AUTORISE),
        ("accountant", "GET", "/customers/:id", AUTORISE),
        ("accountant", "POST", "/customers", REFUSE),
        ("accountant", "DELETE", "/customers/:id", REFUSE),
        ("accountant", "PUT", "/settings", REFUSE),
        ("accountant", "GET", "/admin/tenants", REFUSE),       # la console reste close

        # ── superadmin : la console, et seulement elle ──
        ("superadmin", "GET", "/admin/tenants", AUTORISE),
        ("superadmin", "PATCH", "/admin/subscriptions/:id", AUTORISE),
        ("superadmin", "GET", "/customers", REFUSE),
    ]
    for persona, methode, chemin, veut in cas:
        obtenu = attendu(persona, methode, chemin)
        if obtenu != veut:
            echecs.append("attendu(%s, %s %s) = %s, voulu %s"
                          % (persona, methode, chemin, obtenu, veut))
        else:
            passes += 1

    # ── La lecture des réponses, avec ses cas de refus ──
    for statut, message, veut_verdict, veut_garde in (
        (403, "errors.forbidden", REFUSE, "rôle"),
        (403, "errors.admin_only", REFUSE, "administration"),
        (403, "errors.superadmin_cannot_access_tenant_routes", REFUSE, "locataire"),
        # ⟵ Les quatre suivants NE DOIVENT PAS être lus comme un refus de rôle.
        (404, "errors.customer_not_found", AUTORISE, ""),
        (400, ["champ invalide"], AUTORISE, ""),
        (200, None, AUTORISE, ""),
        (422, "errors.quote_not_accepted", AUTORISE, ""),
    ):
        verdict, garde = observer(statut, message)
        if (verdict, garde) != (veut_verdict, veut_garde):
            echecs.append("observer(%s, %r) = (%s, %s)"
                          % (statut, message, verdict, garde))
        else:
            passes += 1

    total = passes + len(echecs)
    print("auto-test : %d cas, dont 4 réponses qui NE sont pas un refus de rôle"
          % total)
    for e in echecs:
        print("  ❌ " + e)
    print("  %d/%d" % (passes, total))
    return not echecs


# ─────────────────────────────────────────────────────────────────────────────


def main():
    if "--self-test" in sys.argv:
        sys.exit(0 if self_test() else 1)

    routes = toutes_les_routes(SRC_DIR)
    cibles = [(m, c) for m, c, _ in routes if (m, c) not in EXCLUES]

    if not os.path.exists(MANIFESTE):
        arreter("manifeste absent — lancer ./scripts/provision-decor.sh")
    with open(MANIFESTE, encoding="utf-8") as fh:
        manifeste = json.load(fh)
    comptes = manifeste["comptes"]

    jetons = {}
    for persona in ("owner", "manager", "agent", "accountant"):
        compte = comptes["A"][persona]
        jetons[persona] = connexion(compte["email"], compte["motDePasse"])
    jetons["superadmin"] = connexion(comptes["superadmin"]["email"],
                                     comptes["superadmin"]["motDePasse"],
                                     "/admin/auth/login")

    print("── matrice des rôles ──")
    print("   %d routes × %d personas = %d sondes"
          % (len(cibles), len(PERSONAS), len(cibles) * len(PERSONAS)))
    print("   attendu : docs/specs/02-auth.md §Roles & Permissions Matrix")
    print("   %d route(s) écartée(s), nommées plus bas\n" % len(EXCLUES))

    grille = {}
    for methode, chemin in cibles:
        url = url_sondable(chemin)
        for persona in PERSONAS:
            statut, message = appeler(methode, url, jetons[persona])
            time.sleep(PACE_SECONDS)
            grille[(methode, chemin, persona)] = observer(statut, message)

    if "--matrice" in sys.argv:
        entete = "".join("%-12s" % p for p in PERSONAS)
        print("%-6s %-46s %s" % ("verbe", "chemin", entete))
        for methode, chemin in cibles:
            cases = "".join("%-12s" % grille[(methode, chemin, p)][0][:11]
                            for p in PERSONAS)
            print("%-6s %-46s %s" % (methode, chemin, cases))
        return

    # ─────────────────────────────────────────────────────────────────────────
    conformes = {p: 0 for p in PERSONAS}
    ecarts = {p: [] for p in PERSONAS}
    erreurs = []

    for methode, chemin in cibles:
        for persona in PERSONAS:
            verdict, garde = grille[(methode, chemin, persona)]
            if verdict == "erreur":
                erreurs.append("%s %s [%s] — %s" % (methode, chemin, persona, garde))
                continue
            veut = attendu(persona, methode, chemin)
            if verdict == veut:
                conformes[persona] += 1
            else:
                ecarts[persona].append(
                    "%-6s %-44s politique : %-9s observé : %s%s"
                    % (methode, chemin, veut, verdict,
                       " (par le garde de %s)" % garde if garde else ""))

    print("── conformité à la politique écrite ──")
    for persona in PERSONAS:
        total = conformes[persona] + len(ecarts[persona])
        print("   %-11s  %3d / %3d" % (persona, conformes[persona], total))

    print("\n   écartées de la matrice :")
    for methode, chemin in sorted(EXCLUES):
        print("     %-6s %-44s %s" % (methode, chemin, EXCLUES[(methode, chemin)][:62]))

    total_ecarts = sum(len(v) for v in ecarts.values())
    if total_ecarts:
        print("\n❌ %d écart(s) entre la politique écrite et le comportement." % total_ecarts)
        print("   Un écart ne dit pas lequel des deux a tort : il dit qu'ils ne")
        print("   disent pas la même chose (R031).")
        for persona in PERSONAS:
            if not ecarts[persona]:
                continue
            print("\n   ── %s — %d écart(s) ──" % (persona, len(ecarts[persona])))
            for e in ecarts[persona]:
                print("     " + e)

    if erreurs:
        print("\n⚠️  %d sonde(s) sans réponse exploitable :" % len(erreurs))
        for e in erreurs:
            print("     " + e)

    sys.exit(1 if total_ecarts or erreurs else 0)


if __name__ == "__main__":
    main()
