# Squelettes de la méthode de test

Repris de `echangopromo/docs/methode-test/`. Ce sont des **patrons à
instancier**, pas des scripts prêts à tourner : chacun porte des marqueurs
`À ADAPTER`.

**Les copier dans `scripts/` avant de les modifier.** Un squelette qu'on
retouche sur place cesse d'être un squelette — et le prochain projet repartira
d'un fichier déjà tordu pour celui-ci.

| Fichier | Étage | Ce qu'il donne | Adaptation attendue |
|---|---|---|---|
| `banc-refus-http.py` | 3 | énumère les routes depuis la source NestJS, trois sondes de refus par route, `--self-test`, `--list` | `SRC_DIR=src`, les routes publiques de **R023**, les cinq rôles du projet, les clés d'erreur de `shared/src/i18n/fr.json` |
| `provision-decor.sh` | — | décor idempotent à identifiants stables, imprime la commande de test | **fait** → `scripts/provision-decor.sh` (2026-08-09) |
| `run-all-scenarios.sh` | 3 | orchestrateur sans `set -e`, temporisation, détection du throttle, tableau final | la liste des bancs, et **l'ordre justifié en commentaire** à côté de chaque entrée |

## Ce qui n'est pas repris, et pourquoi

`harness.dart` et `check-sync.dart` sont propres à Flutter. Ici :

- **l'étage 4 existe déjà** — `e2e/`, 24 fichiers Playwright ;
- **l'étage 1 existe déjà** — les 14 `scripts/verifier-*.js`, qui font le
  travail de `check-sync.dart` sur nos propres couples (clés fr ↔ ar, jetons
  clair ↔ sombre, colonnes de tri ↔ liste blanche).

## Ce qui manque, et que ce chantier doit produire

Le **banc de cloisonnement multi-locataire** n'a pas de squelette : il n'existe
pas dans `echangopromo`, qui n'est pas multi-locataire. C'est pourtant le banc
le plus important de ce produit — voir R020 et l'étape 2 de
`../METHODE_TEST.md`.
