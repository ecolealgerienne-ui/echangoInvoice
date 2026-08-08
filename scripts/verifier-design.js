/**
 * Le système de design tient-il dans les deux thèmes ?
 *
 * Le thème sombre a été ajouté après coup sur une application écrite pour un
 * seul thème. Les défauts qu'il révèle ne cassent jamais la compilation — ils
 * produisent un écran illisible, ce que seul un œil humain voit. Ce contrôle
 * refuse les quatre formes qui les causent :
 *
 *  1. **Une couleur de palette écrite en dur** (`text-green-600`). Elle ne
 *     connaît qu'un thème : en sombre, une pastille vert clair posée sur du
 *     gris foncé. Il y en avait quatre-vingt-cinq.
 *
 *  2. **`text-white` / `bg-white` / `text-black`.** Même défaut, en pire : ces
 *     valeurs ne bougent avec aucun réglage. Le titre de la barre latérale
 *     était en blanc dur — invisible dès que la barre est passée en clair.
 *
 *  3. **`bg-background` sur une surface posée.** En clair, fond de page et
 *     carte sont tous deux blancs : la confusion ne se voit pas. En sombre
 *     elle **inverse l'élévation** — une carte plus foncée que la page
 *     derrière elle, ce qui creuse un trou au lieu de détacher.
 *
 *  4. **Une table de statut locale.** Dix-huit s'étaient accumulées, et elles
 *     se contredisaient : le même bon de livraison signé était vert sur sa
 *     fiche et orange dans la liste.
 *
 * Lancement : node scripts/verifier-design.js  (via `npm run verify`)
 */
const fs = require('fs');
const path = require('path');

const SOURCES = path.join(__dirname, '..', 'client', 'src');
const CSS = path.join(SOURCES, 'globals.css');

let echecs = 0;
function refuser(intitule, details) {
  console.log(`  ECHEC ${intitule}`);
  for (const d of details.slice(0, 10)) console.log(`         ${d}`);
  if (details.length > 10) console.log(`         … et ${details.length - 10} autre(s)`);
  echecs += 1;
}
const accepter = (s) => console.log(`  ok    ${s}`);

const fichiers = [];
(function parcourir(dossier) {
  for (const e of fs.readdirSync(dossier, { withFileTypes: true })) {
    const complet = path.join(dossier, e.name);
    if (e.isDirectory()) parcourir(complet);
    else if (/\.tsx?$/.test(e.name)) fichiers.push(complet);
  }
})(SOURCES);

const lire = (f) => ({
  rel: path.relative(SOURCES, f).split(path.sep).join('/'),
  lignes: fs.readFileSync(f, 'utf8').split('\n'),
});

// Le fichier de jetons est le seul autorisé à nommer des couleurs.
const EXEMPT_COULEUR = new Set(['lib/statuts.ts']);

console.log('\nSystème de design\n');

// ── 1. Couleurs de palette en dur ─────────────────────────────────────────
const PALETTE = /\b(bg|text|border|ring|from|to|via)-(gray|slate|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/;
const enDur = [];
for (const f of fichiers) {
  const { rel, lignes } = lire(f);
  if (EXEMPT_COULEUR.has(rel)) continue;
  lignes.forEach((l, i) => {
    const m = l.match(PALETTE);
    if (m && !l.trim().startsWith('*') && !l.trim().startsWith('//')) {
      enDur.push(`${rel}:${i + 1}  ${m[0]}`);
    }
  });
}
if (enDur.length) refuser(`${enDur.length} couleur(s) de palette en dur`, enDur);
else accepter('aucune couleur de palette écrite en dur');

// ── 2. Blanc et noir absolus ──────────────────────────────────────────────
const ABSOLU = /\b(text|bg|border)-(white|black)\b/;
const absolus = [];
for (const f of fichiers) {
  const { rel, lignes } = lire(f);
  lignes.forEach((l, i) => {
    const m = l.match(ABSOLU);
    if (m && !l.trim().startsWith('*') && !l.trim().startsWith('//')) {
      absolus.push(`${rel}:${i + 1}  ${m[0]}`);
    }
  });
}
if (absolus.length) refuser(`${absolus.length} blanc/noir absolu(s)`, absolus);
else accepter('aucun blanc ni noir absolu');

// ── 3. Élévation : bg-background hors fond de page ────────────────────────
const elevation = [];
for (const f of fichiers) {
  const { rel, lignes } = lire(f);
  lignes.forEach((l, i) => {
    if (!/\bbg-background\b/.test(l)) return;
    // Seuls le fond de page et l'anneau de focus ont le droit de s'y référer.
    if (/min-h-screen|ring-offset-background/.test(l)) return;
    if (l.trim().startsWith('*') || l.trim().startsWith('//')) return;
    elevation.push(`${rel}:${i + 1}`);
  });
}
if (elevation.length) refuser(`${elevation.length} surface(s) posée(s) sur bg-background`, elevation);
else accepter('l’élévation passe par surface / surface-elevated');

// ── 4. Tables de statut locales ───────────────────────────────────────────
const VARIANTES = /['"](muted|info|warning|success|destructive|secondary)['"]/;
const tables = [];
for (const f of fichiers) {
  const { rel, lignes } = lire(f);
  if (rel === 'lib/statuts.ts') continue;
  lignes.forEach((l, i) => {
    if (!/Record<string,\s*(?:string|any)>\s*=\s*\{/.test(l)) return;
    // La table est jugée sur les trois lignes suivantes : c'est là que les
    // variantes apparaissent.
    const bloc = lignes.slice(i, i + 5).join(' ');
    if (VARIANTES.test(bloc)) tables.push(`${rel}:${i + 1}`);
  });
}
if (tables.length) refuser(`${tables.length} table(s) de statut locale(s)`, tables);
else accepter('les statuts passent tous par lib/statuts');

// ── 5. Parité des jetons entre les deux thèmes ────────────────────────────
const css = fs.readFileSync(CSS, 'utf8');
const bloc = (selecteur) => {
  const i = css.indexOf(selecteur);
  if (i < 0) return null;
  const debut = css.indexOf('{', i);
  let profondeur = 0;
  for (let j = debut; j < css.length; j += 1) {
    if (css[j] === '{') profondeur += 1;
    if (css[j] === '}') { profondeur -= 1; if (!profondeur) return css.slice(debut, j); }
  }
  return null;
};
const jetonsDe = (texte) => new Set(
  [...(texte || '').matchAll(/(--[a-z-]+)\s*:/g)].map((m) => m[1]),
);
const clair = jetonsDe(bloc(':root'));
const sombre = jetonsDe(bloc('.dark'));

if (!clair.size || !sombre.size) {
  refuser('les blocs de thème sont introuvables dans globals.css', []);
} else {
  // Les rayons et la typographie ne changent pas avec le thème : seuls les
  // jetons de couleur et d'ombre doivent exister en double.
  const NEUTRES = new Set(['--radius']);
  const orphelins = [...clair].filter((j) => !sombre.has(j) && !NEUTRES.has(j));
  if (orphelins.length) refuser(`${orphelins.length} jeton(s) sans équivalent sombre`, orphelins);
  else accepter(`les ${clair.size} jetons du thème clair ont leur sombre`);
}

// ── 6. Le thème sombre ne doit pas virer au noir pur ──────────────────────
const fondSombre = (bloc('.dark') || '').match(/--background:\s*([\d.]+)/);
if (!fondSombre) {
  refuser('le fond du thème sombre est introuvable', []);
} else if (Number(fondSombre[1]) < 0.12) {
  refuser(`fond sombre trop proche du noir (L=${fondSombre[1]})`, [
    'Un blanc sur noir pur provoque un halo qui fatigue en quelques minutes,',
    'et ne laisse plus de place sous le fond pour signaler l’élévation.',
  ]);
} else {
  accepter(`le fond sombre reste au-dessus du noir (L=${fondSombre[1]})`);
}

console.log(echecs === 0
  ? '\nSystème de design : conforme.\n'
  : `\nSystème de design : ${echecs} contrôle(s) en échec.\n`);
process.exit(echecs === 0 ? 0 : 1);
