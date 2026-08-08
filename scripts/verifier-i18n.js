/**
 * L'interface est-elle réellement traduisible ?
 *
 * Deux défauts distincts laissaient des libellés en français une fois
 * l'application passée en arabe, et aucun ne se voyait à la compilation :
 *
 *  1. **des clés absentes de `ar.json`** — i18next se rabat silencieusement sur
 *     le français, ce qui est le bon comportement au moment du plantage mais un
 *     très mauvais signal pendant le développement : rien ne casse, personne ne
 *     le sait. Sur 925 clés françaises, 683 manquaient ;
 *
 *  2. **des chaînes écrites en dur dans le JSX** — celles-là ne passent même
 *     pas par i18next : aucun choix de langue ne les atteindra jamais.
 *
 * Un troisième défaut est apparu en corrigeant les deux premiers : une clé peut
 * se retrouver **nue**, `{'products.title'}` au lieu de `{t('products.title')}`.
 * TypeScript l'accepte — une chaîne est un ReactNode valide — et l'écran affiche
 * alors l'identifiant technique. Ce contrôle refuse les trois.
 *
 * Lancement : node scripts/verifier-i18n.js  (via `npm run verify`)
 */
const fs = require('fs');
const path = require('path');

const RACINE = path.join(__dirname, '..');
const I18N = path.join(RACINE, 'shared', 'src', 'i18n');
const SOURCES = path.join(RACINE, 'client', 'src');

let echecs = 0;
function refuser(intitule, details) {
  console.log(`  ECHEC ${intitule}`);
  for (const d of details.slice(0, 12)) console.log(`         ${d}`);
  if (details.length > 12) console.log(`         … et ${details.length - 12} autre(s)`);
  echecs += 1;
}
function accepter(intitule) { console.log(`  ok    ${intitule}`); }

function aplatir(objet, prefixe = '') {
  const sortie = {};
  for (const [cle, valeur] of Object.entries(objet)) {
    const complete = `${prefixe}${cle}`;
    if (valeur && typeof valeur === 'object' && !Array.isArray(valeur)) {
      Object.assign(sortie, aplatir(valeur, `${complete}.`));
    } else {
      sortie[complete] = valeur;
    }
  }
  return sortie;
}

console.log('\nInternationalisation\n');

// ── 1. Parité des catalogues ──────────────────────────────────────────────
const fr = aplatir(JSON.parse(fs.readFileSync(path.join(I18N, 'fr.json'), 'utf8')));
const ar = aplatir(JSON.parse(fs.readFileSync(path.join(I18N, 'ar.json'), 'utf8')));

const manquantes = Object.keys(fr).filter((k) => !(k in ar));
if (manquantes.length) refuser(`${manquantes.length} clé(s) absente(s) de l'arabe`, manquantes);
else accepter(`les ${Object.keys(fr).length} clés françaises ont leur arabe`);

// L'inverse compte aussi : une clé qui n'existe qu'en arabe est soit morte,
// soit — plus grave — utilisée par un écran dont le français, lui, affichera
// l'identifiant technique. Douze traînaient, toutes mortes.
const orphelines = Object.keys(ar).filter((k) => !(k in fr));
if (orphelines.length) refuser(`${orphelines.length} clé(s) arabe(s) sans équivalent français`, orphelines);
else accepter('aucune clé arabe orpheline');

const vides = Object.keys(ar).filter((k) => !String(ar[k]).trim());
if (vides.length) refuser(`${vides.length} traduction(s) vide(s)`, vides);
else accepter('aucune traduction vide');

// Une variable perdue dans la traduction laisse « {{count}} » à l'écran, ou
// pire, un chiffre qui n'apparaît plus du tout.
const VARIABLE = /\{\{(\w+)\}\}/g;
const variablesPerdues = [];
for (const [cle, texte] of Object.entries(fr)) {
  if (!(cle in ar)) continue;
  const attendues = [...String(texte).matchAll(VARIABLE)].map((m) => m[1]).sort();
  const reelles = [...String(ar[cle]).matchAll(VARIABLE)].map((m) => m[1]).sort();
  if (attendues.join(',') !== reelles.join(',')) {
    variablesPerdues.push(`${cle} : attendu {${attendues}} — trouvé {${reelles}}`);
  }
}
if (variablesPerdues.length) refuser('variables d’interpolation divergentes', variablesPerdues);
else accepter('les variables d’interpolation concordent');

// ── 2. Chaînes françaises écrites en dur ─────────────────────────────────
const ACCENTS = /[àâäéèêëïîôöùûüÿçÀÂÄÉÈÊËÏÎÔÖÙÛÜŸÇ]/;
const MOTS_FR = /\b(Voir|Nouveau|Nouvelle|Ajouter|Modifier|Supprimer|Enregistrer|Annuler|Rechercher|Valider|Envoyer|Total|Montant|Client|Fournisseur|Facture|Article|Produit|Statut|Prix|Commande|Livraison|Paiement|Stock|Utilisateur|Aucun|Aucune|Toutes|Brouillon)\b/;

// Ces valeurs sont enregistrees en base, pas affichees comme libelles : les
// traduire ecrirait de l'arabe dans une colonne que le PDF et l'export
// relisent ensuite. Elles restent en francais, et c'est voulu.
const DONNEES = new Set([
  'lib/useUnits.ts',
  'pages/settings/SettingsPage.tsx',
]);

const fichiers = [];
(function parcourir(dossier) {
  for (const entree of fs.readdirSync(dossier, { withFileTypes: true })) {
    const complet = path.join(dossier, entree.name);
    if (entree.isDirectory()) parcourir(complet);
    else if (/\.tsx?$/.test(entree.name)) fichiers.push(complet);
  }
})(SOURCES);

const enDur = [];
const nues = [];

/**
 * Une clé « nue » n'est pas n'importe quelle clé écrite en littéral.
 *
 * Stocker des clés dans une table et les traduire au rendu est un motif
 * légitime — la barre latérale le fait pour ses entrées de menu, et un contrôle
 * qui l'interdirait serait un contrôle qu'on désactive. Le défaut, c'est la clé
 * **placée directement dans le JSX** : `{'products.title'}`, où le `t()` a
 * disparu. TypeScript l'accepte, et l'écran affiche l'identifiant technique.
 *
 * On ne retient donc que deux formes : le littéral **seul** entre accolades, et
 * celui qui est branche d'un **ternaire** entre accolades. `key: 'nav.clients'`
 * dans un tableau de configuration n'est ni l'un ni l'autre, et passe.
 */
// Le `(?<!t\()` est l'essentiel : sans lui, `{x ? t('a.b') : t('c.d')}` — la
// forme correcte — serait signalé au même titre que la forme fautive.
const CLE = "(?<!t\\()'([a-z][a-zA-Z]*(?:\\.[a-zA-Z_]+){1,3})'";
const FORMES_NUES = [
  new RegExp(`\\{\\s*${CLE}\\s*\\}`, 'g'),          // {'products.title'}
  new RegExp(`\\{[^{}]*\\?[^{}]*${CLE}[^{}]*\\}`, 'g'), // {x ? 'a.b' : 'c.d'}
];

for (const complet of fichiers) {
  const rel = path.relative(SOURCES, complet).split(path.sep).join('/');
  const lignes = fs.readFileSync(complet, 'utf8').split('\n');
  let dansBloc = false;

  for (let i = 0; i < lignes.length; i += 1) {
    const ligne = lignes[i];
    const nu = ligne.trim();
    if (nu.startsWith('/*')) dansBloc = true;
    if (dansBloc) { if (nu.includes('*/')) dansBloc = false; continue; }
    if (nu.startsWith('//') || nu.startsWith('*')) continue;

    if (!DONNEES.has(rel)) {
      // Texte entre balises, et attributs vus par l'utilisateur.
      const candidats = [];
      for (const m of ligne.matchAll(/>([^<>{}\n]{2,120})</g)) candidats.push(m[1]);
      for (const m of ligne.matchAll(/\b(title|placeholder|label|alt|aria-label)="([^"{}]+)"/g)) candidats.push(m[2]);
      for (const texte of candidats) {
        const t = texte.trim();
        if (t.length < 2 || !/[A-Za-z]/.test(t)) continue;
        if (ACCENTS.test(t) || MOTS_FR.test(t)) enDur.push(`${rel}:${i + 1}  ${t}`);
      }
    }

    // Clé nue : l'identifiant technique s'afficherait tel quel.
    // Les schémas de validation portent volontairement la clé nue — le message
    // traverse react-hook-form et se traduit à l'affichage.
    if (/message:|positive\(|\bmin\(|\bmax\(|uuid\(|email\(|regex\(/.test(ligne)) continue;
    for (const forme of FORMES_NUES) {
      for (const m of ligne.matchAll(forme)) {
        const cle = m[1];
        if (cle in fr) nues.push(`${rel}:${i + 1}  ${cle}`);
      }
    }
  }
}

if (enDur.length) refuser(`${enDur.length} chaîne(s) française(s) en dur`, enDur);
else accepter('aucune chaîne française en dur dans le client');

if (nues.length) refuser(`${nues.length} clé(s) affichée(s) sans t()`, nues);
else accepter('aucune clé i18n affichée telle quelle');

console.log(echecs === 0
  ? '\nInternationalisation : conforme.\n'
  : `\nInternationalisation : ${echecs} contrôle(s) en échec.\n`);
process.exit(echecs === 0 ? 0 : 1);
