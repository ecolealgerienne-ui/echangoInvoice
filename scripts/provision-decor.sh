#!/usr/bin/env bash
#
# Décor des bancs de test — étape 1 du chantier (docs/CHANTIER_TESTS.md §3).
#
# ── Ce script ne vérifie rien ───────────────────────────────────────────────
#
# Il **provisionne**. Ce qui est éprouvé l'est par les bancs, qui viennent
# après. Mélanger les deux est le mode M8 : deux tests qui se passent un état
# échouent ensemble, et le second accuse le premier.
#
# Il pose ce qu'un banc ne peut pas poser lui-même :
#
#   1. **Un second locataire.** Il n'en existait qu'un. Le banc de
#      cloisonnement — le plus important de ce produit (R020) — a besoin de
#      ressources appartenant à quelqu'un d'autre pour avoir quelque chose à
#      refuser. Sans lui, il passerait au vert sans rien prouver.
#   2. **Les cinq personas**, dans les deux locataires. La matrice des rôles
#      n'est pas testable avec les trois comptes du seed.
#   3. **Ce qui demande le superadmin** — relever les limites du plan starter
#      posé d'office par `/auth/register`. Le garde n'est pas contourné : c'est
#      le rôle d'administration qui est tenu ici.
#   4. **Une ressource de chaque famille**, dans chaque locataire, pour que
#      chacune des 91 routes à identifiant ait une cible **et** une cible
#      d'autrui.
#
# ── Ce qu'il produit ────────────────────────────────────────────────────────
#
# `.decor/manifeste.json` — l'inventaire de ce qui a été posé : identifiants
# des ressources, des comptes, des locataires. C'est le contrat entre le décor
# et les bancs. Un banc lit ce fichier ; il ne devine rien.
#
# ── ⚠️ Idempotent, et c'est une contrainte de plafond, pas de confort ───────
#
# Les identifiants sont **stables**, jamais aléatoires (mode M8/M9).
# `/auth/login` accepte 10 appels par minute, `/auth/register` 5, et
# `/admin/auth/login` **5 par quart d'heure**. Un décor à identifiants
# aléatoires devient inutilisable au second passage de la journée.
#
# Le budget consommé par un passage :
#
#   | Route                | 1er passage | passages suivants |
#   |----------------------|-------------|-------------------|
#   | /auth/login          | 2           | 2                 |
#   | /auth/register       | 1           | 0                 |
#   | /admin/auth/login    | 1           | 0                 |
#
# Les passages suivants ne coûtent que deux connexions parce que rien ici ne
# se connecte pour vérifier : l'existence d'un compte se lit sur `GET /users`,
# qui n'est pas plafonné, et `accept-invite` rend ses jetons sans passer par
# `/auth/login`. **Le décor ne se connecte pas aux personas qu'il crée** — ça
# serait une vérification, et ça coûterait six connexions de plus.
#
# La reconnaissance du 429 est explicite : un plafond atteint sort déguisé en
# « identifiants incorrects » (mode M9), et envoie chercher un bug
# d'authentification pour un problème qui se résout en attendant.
#
# ── Comment il reconnaît ce qu'il a déjà posé ───────────────────────────────
#
# Deux mécanismes, parce que les ressources n'ont pas toutes un nom :
#
#   - **par le nom**, pour ce qui en porte un (client, fournisseur, article,
#     grille, nomenclature) : une recherche sur le libellé distinctif. Perdre
#     le manifeste ne multiplie donc pas le catalogue.
#   - **par le manifeste**, pour les documents, qui portent un numéro généré et
#     non un nom : l'identifiant du passage précédent est relu, et réutilisé
#     s'il répond encore. ⚠️ Manifeste effacé ⇒ documents recréés. Ils
#     s'empilent sans nuire ; le nettoyage se fait en supprimant le locataire B.
#
# ── Usage ───────────────────────────────────────────────────────────────────
#
#   nvm use 22          # pas nécessaire ici : ce script n'appelle pas node
#   ./scripts/provision-decor.sh
#
# Variables reconnues : API_URL, MARQUE, MDP_DECOR, MDP_A_OWNER,
# EMAIL_A_OWNER, EMAIL_SUPERADMIN, MDP_SUPERADMIN, ATTENTE_MAX_429.

set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# Configuration — tout est stable, rien n'est tiré au hasard
# ─────────────────────────────────────────────────────────────────────────────

API="${API_URL:-http://localhost:3000/api/v1}"
RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DOSSIER=".decor"
MANIFESTE="$RACINE/$DOSSIER/manifeste.json"

# Préfixe de tout libellé posé ici. Il sert à retrouver le décor à l'œil, dans
# l'application, et à le distinguer des 301 clients du jeu de démonstration.
MARQUE="${MARQUE:-DECOR}"

# Mot de passe des comptes que ce script crée. ≥ 8 caractères (RegisterDto).
MDP_DECOR="${MDP_DECOR:-Decor2026!}"

# ── Locataire A — celui du seed, déjà en place ──
# Ses trois premiers comptes viennent de `npm run seed` (CLAUDE.md §10) ; le
# comptable manque, ce script l'ajoute.
EMAIL_A_OWNER="${EMAIL_A_OWNER:-admin@chambre-froide.dz}"
MDP_A_OWNER="${MDP_A_OWNER:-admin1234}"
EMAIL_A_COMPTABLE="comptable-decor@chambre-froide.dz"
EMAIL_A_ATTENTE="invitation-en-attente-decor@chambre-froide.dz"

# ── Locataire B — celui que ce script crée ──
# C'est la raison d'être du décor : sans lui, le cloisonnement n'est pas
# testable. Son nom dit à quoi il sert, pour que personne ne le prenne pour un
# vrai client en regardant la console d'administration.
SOCIETE_B="Decor Cloisonnement SARL"
EMAIL_B_OWNER="owner-decor@cloisonnement.dz"
EMAIL_B_MANAGER="manager-decor@cloisonnement.dz"
EMAIL_B_AGENT="agent-decor@cloisonnement.dz"
EMAIL_B_COMPTABLE="comptable-decor@cloisonnement.dz"
EMAIL_B_ATTENTE="invitation-en-attente-decor@cloisonnement.dz"

# Superadmin — pour relever les limites du plan starter de B.
EMAIL_SUPERADMIN="${EMAIL_SUPERADMIN:-superadmin@echango.dz}"
MDP_SUPERADMIN="${MDP_SUPERADMIN:-SuperAdmin2026!}"

# Marqueur de « ce locataire a été provisionné par le décor ».
#
# Le plan `pro` donne 10 postes. On en pose **12** : la valeur ne peut venir
# d'aucun plan du catalogue, donc la lire suffit à savoir que le passage
# d'administration a déjà eu lieu — sans dépenser une connexion superadmin pour
# le redemander. C'est un marqueur, pas un réglage : sa valeur exacte importe
# peu, son unicité oui.
POSTES_DECOR=12
PLAFOND_FACTURES_DECOR=100000

# Temporisation maximale acceptée sur un 429, en secondes.
ATTENTE_MAX_429="${ATTENTE_MAX_429:-75}"

command -v jq   >/dev/null 2>&1 || { echo "❌ jq requis (apt install jq)." >&2; exit 1; }
command -v curl >/dev/null 2>&1 || { echo "❌ curl requis." >&2; exit 1; }

# ─────────────────────────────────────────────────────────────────────────────
# Sortie
# ─────────────────────────────────────────────────────────────────────────────

etape() { echo; echo "── $1 ──"; }
ok()    { echo "✅ $1"; }
info()  { echo "   $1"; }
neuf()  { echo "   ✚ $1"; }
deja()  { echo "   = $1"; }

echouer() {
  echo >&2
  echo "❌ $1" >&2
  [ -n "${2:-}" ] && { echo "   Code HTTP : $(code_http)" >&2; echo "   Réponse   : $2" >&2; }
  echo >&2
  echo "   Le décor s'arrête ici. Il ne pose jamais « à peu près » ce qui manque :" >&2
  echo "   un décor qui annonce avoir créé ce qu'il n'a pas obtenu fait échouer un" >&2
  echo "   banc trois étapes plus loin, en accusant la mauvaise (mode M3)." >&2
  exit 1
}

# ─────────────────────────────────────────────────────────────────────────────
# Appels HTTP
# ─────────────────────────────────────────────────────────────────────────────

CORPS_TMP="$(mktemp)"
CODE_TMP="$(mktemp)"
echo 0 > "$CODE_TMP"
trap 'rm -f "$CORPS_TMP" "$CODE_TMP"' EXIT

# Le code HTTP passe par un **fichier**, pas par une variable.
#
# Ce n'est pas un détail de style, c'est le défaut que le second passage de ce
# script a trouvé dans ce script. `reponse="$(api ...)"` exécute `api` dans un
# sous-shell : une variable qu'elle y pose n'existe pas au retour. La
# vérification du code lisait donc toujours la valeur laissée par le dernier
# appel non substitué — le contrôle de santé du début, un 200 — et **aucun
# refus n'a jamais été reconnu**. Un POST en conflit passait pour un succès.
#
# C'est le mode M1 dans l'outil de test lui-même : un contrôle au vert depuis
# sa création, que personne n'avait vu dire non. On ne l'a vu que parce que la
# consigne « rejouable deux fois de suite » oblige à un second passage.
code_http() { cat "$CODE_TMP"; }

# api MÉTHODE CHEMIN [CORPS] [JETON] → imprime le corps ; pose le code HTTP
#
# Le code est relevé séparément du corps. Reconnaître une erreur à la seule
# présence d'un champ dans le corps lirait un succès comme un échec : `code`
# existe aussi sur des réponses valides.
api() {
  local methode="$1" chemin="$2" corps="${3:-}" jeton="${4:-}"
  local arguments=(-sS -o "$CORPS_TMP" -w '%{http_code}' -X "$methode" "$API$chemin")
  arguments+=(-H 'Content-Type: application/json')
  [ -n "$corps" ] && arguments+=(--data-binary "$corps")
  [ -n "$jeton" ] && arguments+=(-H "Authorization: Bearer $jeton")

  local essais=0
  while : ; do
    curl "${arguments[@]}" > "$CODE_TMP" 2>/dev/null || echo 0 > "$CODE_TMP"

    # Mode M9 — le plafond pris pour un bug métier. On le nomme, on attend,
    # on rejoue. Sans ça, `/auth/login` plafonné se présente comme un mot de
    # passe refusé, et le diagnostic part dans la mauvaise direction.
    if [ "$(code_http)" = "429" ] && [ "$essais" -lt 2 ]; then
      essais=$((essais + 1))
      local attente=$(( ATTENTE_MAX_429 / 2 * essais ))
      echo "   ⏳ 429 sur $methode $chemin — plafond atteint, pas un défaut." >&2
      echo "      Temporisation de ${attente}s puis nouvel essai ($essais/2)." >&2
      sleep "$attente"
      continue
    fi
    break
  done

  cat "$CORPS_TMP"
}

# exige MÉTHODE CHEMIN [CORPS] [JETON] → imprime le corps, abandonne hors 2xx
exige() {
  local reponse; reponse="$(api "$@")"
  case "$(code_http)" in
    2??) printf '%s' "$reponse" ;;
    *)   echouer "$1 $2 a répondu $(code_http)" "$reponse" ;;
  esac
}

urlenc() { jq -rn --arg s "$1" '$s|@uri'; }

# valeur_ou_echec EXPRESSION_JQ CORPS DESCRIPTION
#
# Extrait une valeur et abandonne si elle est absente. Pas de `// ""` : un
# repli détruit l'information d'absence, et l'absence est l'information qui
# compte (mode M3).
valeur_ou_echec() {
  local valeur
  valeur="$(jq -r "$1 // empty" <<<"$2")"
  [ -n "$valeur" ] || echouer "$3 — champ « $1 » absent de la réponse" "$2"
  printf '%s' "$valeur"
}

# ─────────────────────────────────────────────────────────────────────────────
# Manifeste
# ─────────────────────────────────────────────────────────────────────────────

declare -A REF=()
ANCIEN='{}'
[ -f "$MANIFESTE" ] && ANCIEN="$(cat "$MANIFESTE")"

noter() { REF["$1"]="$2"; }

# ancien CLÉ → la valeur du passage précédent, vide si absente
ancien() {
  jq -r --arg k "$1" '(getpath($k|split(".")) // "") | if type == "string" then . else "" end' <<<"$ANCIEN"
}

# ─────────────────────────────────────────────────────────────────────────────
# Reconnaissance de l'existant
# ─────────────────────────────────────────────────────────────────────────────

# id_par_champ CHEMIN CHAMP VALEUR JETON [REQUÊTE] → identifiant, vide si absent
#
# La forme de la réponse est contrôlée. Sans ce contrôle, une liste rendue
# autrement qu'en tableau ferait créer un doublon à chaque passage, en
# silence — et l'idempotence serait fausse sans que rien ne rougisse.
id_par_champ() {
  local chemin="$1" champ="$2" valeur="$3" jeton="$4" requete="${5-}"
  local reponse; reponse="$(exige GET "$chemin${requete:+?$requete}" '' "$jeton")"
  [ "$(jq -r '.data|type' <<<"$reponse")" = "array" ] \
    || echouer "GET $chemin : « .data » n'est pas un tableau" "$reponse"
  jq -r --arg c "$champ" --arg v "$valeur" \
    'first(.data[] | select(.[$c] == $v) | .id) // ""' <<<"$reponse"
}

# id_par_nom CHEMIN NOM JETON — le cas courant, avec la recherche serveur
id_par_nom() {
  id_par_champ "$1" name "$2" "$3" "limit=100&search=$(urlenc "$2")"
}

# id_reutilisable CLÉ CHEMIN JETON → l'identifiant du passage précédent s'il
# répond encore, vide sinon.
id_reutilisable() {
  local id; id="$(ancien "$1")"
  [ -n "$id" ] || { printf ''; return 0; }
  api GET "$2/$id" '' "$3" >/dev/null
  [ "$(code_http)" = "200" ] && printf '%s' "$id" || printf ''
}

# ─────────────────────────────────────────────────────────────────────────────

echo "════════════════════════════════════════════════════════════════"
echo "  Décor des bancs — echangoInvoice"
echo "  API : $API"
echo "════════════════════════════════════════════════════════════════"

api GET /health >/dev/null
[ "$(code_http)" = "200" ] \
  || echouer "L'API ne répond pas sur $API/health (code $(code_http)). Lancer « npm run start:dev »."

# ─────────────────────────────────────────────────────────────────────────────
etape "1. Locataire A — session propriétaire"
# ─────────────────────────────────────────────────────────────────────────────

connexion() { # EMAIL MDP → jeton, vide si refus
  local reponse
  reponse="$(api POST /auth/login "$(jq -n --arg e "$1" --arg p "$2" '{email:$e,password:$p}')")"
  case "$(code_http)" in
    200) jq -r '.data.accessToken // empty' <<<"$reponse" ;;
    401) printf '' ;;
    429) echouer "Plafond de /auth/login toujours atteint après temporisation. Réessayer dans une minute." "$reponse" ;;
    *)   echouer "POST /auth/login a répondu $(code_http)" "$reponse" ;;
  esac
}

JETON_A="$(connexion "$EMAIL_A_OWNER" "$MDP_A_OWNER")"
[ -n "$JETON_A" ] || echouer \
  "Connexion impossible pour $EMAIL_A_OWNER. Le seed a-t-il tourné ? (nvm use 22 && npm run seed)"

MOI_A="$(exige GET /auth/me '' "$JETON_A")"
TENANT_A="$(valeur_ou_echec '.data.tenantId' "$MOI_A" 'GET /auth/me')"
noter "locataires.A.id" "$TENANT_A"
noter "locataires.A.libelle" "Chambre Froide Djelfa (seed)"
ok "Locataire A : $TENANT_A"

# ─────────────────────────────────────────────────────────────────────────────
etape "2. Locataire B — celui sans lequel le cloisonnement n'est pas testable"
# ─────────────────────────────────────────────────────────────────────────────

JETON_B="$(connexion "$EMAIL_B_OWNER" "$MDP_DECOR")"

if [ -z "$JETON_B" ]; then
  info "Absent — inscription (consomme 1 sur le plafond de /auth/register)"
  REPONSE="$(exige POST /auth/register "$(jq -n \
    --arg n "$SOCIETE_B" --arg e "$EMAIL_B_OWNER" --arg p "$MDP_DECOR" \
    '{companyName:$n, email:$e, password:$p}')")"
  JETON_B="$(valeur_ou_echec '.data.accessToken' "$REPONSE" 'POST /auth/register')"
  neuf "Locataire B inscrit — $SOCIETE_B"
else
  deja "Locataire B déjà en place"
fi

MOI_B="$(exige GET /auth/me '' "$JETON_B")"
TENANT_B="$(valeur_ou_echec '.data.tenantId' "$MOI_B" 'GET /auth/me')"
[ "$TENANT_A" != "$TENANT_B" ] \
  || echouer "Les deux locataires ont le même identifiant ($TENANT_A). Le décor serait sans objet."
noter "locataires.B.id" "$TENANT_B"
noter "locataires.B.libelle" "$SOCIETE_B"
ok "Locataire B : $TENANT_B"

# ─────────────────────────────────────────────────────────────────────────────
etape "3. Limites du locataire B — le geste qui demande le superadmin"
# ─────────────────────────────────────────────────────────────────────────────

# `/auth/register` pose d'office le plan starter : 3 postes, 30 factures par
# mois. Le décor a besoin de cinq postes et d'un nombre de documents que
# 30 n'autorise pas. Relever ces bornes n'est pas un geste d'utilisateur.
QUOTA_B="$(exige GET /users/quota '' "$JETON_B")"
POSTES_B="$(jq -r '.data.limite // "null"' <<<"$QUOTA_B")"
ABONNEMENT_B="$(ancien 'locataires.B.abonnementId')"

if [ "$POSTES_B" = "$POSTES_DECOR" ] && [ -n "$ABONNEMENT_B" ]; then
  deja "Limites déjà relevées ($POSTES_B postes) — connexion superadmin épargnée"
  noter "locataires.B.abonnementId" "$ABONNEMENT_B"
else
  info "Plan starter en place ($POSTES_B postes) — passage par le superadmin"
  REPONSE="$(api POST /admin/auth/login "$(jq -n \
    --arg e "$EMAIL_SUPERADMIN" --arg p "$MDP_SUPERADMIN" '{email:$e,password:$p}')")"
  case "$(code_http)" in
    200) : ;;
    429) echouer "Plafond de /admin/auth/login atteint — 5 appels par QUART D'HEURE. Attendre, puis rejouer." "$REPONSE" ;;
    *)   echouer "Connexion superadmin refusée ($(code_http)). Le seed admin a-t-il tourné ? (npm run seed:admin)" "$REPONSE" ;;
  esac
  JETON_ADMIN="$(valeur_ou_echec '.data.accessToken' "$REPONSE" 'POST /admin/auth/login')"

  DETAIL_B="$(exige GET "/admin/tenants/$TENANT_B" '' "$JETON_ADMIN")"
  ABONNEMENT_B="$(valeur_ou_echec '.data.subscription.id' "$DETAIL_B" "GET /admin/tenants/$TENANT_B")"

  exige PATCH "/admin/subscriptions/$ABONNEMENT_B" "$(jq -n \
    --argjson u "$POSTES_DECOR" --argjson f "$PLAFOND_FACTURES_DECOR" \
    '{planSlug:"pro", usersLimit:$u, invoiceLimit:$f}')" "$JETON_ADMIN" >/dev/null

  noter "locataires.B.abonnementId" "$ABONNEMENT_B"
  neuf "Plan pro, $POSTES_DECOR postes, $PLAFOND_FACTURES_DECOR factures"
fi
ok "Limites du locataire B en place"

# ─────────────────────────────────────────────────────────────────────────────
etape "4. Module de production — activé des deux côtés"
# ─────────────────────────────────────────────────────────────────────────────

# `ProductionModuleGuard` lit un réglage, pas le plan. Sans lui, les onze
# routes de production répondent 403 pour une raison qui n'a rien à voir avec
# le rôle ni avec le locataire — et un banc de refus les compterait comme
# correctement gardées alors qu'il n'a rien éprouvé (mode M1).
activer_production() { # ÉTIQUETTE JETON
  local reglages; reglages="$(exige GET /settings '' "$2")"
  if [ "$(jq -r '.data.productionModuleEnabled' <<<"$reglages")" = "true" ]; then
    deja "$1 — production déjà active"
  else
    exige PUT /settings '{"productionModuleEnabled":true}' "$2" >/dev/null
    neuf "$1 — production activée"
  fi
}
activer_production A "$JETON_A"
activer_production B "$JETON_B"
ok "Module de production disponible dans les deux locataires"

# ─────────────────────────────────────────────────────────────────────────────
etape "5. Personas — les cinq rôles, dans les deux locataires"
# ─────────────────────────────────────────────────────────────────────────────

# L'existence d'un compte se lit sur `GET /users`, qui n'est pas plafonné.
# Se connecter pour l'apprendre coûterait six connexions par passage, et le
# décor deviendrait injouable deux fois de suite.
inventaire_utilisateurs() { exige GET /users '' "$1"; }

# poser_persona ÉTIQUETTE JETON_OWNER EMAIL RÔLE INVENTAIRE
poser_persona() {
  local etiquette="$1" jeton="$2" email="$3" role="$4" inventaire="$5"

  local id; id="$(jq -r --arg e "$email" 'first(.data[] | select(.email == $e) | .id) // ""' <<<"$inventaire")"
  if [ -n "$id" ]; then
    deja "$etiquette $role — $email"
    noter "comptes.$etiquette.$role.id" "$id"
    return 0
  fi

  # Une invitation en attente pour cette adresse bloquerait la suivante
  # (`errors.invite_already_pending`) sans que son jeton soit récupérable
  # nulle part : un passage interrompu au mauvais moment rendrait le décor
  # définitivement injouable. On la retire d'abord.
  local invitations; invitations="$(exige GET /users/invitations '' "$jeton")"
  local en_attente
  en_attente="$(jq -r --arg e "$email" 'first(.data[] | select(.email == $e) | .id) // ""' <<<"$invitations")"
  if [ -n "$en_attente" ]; then
    exige DELETE "/users/invitations/$en_attente" '' "$jeton" >/dev/null
    info "invitation orpheline retirée pour $email"
  fi

  local reponse; reponse="$(exige POST /auth/invite "$(jq -n \
    --arg e "$email" --arg r "$role" '{email:$e, role:$r}')" "$jeton")"

  # Le lien est rendu à l'appelant même quand l'envoi du courriel échoue —
  # c'est délibéré côté serveur, et c'est ce qui rend ce décor possible sans
  # SMTP configuré.
  local lien; lien="$(valeur_ou_echec '.inviteUrl' "$reponse" 'POST /auth/invite')"
  local jeton_invitation="${lien##*token=}"
  [ "$jeton_invitation" != "$lien" ] \
    || echouer "Lien d'invitation sans paramètre « token » : $lien"

  reponse="$(exige POST /auth/accept-invite "$(jq -n \
    --arg t "$jeton_invitation" --arg n "$MARQUE $etiquette $role" --arg p "$MDP_DECOR" \
    '{token:$t, name:$n, password:$p}')")"
  id="$(valeur_ou_echec '.data.user.id' "$reponse" 'POST /auth/accept-invite')"
  noter "comptes.$etiquette.$role.id" "$id"
  neuf "$etiquette $role — $email"
}

# poser_invitation_en_attente ÉTIQUETTE JETON EMAIL
#
# Une invitation qu'on n'accepte jamais : `DELETE /users/invitations/:id` a
# besoin d'une cible, et le banc de cloisonnement a besoin d'une cible
# appartenant à l'autre.
poser_invitation_en_attente() {
  local etiquette="$1" jeton="$2" email="$3"
  local invitations; invitations="$(exige GET /users/invitations '' "$jeton")"
  local id
  id="$(jq -r --arg e "$email" 'first(.data[] | select(.email == $e) | .id) // ""' <<<"$invitations")"
  if [ -n "$id" ]; then
    deja "$etiquette invitation en attente"
  else
    exige POST /auth/invite "$(jq -n --arg e "$email" '{email:$e, role:"agent"}')" "$jeton" >/dev/null
    invitations="$(exige GET /users/invitations '' "$jeton")"
    id="$(jq -r --arg e "$email" 'first(.data[] | select(.email == $e) | .id) // ""' <<<"$invitations")"
    [ -n "$id" ] || echouer "Invitation créée pour $email mais introuvable dans GET /users/invitations" "$invitations"
    neuf "$etiquette invitation en attente"
  fi
  noter "ressources.$etiquette.invitation" "$id"
}

INVENTAIRE_A="$(inventaire_utilisateurs "$JETON_A")"
poser_persona A "$JETON_A" "$EMAIL_A_OWNER"     owner      "$INVENTAIRE_A"
poser_persona A "$JETON_A" "manager@chambre-froide.dz" manager "$INVENTAIRE_A"
poser_persona A "$JETON_A" "agent@chambre-froide.dz"   agent   "$INVENTAIRE_A"
poser_persona A "$JETON_A" "$EMAIL_A_COMPTABLE" accountant "$(inventaire_utilisateurs "$JETON_A")"
poser_invitation_en_attente A "$JETON_A" "$EMAIL_A_ATTENTE"

INVENTAIRE_B="$(inventaire_utilisateurs "$JETON_B")"
poser_persona B "$JETON_B" "$EMAIL_B_OWNER"     owner      "$INVENTAIRE_B"
poser_persona B "$JETON_B" "$EMAIL_B_MANAGER"   manager    "$(inventaire_utilisateurs "$JETON_B")"
poser_persona B "$JETON_B" "$EMAIL_B_AGENT"     agent      "$(inventaire_utilisateurs "$JETON_B")"
poser_persona B "$JETON_B" "$EMAIL_B_COMPTABLE" accountant "$(inventaire_utilisateurs "$JETON_B")"
poser_invitation_en_attente B "$JETON_B" "$EMAIL_B_ATTENTE"

ok "Personas en place"

# ─────────────────────────────────────────────────────────────────────────────
etape "6. Données de référence — une ressource de chaque famille, des deux côtés"
# ─────────────────────────────────────────────────────────────────────────────

AUJOURDHUI="$(date -I)"
DANS_UN_MOIS="$(date -I -d '+1 month')"
MOIS_PROCHAIN="$(date -I -d "$(date +%Y-%m-01) +1 month")"

# poser_ressources ÉTIQUETTE JETON
poser_ressources() {
  local E="$1" J="$2"
  local prefixe="$MARQUE-$E"
  local id reponse

  # ── Partenaires ──────────────────────────────────────────────────────────
  local nom_client="$prefixe Client"
  id="$(id_par_nom /customers "$nom_client" "$J")"
  if [ -z "$id" ]; then
    reponse="$(exige POST /customers "$(jq -n --arg n "$nom_client" \
      '{name:$n, city:"Djelfa", country:"Algérie", nif:"000000000000000",
        rc:"00/00-0000000A00", address:"Zone industrielle", phone:"0550000000",
        notes:"Posé par scripts/provision-decor.sh — ne pas supprimer à la main"}')" "$J")"
    id="$(valeur_ou_echec '.data.id' "$reponse" 'POST /customers')"
    neuf "$E client"
  else deja "$E client"; fi
  local client="$id"; noter "ressources.$E.client" "$client"

  # Une adresse électronique, parce qu'un banc en a besoin.
  #
  # `POST /invoices/…/send-email` répond « customer_email_missing » sans elle,
  # et le banc des effets de bord ne pouvait pas mesurer l'effet qu'il vise —
  # il l'annonçait « non mesuré », ce qui était juste, mais stérile. Le décor
  # doit poser ce que les bancs consomment (M8).
  #
  # Posée même sur un client déjà présent : un décor idempotent garantit un
  # **état**, pas seulement une existence.
  if [ "$(jq -r '.data.email // ""' <<<"$(exige GET "/customers/$client" '' "$J")")" = "" ]; then
    exige PUT "/customers/$client" "$(jq -n --arg n "$nom_client" --arg e "client-$(echo "$E" | tr 'A-Z' 'a-z')@decor.local" \
      '{name:$n, email:$e}')" "$J" >/dev/null
    neuf "$E adresse du client"
  fi

  # Les contacts n'ont pas de route `GET /:contactId` : on les reconnaît dans
  # leur liste, par leur nom. Relire l'identifiant du manifeste sur une route
  # inexistante rendrait 404, donc « absent », donc un doublon à chaque passage.
  id="$(id_par_champ "/customers/$client/contacts" name "$prefixe Contact client" "$J")"
  if [ -z "$id" ]; then
    reponse="$(exige POST "/customers/$client/contacts" "$(jq -n --arg n "$prefixe Contact client" \
      '{name:$n, role:"Achats", phone:"0551111111", isPrimary:true}')" "$J")"
    id="$(valeur_ou_echec '.data.id' "$reponse" 'POST /customers/:id/contacts')"
    neuf "$E contact client"
  else deja "$E contact client"; fi
  noter "ressources.$E.clientContact" "$id"

  local nom_fournisseur="$prefixe Fournisseur"
  id="$(id_par_nom /suppliers "$nom_fournisseur" "$J")"
  if [ -z "$id" ]; then
    reponse="$(exige POST /suppliers "$(jq -n --arg n "$nom_fournisseur" \
      '{name:$n, city:"Alger", country:"Algérie", phone:"0552222222",
        notes:"Posé par scripts/provision-decor.sh"}')" "$J")"
    id="$(valeur_ou_echec '.data.id' "$reponse" 'POST /suppliers')"
    neuf "$E fournisseur"
  else deja "$E fournisseur"; fi
  local fournisseur="$id"; noter "ressources.$E.fournisseur" "$fournisseur"

  id="$(id_par_champ "/suppliers/$fournisseur/contacts" name "$prefixe Contact fournisseur" "$J")"
  if [ -z "$id" ]; then
    reponse="$(exige POST "/suppliers/$fournisseur/contacts" "$(jq -n --arg n "$prefixe Contact fournisseur" \
      '{name:$n, role:"Ventes", phone:"0553333333", isPrimary:true}')" "$J")"
    id="$(valeur_ou_echec '.data.id' "$reponse" 'POST /suppliers/:id/contacts')"
    neuf "$E contact fournisseur"
  else deja "$E contact fournisseur"; fi
  noter "ressources.$E.fournisseurContact" "$id"

  # ── Catalogue ────────────────────────────────────────────────────────────
  # Deux articles, et c'est délibéré : « Matiere » est ce qu'on achète et ce
  # que la nomenclature consomme ; « Article » est ce qu'on vend. Un seul
  # article servant des deux côtés produirait une recette qui se consomme
  # elle-même — une situation que le métier n'a pas, donc un décor qui
  # n'éprouve rien de réel.
  local nom_matiere="$prefixe Matiere"
  id="$(id_par_nom /products "$nom_matiere" "$J")"
  if [ -z "$id" ]; then
    reponse="$(exige POST /products "$(jq -n --arg n "$nom_matiere" \
      '{type:"material", name:$n, unit:"kg", lastCostPerUnit:800, alertThreshold:10,
        minStock:5, category:"Décor de test"}')" "$J")"
    id="$(valeur_ou_echec '.data.id' "$reponse" 'POST /products (matière)')"
    neuf "$E matière"
  else deja "$E matière"; fi
  local matiere="$id"; noter "ressources.$E.matiere" "$matiere"

  local nom_article="$prefixe Article"
  id="$(id_par_nom /products "$nom_article" "$J")"
  if [ -z "$id" ]; then
    reponse="$(exige POST /products "$(jq -n --arg n "$nom_article" \
      '{type:"both", name:$n, unit:"kg", defaultSalesPrice:1200, lastCostPerUnit:800,
        taxRate:19, alertThreshold:5, minStock:2, category:"Décor de test"}')" "$J")"
    id="$(valeur_ou_echec '.data.id' "$reponse" 'POST /products (article)')"
    neuf "$E article"
  else deja "$E article"; fi
  local article="$id"; noter "ressources.$E.article" "$article"

  # ⚠️ Le serveur **normalise** le code : `DECOR-A-CB-001` est stocké
  # `DECORACB001` (`normaliserCodeBarres`, src/products/barcodes.service.ts).
  # Deux conséquences, toutes deux trouvées au second passage :
  #
  #   - chercher la valeur envoyée ne retrouve jamais la ligne posée, donc le
  #     décor recréait le code à chaque fois — et se heurtait au 409 d'unicité ;
  #   - le manifeste annonçait la valeur **envoyée**, que `GET
  #     /products/by-barcode/:code` ne connaît pas. Un banc l'aurait lue, aurait
  #     reçu 404, et aurait accusé la route.
  #
  # On reconnaît donc le code par son article — il n'y en a qu'un, sur un
  # article que le décor vient de créer — et on note ce que le serveur a
  # **stocké**, jamais ce qu'on lui a envoyé.
  local codes; codes="$(exige GET "/products/$article/barcodes" '' "$J")"
  id="$(jq -r 'first(.data[].id) // ""' <<<"$codes")"
  if [ -z "$id" ]; then
    # Code interne : un EAN13 exige une clé de contrôle juste, et fabriquer un
    # code valide ici dupliquerait la règle que `verifier-codes-barres.js`
    # éprouve déjà (mode M2).
    reponse="$(exige POST "/products/$article/barcodes" "$(jq -n --arg c "$prefixe-CB-001" \
      '{barcode:$c, type:"INTERNE", packQuantity:1, isPrimary:true, label:"Décor"}')" "$J")"
    id="$(valeur_ou_echec '.data.id' "$reponse" 'POST /products/:id/barcodes')"
    codes="$(exige GET "/products/$article/barcodes" '' "$J")"
    neuf "$E code-barres"
  else deja "$E code-barres"; fi
  noter "ressources.$E.codeBarres" "$id"
  noter "ressources.$E.codeBarresValeur" \
    "$(jq -r --arg i "$id" 'first(.data[] | select(.id == $i) | .barcode) // ""' <<<"$codes")"

  id="$(id_par_champ "/products/$article/suppliers" supplierId "$fournisseur" "$J")"
  if [ -z "$id" ]; then
    reponse="$(exige POST "/products/$article/suppliers" "$(jq -n --arg s "$fournisseur" \
      '{supplierId:$s, supplierRef:"REF-DECOR", purchasePrice:800, leadTimeDays:7, isPreferred:true}')" "$J")"
    id="$(valeur_ou_echec '.data.id' "$reponse" 'POST /products/:id/suppliers')"
    neuf "$E lien article-fournisseur"
  else deja "$E lien article-fournisseur"; fi
  noter "ressources.$E.lienFournisseur" "$id"

  local nom_grille="$prefixe Grille"
  # `GET /price-lists` ne prend ni pagination ni recherche : on liste et on
  # filtre ici.
  id="$(id_par_champ /price-lists name "$nom_grille" "$J")"
  if [ -z "$id" ]; then
    reponse="$(exige POST /price-lists "$(jq -n --arg n "$nom_grille" \
      '{name:$n, description:"Grille posée par le décor", isActive:true}')" "$J")"
    id="$(valeur_ou_echec '.data.id' "$reponse" 'POST /price-lists')"
    exige PUT "/price-lists/$id/items" "$(jq -n --arg a "$article" \
      '{items:[{finishedProductId:$a, unitPrice:1100}]}')" "$J" >/dev/null
    neuf "$E grille tarifaire"
  else deja "$E grille tarifaire"; fi
  noter "ressources.$E.grille" "$id"

  # ── Achats ───────────────────────────────────────────────────────────────
  # Une commande en brouillon suffit à la réception (`['sent','draft']`), donc
  # aucun changement de statut n'est provoqué ici : le décor pose l'état de
  # départ, il ne joue pas le cycle de vie. C'est le banc qui le jouera.
  id="$(id_reutilisable "ressources.$E.commandeAchat" /purchases/purchase-orders "$J")"
  if [ -z "$id" ]; then
    reponse="$(exige POST /purchases/purchase-orders "$(jq -n \
      --arg f "$fournisseur" --arg d "$AUJOURDHUI" --arg m "$matiere" --arg a "$article" \
      '{supplierId:$f, orderDate:$d, notes:"Décor",
        items:[{rawMaterialId:$m, quantity:200, unit:"kg", unitPrice:800, taxRate:19},
               {rawMaterialId:$a, quantity:100, unit:"kg", unitPrice:900, taxRate:19}]}')" "$J")"
    id="$(valeur_ou_echec '.data.id' "$reponse" 'POST /purchases/purchase-orders')"
    neuf "$E commande d'achat"
  else deja "$E commande d'achat"; fi
  local commande="$id"; noter "ressources.$E.commandeAchat" "$commande"

  # La réception est ce qui donne du stock. Elle doit précéder le BL de vente,
  # sinon la livraison sort d'un stock vide et le décor pose un état que le
  # métier n'atteint pas.
  id="$(id_reutilisable "ressources.$E.receptionBl" /purchases/reception-bls "$J")"
  if [ -z "$id" ]; then
    reponse="$(exige POST /purchases/reception-bls "$(jq -n \
      --arg c "$commande" --arg d "$AUJOURDHUI" --arg m "$matiere" --arg a "$article" --arg p "$prefixe" \
      '{purchaseOrderId:$c, receptionDate:$d, notes:"Décor",
        items:[{rawMaterialId:$m, quantityReceived:200, costPerUnit:800, batchNumber:($p+"-LOT-M1")},
               {rawMaterialId:$a, quantityReceived:100, costPerUnit:900, batchNumber:($p+"-LOT-A1")}]}')" "$J")"
    id="$(valeur_ou_echec '.data.id' "$reponse" 'POST /purchases/reception-bls')"
    neuf "$E réception (stock alimenté)"
  else deja "$E réception"; fi
  local reception="$id"; noter "ressources.$E.receptionBl" "$reception"

  id="$(id_reutilisable "ressources.$E.factureFournisseur" /purchases/vendor-bills "$J")"
  if [ -z "$id" ]; then
    reponse="$(exige POST /purchases/vendor-bills "$(jq -n \
      --arg f "$fournisseur" --arg c "$commande" --arg r "$reception" \
      --arg d "$AUJOURDHUI" --arg e "$DANS_UN_MOIS" --arg m "$matiere" \
      '{supplierId:$f, purchaseOrderId:$c, receptionBlId:$r, billDate:$d, dueDate:$e,
        items:[{finishedProductId:$m, description:"Décor", quantity:200, unit:"kg",
                unitPrice:800, taxRate:19}]}')" "$J")"
    id="$(valeur_ou_echec '.data.id' "$reponse" 'POST /purchases/vendor-bills')"
    neuf "$E facture fournisseur"
  else deja "$E facture fournisseur"; fi
  noter "ressources.$E.factureFournisseur" "$id"

  # ── Ventes ───────────────────────────────────────────────────────────────
  id="$(id_reutilisable "ressources.$E.devis" /quotes "$J")"
  if [ -z "$id" ]; then
    reponse="$(exige POST /quotes "$(jq -n \
      --arg c "$client" --arg d "$AUJOURDHUI" --arg e "$DANS_UN_MOIS" --arg a "$article" \
      '{customerId:$c, quoteDate:$d, expiryDate:$e, notes:"Décor",
        items:[{finishedProductId:$a, quantity:10, unit:"kg", unitPrice:1200,
                taxName1:"TVA", taxRate1:19}]}')" "$J")"
    id="$(valeur_ou_echec '.data.id' "$reponse" 'POST /quotes')"
    neuf "$E devis"
  else deja "$E devis"; fi
  noter "ressources.$E.devis" "$id"

  id="$(id_reutilisable "ressources.$E.bonLivraison" /deliveries/delivery-notes "$J")"
  if [ -z "$id" ]; then
    reponse="$(exige POST /deliveries/delivery-notes "$(jq -n \
      --arg c "$client" --arg d "$AUJOURDHUI" --arg a "$article" \
      '{customerId:$c, deliveryDate:$d, notes:"Décor",
        items:[{finishedProductId:$a, quantity:5, unit:"kg", unitPrice:1200,
                taxName1:"TVA", taxRate1:19}]}')" "$J")"
    id="$(valeur_ou_echec '.data.id' "$reponse" 'POST /deliveries/delivery-notes')"
    neuf "$E bon de livraison"
  else deja "$E bon de livraison"; fi
  noter "ressources.$E.bonLivraison" "$id"

  id="$(id_reutilisable "ressources.$E.facture" /invoices/sales-invoices "$J")"
  if [ -z "$id" ]; then
    reponse="$(exige POST /invoices/sales-invoices "$(jq -n \
      --arg c "$client" --arg d "$AUJOURDHUI" --arg e "$DANS_UN_MOIS" --arg a "$article" \
      '{customerId:$c, invoiceDate:$d, dueDate:$e, paymentMode:"bank_transfer", notes:"Décor",
        items:[{finishedProductId:$a, quantity:4, unit:"kg", unitPrice:1200,
                taxName1:"TVA", taxRate1:19}]}')" "$J")"
    id="$(valeur_ou_echec '.data.id' "$reponse" 'POST /invoices/sales-invoices')"
    neuf "$E facture"
  else deja "$E facture"; fi
  local facture="$id"; noter "ressources.$E.facture" "$facture"

  # ── La chaîne BL → facture, que le parcours écran ne peut pas poser ──────
  #
  # Un test Playwright vérifie qu'une facture issue d'un BL mène au BL, et que
  # le BL renvoie vers elle. Il cherchait cette paire **sur la première page**
  # de la liste des factures — et les tests qui tournaient avant lui en créaient
  # assez pour l'en chasser. Il passait seul, échouait après les autres :
  # M7 (la pagination) aggravé par M8 (l'état laissé par les précédents).
  #
  # Le décor pose donc la paire, avec le nom du client pour la retrouver par la
  # recherche — qui interroge le serveur, et fait disparaître la pagination du
  # problème.
  #
  # ⚠️ Un **second** BL, distinct de celui laissé à l'état initial : convertir
  # le premier le ferait passer en « facturé » et priverait le banc des cycles
  # de vie de son point de départ.
  id="$(id_reutilisable "ressources.$E.blFacture" /deliveries/delivery-notes "$J")"
  if [ -z "$id" ]; then
    reponse="$(exige POST /deliveries/delivery-notes "$(jq -n \
      --arg c "$client" --arg d "$AUJOURDHUI" --arg a "$article" \
      '{customerId:$c, deliveryDate:$d, notes:"Décor — BL destiné à être facturé",
        items:[{finishedProductId:$a, quantity:1, unit:"kg", unitPrice:1200,
                taxName1:"TVA", taxRate1:19}]}')" "$J")"
    id="$(valeur_ou_echec '.data.id' "$reponse" 'POST /deliveries/delivery-notes (à facturer)')"
    # `create-invoice` exige un BL au moins « envoyé ».
    exige PATCH "/deliveries/delivery-notes/$id/status" '{"status":"sent"}' "$J" >/dev/null
    neuf "$E BL destiné à la facturation"
  else deja "$E BL destiné à la facturation"; fi
  local bl_facture="$id"; noter "ressources.$E.blFacture" "$bl_facture"

  id="$(id_reutilisable "ressources.$E.factureDepuisBl" /invoices/sales-invoices "$J")"
  if [ -z "$id" ]; then
    # La facture est rendue sous `data.invoiceCreated`, pas sous `data` — même
    # forme que la conversion d'un devis.
    reponse="$(exige POST "/deliveries/delivery-notes/$bl_facture/create-invoice" '{}' "$J")"
    id="$(valeur_ou_echec '.data.invoiceCreated.id' "$reponse" 'POST /deliveries/…/create-invoice')"
    neuf "$E facture issue du BL"
  else deja "$E facture issue du BL"; fi
  noter "ressources.$E.factureDepuisBl" "$id"

  # Règlement **partiel**, délibérément : une facture soldée passe en `paid` et
  # sort de l'ensemble des factures encaissables. Le décor doit laisser un
  # document dans un état intermédiaire, sans quoi les transitions interdites
  # n'ont rien à refuser.
  id="$(id_reutilisable "ressources.$E.reglement" /invoices/payments "$J")"
  if [ -z "$id" ]; then
    reponse="$(exige POST /invoices/payments "$(jq -n \
      --arg f "$facture" --arg d "$AUJOURDHUI" \
      '{salesInvoiceId:$f, amount:1000, paymentDate:$d, paymentMethod:"bank_transfer",
        reference:"DECOR-REG-001", notes:"Règlement partiel — décor"}')" "$J")"
    id="$(valeur_ou_echec '.data.id' "$reponse" 'POST /invoices/payments')"
    neuf "$E règlement partiel"
  else deja "$E règlement partiel"; fi
  noter "ressources.$E.reglement" "$id"

  id="$(id_reutilisable "ressources.$E.avoir" /invoices/credit-notes "$J")"
  if [ -z "$id" ]; then
    reponse="$(exige POST /invoices/credit-notes "$(jq -n \
      --arg c "$client" --arg f "$facture" --arg d "$AUJOURDHUI" \
      '{customerId:$c, salesInvoiceId:$f, creditNoteDate:$d, reason:"Décor",
        items:[{description:"Retour décor", quantity:1, unit:"kg", unitPrice:1200,
                taxName1:"TVA", taxRate1:19}]}')" "$J")"
    id="$(valeur_ou_echec '.data.id' "$reponse" 'POST /invoices/credit-notes')"
    neuf "$E avoir"
  else deja "$E avoir"; fi
  noter "ressources.$E.avoir" "$id"

  # `/invoices/recurring` n'expose pas de `GET /:id` — reconnaissance par le
  # libellé, qui est justement stable.
  id="$(id_par_champ /invoices/recurring label "$prefixe Abonnement" "$J")"
  if [ -z "$id" ]; then
    reponse="$(exige POST /invoices/recurring "$(jq -n \
      --arg l "$prefixe Abonnement" --arg c "$client" --arg d "$MOIS_PROCHAIN" --arg a "$article" \
      '{label:$l, customerId:$c, frequency:"monthly", startDate:$d, paymentTermsDays:30,
        paymentMode:"bank_transfer",
        items:[{finishedProductId:$a, quantity:1, unit:"kg", unitPrice:1200, taxRate1:19}]}')" "$J")"
    id="$(valeur_ou_echec '.data.id' "$reponse" 'POST /invoices/recurring')"
    neuf "$E facture récurrente"
  else deja "$E facture récurrente"; fi
  noter "ressources.$E.factureRecurrente" "$id"

  # ── Dépenses ─────────────────────────────────────────────────────────────
  id="$(id_reutilisable "ressources.$E.depense" /expenses "$J")"
  if [ -z "$id" ]; then
    reponse="$(exige POST /expenses "$(jq -n \
      --arg d "$AUJOURDHUI" --arg n "$prefixe Dépense" --arg f "$fournisseur" \
      '{expenseDate:$d, description:$n, category:"other", amount:5000,
        supplierId:$f, paymentMethod:"cash", vatRate:19}')" "$J")"
    id="$(valeur_ou_echec '.data.id' "$reponse" 'POST /expenses')"
    neuf "$E dépense (non approuvée)"
  else deja "$E dépense"; fi
  noter "ressources.$E.depense" "$id"

  # ── Production ───────────────────────────────────────────────────────────
  local nom_recette="$prefixe Recette"
  id="$(id_par_nom /production/nomenclatures "$nom_recette" "$J")"
  if [ -z "$id" ]; then
    reponse="$(exige POST /production/nomenclatures "$(jq -n \
      --arg n "$nom_recette" --arg a "$article" --arg m "$matiere" --arg c "$prefixe-NOM-1" \
      '{code:$c, name:$n, description:"Recette posée par le décor", finishedProductId:$a,
        lines:[{order:1, rawMaterialId:$m, quantityPerUnit:2, unit:"kg"}]}')" "$J")"
    id="$(valeur_ou_echec '.data.id' "$reponse" 'POST /production/nomenclatures')"
    neuf "$E nomenclature"
  else deja "$E nomenclature"; fi
  local recette="$id"; noter "ressources.$E.nomenclature" "$recette"

  # Ordre laissé au statut initial : `start`, `complete` et `cancel` sont des
  # transitions, et une transition jouée par le décor est une transition que
  # le banc ne pourra plus éprouver.
  id="$(id_reutilisable "ressources.$E.ordreProduction" /production/orders "$J")"
  if [ -z "$id" ]; then
    reponse="$(exige POST /production/orders "$(jq -n \
      --arg r "$recette" --arg d "$AUJOURDHUI" \
      '{nomenclatureId:$r, quantityToProduce:10, priority:"normal", plannedStartDate:$d,
        notes:"Décor — laissé au statut initial"}')" "$J")"
    id="$(valeur_ou_echec '.data.id' "$reponse" 'POST /production/orders')"
    neuf "$E ordre de fabrication"
  else deja "$E ordre de fabrication"; fi
  noter "ressources.$E.ordreProduction" "$id"
}

poser_ressources A "$JETON_A"
poser_ressources B "$JETON_B"
ok "Données de référence en place des deux côtés"

# ─────────────────────────────────────────────────────────────────────────────
etape "7. Signatures de vérification — pour la seule route publique à identifiant"
# ─────────────────────────────────────────────────────────────────────────────

# `/verify/:type/:id/:signature` est publique et assumée (R023). Un banc doit
# pouvoir l'appeler avec une signature juste **et** une signature fausse : sans
# les deux, il n'a montré que sa capacité à dire oui (R030).
#
# La signature n'est pas recopiée : elle est dérivée comme le serveur la dérive
# — HMAC(HMAC(JWT_SECRET, 'verification-document-v1'), 'type:id'), tronquée à
# 16 caractères en base64url. Recopier la règle serait le mode M2 ; ici il n'y
# a pas d'autre choix que de la refaire, alors elle est refaite à l'identique
# et le lien vers la source est écrit : src/common/verification.ts.
signer() { # TYPE ID → signature, vide si impossible
  local secret_cle
  secret_cle="$(printf '%s' 'verification-document-v1' \
    | openssl dgst -sha256 -mac HMAC -macopt "key:$JWT_SECRET" -binary 2>/dev/null | xxd -p -c 256)"
  [ -n "$secret_cle" ] || { printf ''; return 0; }
  printf '%s:%s' "$1" "$2" \
    | openssl dgst -sha256 -mac HMAC -macopt "hexkey:$secret_cle" -binary 2>/dev/null \
    | base64 | tr '+/' '-_' | tr -d '=\n' | cut -c1-16
}

JWT_SECRET="${JWT_SECRET:-}"
if [ -z "$JWT_SECRET" ] && [ -f "$RACINE/.env" ]; then
  JWT_SECRET="$(sed -n 's/^JWT_SECRET=//p' "$RACINE/.env" | head -1 | tr -d '"'"'"'\r')"
fi

if [ -z "$JWT_SECRET" ] || ! command -v openssl >/dev/null 2>&1 || ! command -v xxd >/dev/null 2>&1; then
  info "⚠️ Signatures non calculées — JWT_SECRET introuvable, ou openssl/xxd absent."
  info "   Les bancs devront traiter /verify comme non couvert, et l'écrire au"
  info "   registre de couverture : une absence non écrite est indiscernable d'un oubli."
  noter "verification.disponible" "non"
else
  for E in A B; do
    for couple in "facture:facture" "devis:devis" "bl:bonLivraison" "avoir:avoir"; do
      type="${couple%%:*}"; cle="${couple##*:}"
      id="${REF[ressources.$E.$cle]}"
      noter "verification.$E.$type.id" "$id"
      noter "verification.$E.$type.signature" "$(signer "$type" "$id")"
    done
  done
  noter "verification.disponible" "oui"
  # Une signature fausse, de la bonne longueur : un refus dû à une longueur
  # invalide ne prouverait pas que la vérification a lieu.
  noter "verification.signatureFausse" "AAAAAAAAAAAAAAAA"
  ok "Signatures calculées pour les 4 types vérifiables, des deux côtés"
fi

# ─────────────────────────────────────────────────────────────────────────────
etape "8. Manifeste"
# ─────────────────────────────────────────────────────────────────────────────

noter "comptes.A.owner.email" "$EMAIL_A_OWNER"
noter "comptes.A.owner.motDePasse" "$MDP_A_OWNER"
noter "comptes.A.manager.email" "manager@chambre-froide.dz"
noter "comptes.A.manager.motDePasse" "manager1234"
noter "comptes.A.agent.email" "agent@chambre-froide.dz"
noter "comptes.A.agent.motDePasse" "agent1234"
noter "comptes.A.accountant.email" "$EMAIL_A_COMPTABLE"
noter "comptes.A.accountant.motDePasse" "$MDP_DECOR"
noter "comptes.B.owner.email" "$EMAIL_B_OWNER"
noter "comptes.B.owner.motDePasse" "$MDP_DECOR"
noter "comptes.B.manager.email" "$EMAIL_B_MANAGER"
noter "comptes.B.manager.motDePasse" "$MDP_DECOR"
noter "comptes.B.agent.email" "$EMAIL_B_AGENT"
noter "comptes.B.agent.motDePasse" "$MDP_DECOR"
noter "comptes.B.accountant.email" "$EMAIL_B_COMPTABLE"
noter "comptes.B.accountant.motDePasse" "$MDP_DECOR"
noter "comptes.superadmin.email" "$EMAIL_SUPERADMIN"
noter "comptes.superadmin.motDePasse" "$MDP_SUPERADMIN"
noter "comptes.superadmin.cheminConnexion" "/admin/auth/login"
noter "api" "$API"
noter "marque" "$MARQUE"

CORPS='{}'
for cle in "${!REF[@]}"; do
  CORPS="$(jq -c --arg k "$cle" --arg v "${REF[$cle]}" 'setpath($k|split("."); $v)' <<<"$CORPS")"
done

mkdir -p "$RACINE/$DOSSIER"
jq -S . <<<"$CORPS" > "$MANIFESTE"
ok "Manifeste écrit — $DOSSIER/manifeste.json"

RESSOURCES_A="$(jq -r '.ressources.A | length' "$MANIFESTE")"
RESSOURCES_B="$(jq -r '.ressources.B | length' "$MANIFESTE")"
[ "$RESSOURCES_A" = "$RESSOURCES_B" ] || echouer \
  "Décor asymétrique : $RESSOURCES_A ressources dans A, $RESSOURCES_B dans B.
   Le banc de cloisonnement compare les deux côtés ; une famille présente d'un
   seul côté sortirait de l'ensemble testé sans que rien ne rougisse (mode M11)."

# ─────────────────────────────────────────────────────────────────────────────

cat <<TERMINE

════════════════════════════════════════════════════════════════
  Décor posé — $RESSOURCES_A familles de ressources dans chacun des 2 locataires
════════════════════════════════════════════════════════════════

  Locataire A  $TENANT_A   (Chambre Froide Djelfa — seed)
  Locataire B  $TENANT_B   ($SOCIETE_B)

  Tout identifiant est dans le manifeste. Le lire, ne rien deviner :

    jq . $DOSSIER/manifeste.json
    jq -r '.ressources.B.facture' $DOSSIER/manifeste.json

  ── Ce qui peut tourner dès maintenant ────────────────────────────

    # Étage 4 — la suite existante (24 fichiers, désigne par le libellé
    # français : elle échouera en arabe, voir M6 et l'étape 6 du chantier)
    cd e2e && npx playwright test

  ── Ce que le manifeste attend, et qui reste à écrire ─────────────

    # Étape 2 — banc de frontière   (squelette : docs/methode-test/banc-refus-http.py)
    python3 scripts/banc-refus-http.py --decor $DOSSIER/manifeste.json --self-test

    # Étape 3 — banc de cloisonnement   (aucun squelette : à écrire)
    python3 scripts/banc-cloisonnement.py --decor $DOSSIER/manifeste.json

  ── Budget consommé par ce passage ────────────────────────────────

    /auth/login  2 sur 10 par minute.  Deux passages coup sur coup en
    consomment 4 : le décor est rejouable immédiatement.

TERMINE
