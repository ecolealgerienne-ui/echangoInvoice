#!/usr/bin/env python3
"""Banc de refus de la frontière HTTP — étape 2 du chantier (étage 3).

Chaque route est appelée trois fois : **sans jeton**, avec le jeton d'un
**autre rôle**, et avec un **jeton expiré**. Les trois doivent être refusées.

── Pourquoi les routes sont énumérées depuis la source ──────────────────────

Une liste écrite à la main aurait exactement le défaut qu'elle prétend
corriger : la route ajoutée demain n'y serait pas.

⚠️ **Et pourquoi l'énumération ne part PAS des décorateurs de protection**
(mode M11). Un banc qui énumérerait « les routes protégées » depuis leur
`@UseGuards` verrait l'ensemble RÉTRÉCIR quand on ouvre une route — le total
tomberait sans qu'une seule assertion passe au rouge. On énumère donc TOUTES
les routes ; les ouvertes sont **épinglées nommément** ci-dessous.

C'est structurant ici : il n'existe aucun garde d'authentification global
(R023), chaque contrôleur pose le sien. **La route qu'on oublie est OUVERTE**,
et l'oubli ne se voit ni à la compilation, ni à l'exécution, ni dans les
journaux. Ce banc est le seul endroit où il devient visible.

── Le choix du « jeton d'un autre rôle » ────────────────────────────────────

Il ne se déduit pas de `@Roles(...)`. Ce serait prendre la cible dans la donnée
examinée : sur une route ouverte aux quatre rôles, aucun rôle n'est « autre »,
et sur une route dont le `@Roles` est trop permissif, la sonde choisirait
justement un rôle autorisé. On s'appuie donc sur un fait de **routage**, pas de
décoration :

    route de locataire (tout sauf /admin/…) → jeton **superadmin**
    route d'administration (/admin/…)       → jeton **owner**

Un superadmin n'a pas de locataire et n'a rien à faire sur une route de
locataire ; un owner n'est pas superadmin. Aucune des deux n'est jamais
légitime, quelle que soit la matrice des rôles — que le banc de l'étape 4
éprouvera route par route.

Une route qui **accepte** ce jeton est soit un défaut, soit une décision : dans
le second cas elle est épinglée dans `ROUTES_SANS_RESTRICTION_DE_ROLE`, avec sa
raison. Même mécanique que pour les routes publiques, et même motif : rendre
l'oubli discernable de la décision.

── Ce que le banc contrôle, et ce qu'il ne contrôle pas ─────────────────────

Sur un refus **403**, le message doit être une clé que l'interface sait
traduire (R006) : un refus que l'application affiche « une erreur est survenue »
n'apprend rien à celui qui le reçoit. C'est contrôlé.

Sur un refus **401**, le message rendu par Passport est `"Unauthorized"`, qui
n'est pas une clé. Ce n'est **pas** compté comme un défaut, et c'est délibéré :
l'intercepteur du client (`shared/src/api/client.ts`) traite tout 401 par un
rafraîchissement de jeton puis, s'il échoue, par `onSessionExpired()`. Le
message n'atteint jamais l'utilisateur. Vérifié avant d'écrire cette ligne —
sans quoi le banc aurait rougi 338 fois sur un non-défaut.

── Usage ────────────────────────────────────────────────────────────────────

    python3 scripts/banc-refus-http.py --self-test   # d'abord, et c'est bloquant
    python3 scripts/banc-refus-http.py --list        # les routes vues, sans rien appeler
    python3 scripts/banc-refus-http.py               # le banc

    PACE_SECONDS=0.4 python3 scripts/banc-refus-http.py   # si le débit plafonne (M9)

Prérequis : `scripts/provision-decor.sh` a tourné (le banc lit ses comptes dans
`.decor/manifeste.json` ; il n'en connaît aucun en dur).
"""

import base64
import hashlib
import hmac
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
FR_JSON = os.path.join(RACINE, "shared", "src", "i18n", "fr.json")

# Le plafond global est de 600 requêtes par minute (`ThrottlerModule.forRoot`
# dans app.module.ts — et non 100, que R023 annonce encore). 169 routes × 3
# sondes = 507 appels : 0.15 s entre deux tient largement sous la borne.
PACE_SECONDS = float(os.environ.get("PACE_SECONDS", "0.15"))

# ─────────────────────────────────────────────────────────────────────────────
# Les routes ouvertes, épinglées une par une AVEC leur justification (R023)
#
# ⚠️ Ne jamais y ajouter une entrée pour faire passer le banc : une route
# publique est la seule surface qu'un inconnu peut marteler.
# ─────────────────────────────────────────────────────────────────────────────

ROUTES_PUBLIQUES = {
    ("GET", "/health"):
        "sonde de connectivité mobile (spec 17 §3.2) — un jeton expiré ne doit "
        "pas passer pour une panne réseau",
    ("POST", "/auth/login"):
        "délivre le jeton ; @Throttle 10/min (R017)",
    ("POST", "/auth/register"):
        "délivre le jeton ; @Throttle 5/min (R017)",
    ("POST", "/auth/refresh"):
        "délivre le jeton ; @Throttle 20/min (R017)",
    ("POST", "/auth/accept-invite"):
        "l'invité n'a pas encore de compte — c'est cet appel qui le crée ; "
        "protégé par un jeton d'invitation de 48 octets, à usage unique, "
        "expirant en 7 jours",
    ("POST", "/admin/auth/login"):
        "idem pour le superadmin ; @Throttle 5 / 15 min",
    ("POST", "/admin/auth/refresh"):
        "idem pour le superadmin ; @Throttle 5 / 15 min",
    ("GET", "/verify/:type/:id/:signature"):
        "vérification d'un document depuis son QR — celui qui scanne est le "
        "destinataire, il n'a pas de compte. Protégée par une signature HMAC ; "
        "rend 404 et non 403 sur signature invalide, pour ne pas révéler qu'un "
        "document existe à cet identifiant",
}

# ─────────────────────────────────────────────────────────────────────────────
# Les routes qu'aucun rôle ne peut se voir refuser, épinglées avec leur raison
#
# Elles sont authentifiées — la sonde « sans jeton » et la sonde « jeton
# expiré » s'y appliquent normalement. Seule la sonde « autre rôle » n'a rien
# à y prouver, parce qu'elles n'ont, par construction, pas de rôle à exiger.
# ─────────────────────────────────────────────────────────────────────────────

ROUTES_SANS_RESTRICTION_DE_ROLE = {
    ("GET", "/auth/me"):
        "rend le compte connecté, quel qu'il soit — un superadmin a le droit de "
        "savoir qui il est",
    ("POST", "/auth/logout"):
        "révoque le jeton de rafraîchissement du porteur ; le refuser à un rôle "
        "reviendrait à lui interdire de se déconnecter",
}

# ─────────────────────────────────────────────────────────────────────────────
# Énumération des routes depuis la source
# ─────────────────────────────────────────────────────────────────────────────

_CONTROLLER = re.compile(r"^\s*@Controller\(\s*(?:'([^']*)'|\"([^\"]*)\")?", re.M)
_METHODE = re.compile(
    r"^\s*@(Get|Post|Put|Patch|Delete)\(\s*(?:'([^']*)'|\"([^\"]*)\")?\s*\)", re.M
)
_GARDE = re.compile(r"@UseGuards\(")
_CLASSE = re.compile(r"^\s*(?:export\s+)?(?:abstract\s+)?class\s", re.M)

_COMMENTAIRE_BLOC = re.compile(r"/\*[\s\S]*?\*/")
_COMMENTAIRE_LIGNE = re.compile(r"//[^\n]*")


def routes_du_source(texte):
    """Les routes déclarées dans un fichier de contrôleur.

    Rend une liste de (methode, chemin, est_ouvert).

    ⚠️ `est_ouvert` est REMONTÉ pour être comparé à la liste épinglée, jamais
    pour exclure la route de l'ensemble énuméré (mode M11).
    """
    # ⚠️ Les commentaires sont retirés d'abord. Sans ça, une route mise en
    # commentaire — pendant une mise hors service, typiquement — serait sondée,
    # et son 404 compté comme un refus réussi : le banc conclurait « protégée »
    # sur une route qui n'existe plus.
    texte = _COMMENTAIRE_BLOC.sub("", texte)
    texte = _COMMENTAIRE_LIGNE.sub("", texte)

    prefixe_m = _CONTROLLER.search(texte)
    if not prefixe_m:
        return []
    prefixe = (prefixe_m.group(1) or prefixe_m.group(2) or "").strip("/")

    # ⚠️ Un décorateur posé AVANT la déclaration de classe s'applique à TOUTES
    # les méthodes, et l'ordre usuel en NestJS est `@UseGuards` puis `@Roles`
    # puis `@Controller` : partir du `@Controller` ferait manquer le garde qui
    # le précède, et remonterait des contrôleurs entiers comme ouverts. On
    # prend donc toutes les lignes de décorateur situées avant la classe, quel
    # que soit leur ordre.
    classe_m = _CLASSE.search(texte, prefixe_m.end())
    fin_entete = classe_m.start() if classe_m else prefixe_m.end()
    entete = "\n".join(
        l for l in texte[:fin_entete].split("\n") if l.lstrip().startswith("@")
    )
    garde_classe = bool(_GARDE.search(entete))

    routes = []
    for bloc in _blocs_decorateurs(texte[fin_entete:]):
        m = _METHODE.search(bloc)
        if not m:
            continue
        methode = m.group(1).upper()
        segment = (m.group(2) or m.group(3) or "").strip("/")

        # ⚠️ Le garde d'une route se cherche dans TOUT son bloc de décorateurs,
        # au-dessus comme au-dessous du verbe HTTP. NestJS n'impose aucun ordre,
        # et le dépôt en use : `@Get('me')` puis `@UseGuards(JwtGuard)` sur la
        # ligne suivante. Un parseur qui ne regardait que ce qui PRÉCÈDE le
        # verbe annonçait `/auth/me` ouverte — une route publique fantôme, que
        # ce banc aurait exigé d'épingler dans R023.
        #
        # Trouvé par l'auto-test, pas par la relecture (M1).
        est_ouvert = not (garde_classe or bool(_GARDE.search(bloc)))
        parties = [p for p in (prefixe, segment) if p]
        routes.append((methode, "/" + "/".join(parties), est_ouvert))
    return routes


def _blocs_decorateurs(texte):
    """Découpe le corps d'un contrôleur en blocs de décorateurs consécutifs.

    Un bloc est la suite de lignes commençant par `@`, continuations de
    parenthèses comprises — `@ApiResponse({\\n status: 200,\\n })`. Ce qui les
    sépare est le corps de méthode : deux routes ne peuvent donc pas partager
    un bloc, et les décorateurs de l'une ne fuient pas sur l'autre.
    """
    lignes = texte.split("\n")
    blocs, i, n = [], 0, len(lignes)
    while i < n:
        if not lignes[i].lstrip().startswith("@"):
            i += 1
            continue
        debut, profondeur = i, 0
        while i < n:
            profondeur += lignes[i].count("(") - lignes[i].count(")")
            i += 1
            if profondeur <= 0:
                if i < n and lignes[i].lstrip().startswith("@"):
                    continue
                break
        blocs.append("\n".join(lignes[debut:i]))
    return blocs


def toutes_les_routes(racine):
    vues = []
    for dossier, _, fichiers in os.walk(racine):
        for f in fichiers:
            if not f.endswith(".controller.ts"):
                continue
            with open(os.path.join(dossier, f), encoding="utf-8") as fh:
                vues.extend(routes_du_source(fh.read()))
    return sorted(set(vues))


def url_sondable(chemin):
    """Remplace les paramètres par un identifiant inexistant mais BIEN FORMÉ.

    ⚠️ Mal formé, on mesurerait la validation du format et non le refus
    d'accès — et un 400 passerait pour un refus alors qu'il n'en est pas un.

    ⚠️ Et l'identifiant est **inexistant** : les sondes atteignent des routes
    de suppression et de modification. Un identifiant réel les ferait aboutir
    le jour où un garde manque — un banc ne doit pas pouvoir détruire ce qu'il
    surveille.
    """
    return re.sub(r":([A-Za-z_]+)", "00000000-0000-4000-8000-000000000000", chemin)


# ─────────────────────────────────────────────────────────────────────────────
# Clés d'erreur — un refus sans clé est un refus que l'interface ne traduit pas
# ─────────────────────────────────────────────────────────────────────────────


def aplatir(objet, prefixe=""):
    plat = {}
    for cle, valeur in objet.items():
        complet = prefixe + cle
        if isinstance(valeur, dict):
            plat.update(aplatir(valeur, complet + "."))
        else:
            plat[complet] = valeur
    return plat


def charger_cles_fr():
    with open(FR_JSON, encoding="utf-8") as fh:
        return set(aplatir(json.load(fh)))


def traduisible(message, cles):
    """La règle exacte de `resolveApiError` (shared/src/api/client.ts).

    ⚠️ C'est une copie, donc un couple au sens de M5/R029 : si la résolution
    change côté client, ce contrôle doit changer. Elle tient en trois lignes et
    l'importer depuis TypeScript coûterait plus que la duplication ; le couple
    est donc **écrit ici**, plutôt que tu.
    """
    if not isinstance(message, str):
        return False
    return message in cles or ("errors." + message) in cles


# ─────────────────────────────────────────────────────────────────────────────
# Jetons — aucun n'est écrit en dur : ils viennent du décor
# ─────────────────────────────────────────────────────────────────────────────


def charger_manifeste():
    if not os.path.exists(MANIFESTE):
        arreter("manifeste absent : %s\n   Lancer d'abord ./scripts/provision-decor.sh"
                % MANIFESTE)
    with open(MANIFESTE, encoding="utf-8") as fh:
        return json.load(fh)


def arreter(message):
    # ⚠️ Aucune valeur de repli (mode M3) : un jeton absent doit ARRÊTER le
    # banc, jamais le laisser conclure « tout est refusé » — ce qui serait vrai
    # et vide de sens, puisqu'une requête sans jeton valide est refusée de
    # toute façon.
    print("❌ " + message)
    sys.exit(2)


def appeler(methode, chemin, jeton=None):
    """Rend (statut, message). Ne lève pas sur une réponse d'erreur."""
    req = urllib.request.Request(BASE_URL + chemin, method=methode)
    if jeton:
        req.add_header("Authorization", "Bearer " + jeton)

    # ⚠️ L'en-tête `Content-Type: application/json` n'est posé QUE s'il y a un
    # corps. Posé sur un DELETE sans corps, Fastify répond
    # « Body cannot be empty… » en 400 — **avant tout garde**. Les vingt sondes
    # de suppression ne mesuraient alors que l'analyseur de corps, et pas la
    # frontière : un 400 n'est pas un refus d'accès, et l'aurait-on compté
    # comme tel que le banc aurait annoncé vingt routes protégées sans en avoir
    # éprouvé une seule.
    corps = b"{}" if methode in ("POST", "PUT", "PATCH") else None
    if corps is not None:
        req.add_header("Content-Type", "application/json")

    for essai in range(3):
        try:
            with urllib.request.urlopen(req, corps, timeout=20) as r:
                return r.status, None
        except urllib.error.HTTPError as e:
            brut = e.read()
            try:
                message = json.loads(brut).get("message")
            except Exception:
                message = None
            # Mode M9 — le plafond n'est pas un refus métier. On le nomme, on
            # attend, on rejoue ; sans ça un 429 se compterait comme un succès
            # de refus, ce qui est exactement le pire des deux mondes.
            if e.code == 429 and essai < 2:
                print("   ⏳ 429 sur %s %s — plafond, pas un refus. Attente 20 s."
                      % (methode, chemin))
                time.sleep(20)
                continue
            return e.code, message
        except Exception as e:
            # ⚠️ Pas de repli sur « refusé » : une panne réseau n'est pas un refus.
            return None, "ERREUR_RESEAU: %s" % e
    return 429, "throttle"


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


def _b64(donnees):
    return base64.urlsafe_b64encode(donnees).rstrip(b"=")


def forger_jeton_expire(jeton_valide, secret):
    """Le même jeton, avec une date d'expiration dépassée.

    Signature **valide** : c'est l'expiration qu'on éprouve, pas la signature.
    Un jeton au sceau cassé prouverait seulement que la cryptographie
    fonctionne, ce que personne ne met en doute.
    """
    charge = json.loads(base64.urlsafe_b64decode(
        jeton_valide.split(".")[1] + "=="))
    maintenant = int(time.time())
    charge = {k: v for k, v in charge.items() if k not in ("iat", "exp")}
    charge["iat"] = maintenant - 7200
    charge["exp"] = maintenant - 3600

    entete = _b64(json.dumps({"alg": "HS256", "typ": "JWT"},
                             separators=(",", ":")).encode())
    corps = _b64(json.dumps(charge, separators=(",", ":")).encode())
    sceau = _b64(hmac.new(secret.encode(), entete + b"." + corps,
                          hashlib.sha256).digest())
    return (entete + b"." + corps + b"." + sceau).decode()


def lire_secret():
    chemin = os.path.join(RACINE, ".env")
    if os.environ.get("JWT_SECRET"):
        return os.environ["JWT_SECRET"]
    if not os.path.exists(chemin):
        arreter("JWT_SECRET introuvable (ni dans l'environnement, ni dans .env). "
                "La sonde « jeton expiré » ne peut pas être forgée, et un banc "
                "qui saute une sonde en silence annonce une couverture qu'il n'a pas.")
    for ligne in open(chemin, encoding="utf-8"):
        if ligne.startswith("JWT_SECRET="):
            return ligne.split("=", 1)[1].strip().strip("\"'")
    arreter("JWT_SECRET absent de .env")


def jeton_autre_role(chemin, owner, superadmin):
    """Un jeton valide qui n'a aucune raison d'être accepté sur cette route.

    Le choix se fait sur le **préfixe de routage**, jamais sur `@Roles(...)` :
    prendre la cible dans la donnée examinée est le mode M11.
    """
    return owner if chemin.startswith("/admin/") else superadmin


# ─────────────────────────────────────────────────────────────────────────────
# Auto-test — autant de cas qui doivent ÉCHOUER que de cas qui doivent passer
# ─────────────────────────────────────────────────────────────────────────────

_CAS_PARSEUR = [
    ("@Controller('customers')\n@Get()\nlist() {}",
     [("GET", "/customers", True)]),
    ("@UseGuards(JwtGuard)\n@Controller('customers')\nexport class C {\n@Get()\na() {}\n}",
     [("GET", "/customers", False)]),
    # ⚠️ Le cas qui compte ici : sans garde, la route est OUVERTE. C'est la
    # polarité de ce dépôt (R023), et l'oubli que ce banc rend visible.
    ("@Controller('x')\nexport class C {\n@Get()\na() {}\n}",
     [("GET", "/x", True)]),
    # L'ordre réel en NestJS : @UseGuards précède @Controller.
    ("@ApiTags('a')\n@UseGuards(JwtGuard, TenantGuard, RolesGuard)\n"
     "@Controller('quotes')\nexport class C {\n@Get(':id')\na() {}\n}",
     [("GET", "/quotes/:id", False)]),
    # Garde posé sur une seule route d'un contrôleur non gardé : les autres
    # restent ouvertes. C'est le cas d'auth.controller.ts.
    ("@Controller('auth')\nexport class C {\n@Post('login')\na() {}\n"
     "@Get('me')\n@UseGuards(JwtGuard)\nb() {}\n}",
     [("GET", "/auth/me", False), ("POST", "/auth/login", True)]),
    ("@Controller('purchases')\n@UseGuards(G)\nexport class C {\n"
     "@Post('reception-bls')\na() {}\n@Get('vendor-bills/:id')\nb() {}\n}",
     [("GET", "/purchases/vendor-bills/:id", False),
      ("POST", "/purchases/reception-bls", False)]),
]

# Sources sur lesquelles le parseur NE DOIT RIEN rendre. Sans elles,
# l'auto-test ne montrerait que sa capacité à dire oui (R030).
_CAS_PARSEUR_REFUS = [
    "// @Controller('customers')\n// @Get()\n",
    "/* @Controller('x')\n@Get()\n*/",
    "@Injectable()\n@Get()\nrien() {}",
    "class Sans { }",
    "@Controller('customers')\n",
    "const s = \"@Controller('faux')\";",
]


def self_test():
    echecs, passes = [], 0

    for source, attendu in _CAS_PARSEUR:
        obtenu = sorted(routes_du_source(source))
        if obtenu != sorted(attendu):
            echecs.append("parseur : attendu %s, obtenu %s" % (attendu, obtenu))
        else:
            passes += 1

    for source in _CAS_PARSEUR_REFUS:
        obtenu = routes_du_source(source)
        if obtenu:
            echecs.append("parseur : aurait dû ne rien rendre, a rendu %s" % (obtenu,))
        else:
            passes += 1

    # ── Le choix du jeton « autre rôle » ──
    for chemin, attendu in (("/customers", "SUPER"), ("/admin/tenants", "OWNER"),
                            ("/admin/subscriptions/:id", "OWNER"),
                            ("/production/orders", "SUPER")):
        obtenu = jeton_autre_role(chemin, "OWNER", "SUPER")
        if obtenu != attendu:
            echecs.append("jeton autre rôle sur %s : %s (attendu %s)"
                          % (chemin, obtenu, attendu))
        else:
            passes += 1

    # ── La résolution des clés, avec ses cas de refus ──
    cles = {"errors.forbidden", "errors.users_limit_reached"}
    for message, attendu in (
        ("errors.forbidden", True),          # clé complète connue
        ("users_limit_reached", True),       # clé nue, préfixée par le client
        ("errors.admin_only", False),        # ⟵ refus : absente du catalogue
        ("Unauthorized", False),             # ⟵ refus : pas une clé
        (None, False),                       # ⟵ refus : pas de message
        (["a", "b"], False),                 # ⟵ refus : tableau class-validator
    ):
        if traduisible(message, cles) != attendu:
            echecs.append("traduisible(%r) ≠ %s" % (message, attendu))
        else:
            passes += 1

    # ── Le jeton forgé ──
    faux = ("x." + base64.urlsafe_b64encode(
        json.dumps({"sub": "s", "role": "owner", "iat": 1, "exp": 9999999999})
        .encode()).rstrip(b"=").decode() + ".y")
    forge = forger_jeton_expire(faux, "secret-de-test")
    charge = json.loads(base64.urlsafe_b64decode(forge.split(".")[1] + "=="))
    if len(forge.split(".")) != 3:
        echecs.append("jeton forgé : %d segments (attendu 3)" % len(forge.split(".")))
    elif charge["exp"] >= int(time.time()):
        # ⟵ refus : un jeton dont l'expiration serait dans le futur ne
        #    prouverait rien. C'est la sonde elle-même qu'on éprouve ici.
        echecs.append("jeton forgé : exp dans le futur (%s)" % charge["exp"])
    elif charge["sub"] != "s":
        echecs.append("jeton forgé : charge utile altérée")
    else:
        passes += 1

    # ── Le remplacement des paramètres ──
    for chemin, attendu in (
        ("/customers/:id", "/customers/00000000-0000-4000-8000-000000000000"),
        ("/customers/:id/contacts/:contactId",
         "/customers/00000000-0000-4000-8000-000000000000/contacts/"
         "00000000-0000-4000-8000-000000000000"),
        ("/customers", "/customers"),
    ):
        if url_sondable(chemin) != attendu:
            echecs.append("url_sondable(%s) = %s" % (chemin, url_sondable(chemin)))
        else:
            passes += 1

    total = passes + len(echecs)
    refus = len(_CAS_PARSEUR_REFUS) + 4  # 4 cas de refus dans la résolution des clés
    print("auto-test : %d cas, dont %d qui doivent ÉCHOUER" % (total, refus))
    for e in echecs:
        print("  ❌ " + e)
    print("  %d/%d" % (passes, total))
    return not echecs


# ─────────────────────────────────────────────────────────────────────────────


def main():
    if "--self-test" in sys.argv:
        sys.exit(0 if self_test() else 1)

    routes = toutes_les_routes(SRC_DIR)
    if not routes:
        arreter("aucune route trouvée sous %s — l'absence de verdict n'est pas "
                "un verdict." % SRC_DIR)

    ouvertes = {(m, c) for m, c, ouv in routes if ouv}
    epinglees = set(ROUTES_PUBLIQUES)

    if "--list" in sys.argv:
        for m, c, ouv in routes:
            marque = "OUVERTE" if ouv else ""
            if (m, c) in epinglees:
                marque = "ouverte, épinglée"
            print("%-6s %-52s %s" % (m, c, marque))
        print("\n%d routes — %d ouvertes, dont %d épinglées"
              % (len(routes), len(ouvertes), len(ouvertes & epinglees)))
        return

    # ⚠️ Le contrôle qui ferme le mode M11 : une route ouverte dans le code mais
    # non épinglée ici est une régression, pas une donnée d'entrée.
    surprises = ouvertes - epinglees
    if surprises:
        print("❌ %d route(s) OUVERTE(s) non épinglée(s) — chacune doit être une "
              "décision écrite dans R023, ou porter son garde :" % len(surprises))
        for m, c in sorted(surprises):
            print("     %s %s" % (m, c))
        sys.exit(1)

    disparues = epinglees - ouvertes
    if disparues:
        print("⚠️  épinglées comme publiques mais désormais gardées "
              "(à retirer d'ici et de R023) :")
        for m, c in sorted(disparues):
            print("     %s %s" % (m, c))

    protegees = [(m, c) for m, c, ouv in routes if not ouv]
    cles = charger_cles_fr()
    manifeste = charger_manifeste()
    comptes = manifeste["comptes"]

    owner = connexion(comptes["A"]["owner"]["email"],
                      comptes["A"]["owner"]["motDePasse"])
    superadmin = connexion(comptes["superadmin"]["email"],
                           comptes["superadmin"]["motDePasse"],
                           "/admin/auth/login")
    expire = forger_jeton_expire(owner, lire_secret())

    print("── banc de refus ──")
    print("   %d routes énumérées = %d protégées + %d ouvertes épinglées"
          % (len(routes), len(protegees), len(ouvertes)))
    print("   sondes : sans jeton · autre rôle · jeton expiré")
    print("   (%d route(s) exclue(s) de la sonde « autre rôle », voir plus bas)\n"
          % len(ROUTES_SANS_RESTRICTION_DE_ROLE))

    graves, tiedes = [], []
    sans_cle = []
    compte = {"sans_jeton": 0, "autre_role": 0, "expire": 0}
    exclues_role = 0

    for methode, chemin in protegees:
        url = url_sondable(chemin)

        # ── Sonde 1 : sans jeton ──
        statut, _ = appeler(methode, url, None)
        time.sleep(PACE_SECONDS)
        if statut == 401:
            compte["sans_jeton"] += 1
        else:
            graves.append("%s %s — sans jeton : statut %s (attendu 401)"
                          % (methode, chemin, statut))

        # ── Sonde 2 : jeton valide d'un autre rôle ──
        if (methode, chemin) in ROUTES_SANS_RESTRICTION_DE_ROLE:
            exclues_role += 1
        else:
            statut, message = appeler(
                methode, url, jeton_autre_role(chemin, owner, superadmin))
            time.sleep(PACE_SECONDS)
            if statut == 403:
                compte["autre_role"] += 1
                if not traduisible(message, cles):
                    sans_cle.append("%s %s → %r" % (methode, chemin, message))
            elif statut is not None and 200 <= statut < 300:
                graves.append("%s %s — autre rôle : ACCEPTÉ (%s). Défaut, ou "
                              "décision à épingler dans "
                              "ROUTES_SANS_RESTRICTION_DE_ROLE."
                              % (methode, chemin, statut))
            else:
                tiedes.append("%s %s — autre rôle : statut %s, message %r "
                              "(ni refus d'accès, ni acceptation)"
                              % (methode, chemin, statut, message))

        # ── Sonde 3 : jeton expiré ──
        statut, _ = appeler(methode, url, expire)
        time.sleep(PACE_SECONDS)
        if statut == 401:
            compte["expire"] += 1
        else:
            graves.append("%s %s — jeton expiré : statut %s (attendu 401)"
                          % (methode, chemin, statut))

    # ── Le verdict, décomposé. Un total sans sa décomposition ne se vérifie pas.
    sondables_role = len(protegees) - exclues_role
    print("── refus obtenus ──")
    print("   sans jeton    %3d / %3d" % (compte["sans_jeton"], len(protegees)))
    print("   autre rôle    %3d / %3d   (%d exclue(s), épinglée(s))"
          % (compte["autre_role"], sondables_role, exclues_role))
    print("   jeton expiré  %3d / %3d" % (compte["expire"], len(protegees)))

    for m, c in sorted(ROUTES_SANS_RESTRICTION_DE_ROLE):
        print("     exclue : %s %s — %s"
              % (m, c, ROUTES_SANS_RESTRICTION_DE_ROLE[(m, c)]))

    if graves:
        print("\n❌ %d défaut(s) d'accès :" % len(graves))
        for e in graves:
            print("     " + e)
    if tiedes:
        print("\n⚠️  %d réponse(s) indéterminée(s) — à trancher, pas à ignorer :"
              % len(tiedes))
        for e in tiedes:
            print("     " + e)

    # R006 — un refus que l'interface ne sait pas traduire est un refus muet.
    # Ce n'est pas un défaut d'accès : compté à part, avec son propre total.
    print("\n── R006 : le refus est-il traduisible ? ──")
    print("   403 portant une clé connue de fr.json   %3d / %3d"
          % (compte["autre_role"] - len(sans_cle), compte["autre_role"]))
    if sans_cle:
        distinctes = sorted({e.split("→ ")[1] for e in sans_cle})
        print("   ❌ %d refus affichés « une erreur est survenue » — %d clé(s) "
              "absente(s) de shared/src/i18n/fr.json :"
              % (len(sans_cle), len(distinctes)))
        for cle in distinctes:
            print("        " + cle)

    sys.exit(1 if graves or sans_cle else 0)


if __name__ == "__main__":
    main()
