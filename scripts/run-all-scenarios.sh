#!/usr/bin/env bash
#
# Rejoue TOUT le chantier, et dit ce qui passe — étape 7.
#
# ── Pourquoi ce lanceur ─────────────────────────────────────────────────────
#
# Les bancs s'accumulent un par un, et personne ne les rejoue tous : chacun est
# lancé le jour où il est écrit, puis oublié. Or ils partagent une base et une
# infrastructure — un lot qui casse l'un casse souvent les autres, et on ne le
# voit qu'au prochain passage manuel.
#
# ⚠️ **Pas de `set -e`, délibérément** (M10 appliqué au lot). Un `set -e` global
# sortirait au premier échec, donc on ne saurait jamais si les suivants passent
# — et c'est précisément l'information qu'on cherche en rejouant une suite.
# Chaque contrôle est isolé, son code relevé, et le tableau final dit tout.
#
# ── Ce qu'il fait, que le squelette d'origine ne faisait pas ────────────────
#
# Le squelette annonçait : *« il n'existe pas de commande unique “tout est
# vert” — c'est une limite connue de la méthode, pas un oubli. »*
#
# Ici elle n'a pas lieu d'être. `--tout` ajoute la chaîne statique
# (`npm run verify`, dix vérificateurs qui ne demandent aucune infrastructure)
# aux bancs et aux vérificateurs de base. La boucle courte reste la boucle
# courte ; la commande unique existe quand on la veut.
#
# ── Ce qu'il ne fait pas ────────────────────────────────────────────────────
#
# Il ne lance pas la suite Playwright (`e2e/`) : elle exige le serveur web, un
# navigateur, et **elle désigne ses cibles par le libellé français** — elle
# échouerait en arabe pour une raison sans rapport avec un défaut (M6). C'est
# l'étape 6 du chantier, et tant qu'elle n'est pas faite, l'inclure ici rendrait
# le tableau menteur.
#
# ── Usage ───────────────────────────────────────────────────────────────────
#
#   ./scripts/run-all-scenarios.sh              # décor + bancs + base
#   ./scripts/run-all-scenarios.sh --tout       # + la chaîne statique
#   ./scripts/run-all-scenarios.sh --liste      # l'ordre et ses raisons
#
#   SEUL=motif    ne joue que les contrôles dont le nom contient `motif`
#   PACE=0        secondes entre deux contrôles (défaut 3 ; voir M9)
#   LOGDIR=/tmp/… où écrire les journaux

set -uo pipefail   # PAS de `-e` : voir l'en-tête.

SEUL="${SEUL:-}"
ICI="$(cd "$(dirname "$0")" && pwd)"
RACINE="$(cd "$ICI/.." && pwd)"
LOGDIR="${LOGDIR:-/tmp/echango-bancs}"
PACE="${PACE:-3}"
mkdir -p "$LOGDIR"

TOUT=0; LISTE=0
for a in "$@"; do
  case "$a" in
    --tout)  TOUT=1 ;;
    --liste) LISTE=1 ;;
  esac
done

# ─────────────────────────────────────────────────────────────────────────────
# L'ordre, et pourquoi chaque entrée est là où elle est
# ─────────────────────────────────────────────────────────────────────────────
#
# Quatre principes, par priorité décroissante :
#
#   1. **Le décor d'abord.** Tout le reste lit `.decor/manifeste.json`. Un banc
#      lancé sans lui échoue en annonçant « manifeste absent », ce qui est juste
#      mais fait perdre un passage entier.
#   2. **Ce qui n'écrit rien ensuite.** Un banc qui n'appelle que des routes
#      devant refuser ne peut pas salir ce que lisent les suivants — et son
#      échec se lit sans démêler ce que les autres ont laissé.
#   3. **Ce qui lit des agrégats avant ce qui écrit.** Les compteurs et la
#      comptabilité se jugent sur le jeu de démonstration ; les bancs qui
#      fabriquent des documents décalent ces totaux à chaque passage.
#   4. **Ce qui écrit en dernier**, et dans le locataire de test uniquement.
#
# Chaque entrée : `nom|commande|raison de sa place`

CONTROLES=(
"décor|./scripts/provision-decor.sh|préalable de tout le reste : c'est lui qui écrit le manifeste que les bancs lisent"
"frontière|python3 scripts/banc-refus-http.py|n'écrit rien — 481 sondes sur des identifiants inexistants, toutes doivent être refusées"
"matrice des rôles|python3 scripts/banc-matrice-roles.py|n'écrit rien non plus — 795 sondes qui meurent sur le garde de rôle"
"cloisonnement|python3 scripts/banc-cloisonnement.py|n'écrit rien TANT QUE l'isolation tient ; si elle cède, il l'aura prouvé en abîmant le décor, qui se repose au passage suivant"
"compteurs|python3 scripts/banc-compteurs.py|LIT les agrégats du locataire de démonstration : doit passer AVANT les bancs qui fabriquent des documents, sinon les totaux bougent sous lui"
"comptabilité|node scripts/verifier-comptabilite.js|même raison — les bornes de plausibilité se jugent sur une activité réelle"
"production / stock|node scripts/verifier-production.js|écrit, mais dans une transaction annulée : sans effet sur les suivants"
"dates|python3 scripts/banc-dates.py|ÉCRIT — 31 documents dans le locataire de test"
"cycles de vie|python3 scripts/banc-cycles-de-vie.py|ÉCRIT — ~42 documents, et fait bouger des statuts"
"effets de bord|python3 scripts/banc-effets-de-bord.py|ÉCRIT le plus : réceptionne, livre, encaisse, convertit. En dernier des bancs, pour ne rien décaler sous les autres"
)

CHAINE_STATIQUE=(
"chaîne statique|npm run verify|dix vérificateurs sans infrastructure — lancés en dernier parce qu'ils ne dépendent de rien et n'apprennent rien sur les bancs"
)

if [ "$TOUT" -eq 1 ]; then
  CONTROLES+=("${CHAINE_STATIQUE[@]}")
fi

if [ "$LISTE" -eq 1 ]; then
  echo "Ordre d'exécution, et sa justification :"
  echo
  n=0
  for entree in "${CONTROLES[@]}"; do
    n=$((n + 1))
    IFS='|' read -r nom cmd raison <<<"$entree"
    printf '%2d. %-20s %s\n' "$n" "$nom" "$cmd"
    printf '    %s\n\n' "$raison"
  done
  echo "Ajouter --tout pour inclure la chaîne statique."
  exit 0
fi

# Node 22 est exigé par le projet ; sans lui l'échec est obscur (CLAUDE.md §10).
if [ -s "$HOME/.nvm/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1 && nvm use 22 >/dev/null 2>&1
fi

# ⚠️ L'API doit répondre AVANT de commencer. Sans elle, les dix contrôles
# échouent l'un après l'autre en dix minutes, et le tableau final dit « tout est
# cassé » là où la vraie phrase est « le serveur n'est pas lancé ».
API="${BASE_URL:-http://localhost:3000/api/v1}"
if [ "$(curl -sS -o /dev/null -w '%{http_code}' "$API/health" 2>/dev/null)" != "200" ]; then
  echo "❌ L'API ne répond pas sur $API/health."
  echo "   Lancer « npm run start:dev » — sans elle, ce lot n'apprendrait rien."
  exit 2
fi

cd "$RACINE" || exit 2

noms=(); codes=(); notes=()
debut_lot=$(date +%s)

for entree in "${CONTROLES[@]}"; do
  IFS='|' read -r nom cmd _ <<<"$entree"
  [ -z "$SEUL" ] || case "$nom" in *"$SEUL"*) ;; *) continue ;; esac

  # ⚠️ Temporisation entre contrôles (M9). Les routes d'authentification sont
  # plafonnées ; enchaînés sans pause, les bancs se refusent mutuellement
  # l'accès — et le refus arrive déguisé en « identifiants incorrects », ce qui
  # envoie chercher un bug d'authentification pour un problème qui se résout en
  # attendant. Trois secondes suffisent ici : chaque banc ne consomme qu'une à
  # cinq connexions, très loin du plafond de dix par minute.
  if [ "${#noms[@]}" -gt 0 ] && [ "$PACE" -gt 0 ]; then
    sleep "$PACE"
  fi

  journal="$LOGDIR/$(echo "$nom" | tr ' /' '__').log"
  printf '\n════ %s ════\n' "$nom"
  debut=$(date +%s)
  # ⚠️ Journal dans un fichier, code relevé JUSTE APRÈS (M10, R025). Un
  # `commande | tail` rendrait le code de `tail`, donc toujours 0.
  eval "$cmd" >"$journal" 2>&1
  code=$?
  duree=$(( $(date +%s) - debut ))

  note=""
  if [ "$code" -ne 0 ] && grep -qiE 'throttl|too many requests|429' "$journal" 2>/dev/null; then
    note="plafond de requêtes (429) — rejouer plus tard, ce n'est pas un défaut"
  fi

  noms+=("$nom"); codes+=("$code"); notes+=("$note")
  if [ "$code" -eq 0 ]; then
    echo "✅ $nom (${duree}s)"
  else
    echo "❌ $nom — code $code (${duree}s)${note:+ — $note}"
    tail -8 "$journal" | sed 's/^/   /'
  fi
done

duree_lot=$(( $(date +%s) - debut_lot ))

echo
echo "════════════════════════════════════════════════════════════════"
ok=0; ko=0
for i in "${!noms[@]}"; do
  if [ "${codes[$i]}" -eq 0 ]; then
    printf '  ✅ %-22s\n' "${noms[$i]}"; ok=$((ok + 1))
  else
    printf '  ❌ %-22s code %s %s\n' "${noms[$i]}" "${codes[$i]}" "${notes[$i]}"; ko=$((ko + 1))
  fi
done
echo "════════════════════════════════════════════════════════════════"
echo "  $ok passés, $ko échoués sur ${#noms[@]} — ${duree_lot}s — journaux dans $LOGDIR"

# ⚠️ Deux contrôles sont ROUGES À DESSEIN, et ce n'est pas une négligence : ils
# portent des défauts constatés que seul le métier peut trancher. Les taire
# reviendrait à les oublier ; les compter comme des échecs ordinaires
# reviendrait à noyer les vrais.
if [ "$ko" -gt 0 ]; then
  echo
  echo "  Rouges attendus tant que le produit n'a pas tranché :"
  echo "    · cycles de vie   → E021, une facture émise rouverte et réécrite"
  echo "                        sous le même numéro"
  echo "    · effets de bord  → E022, l'état « reserved » que rien n'écrit,"
  echo "                        et la TVA de 19 % qui n'est pas calculée"
  echo "    · compteurs       → E022 ①, les deux agrégats à zéro perpétuel"
  echo "  Tout autre rouge est une régression. Voir docs/ERREURS.md."
fi

[ "$ko" -eq 0 ]
