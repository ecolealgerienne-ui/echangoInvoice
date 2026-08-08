#!/usr/bin/env node
/**
 * Isolation multi-locataires : couverture des gardes et chemins d'archive.
 *
 * R030 — un contrôle au vert n'a montré que sa capacité à dire oui. Chaque cas
 * ci-dessous est construit pour que le contrôle DOIVE refuser.
 *
 * Prérequis : npm run build.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const RACINE = path.join(__dirname, '..');
const SRC = path.join(RACINE, 'src');

let ok = 0;
function verifie(label, fn) { fn(); ok++; console.log(`  ok  ${label}`); }

// ─── Gardes ────────────────────────────────────────────────────────────────
// R023 : toute route publique est épinglée ici, en miroir de CLAUDE.md.
const PUBLICS = new Set([
  'common/health.controller.ts',          // sonde de connectivité mobile
  'admin/auth/admin-auth.controller.ts',  // login + refresh superadmin, rate-limités
]);
const HORS_LOCATAIRE = new Set(['auth/auth.controller.ts']);

function controleurs(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return controleurs(p);
    return e.name.endsWith('.controller.ts') ? [p] : [];
  });
}

console.log('\nGardes');
const defauts = [];
let nbLocataire = 0, nbHandlers = 0;

for (const fichier of controleurs(SRC)) {
  const rel = path.relative(SRC, fichier).split(path.sep).join('/');
  const src = fs.readFileSync(fichier, 'utf8');
  if (PUBLICS.has(rel)) continue;

  if (!/@UseGuards\(/.test(src)) {
    defauts.push(`${rel} : aucun @UseGuards — route publique non épinglée (R023)`);
    continue;
  }
  if (HORS_LOCATAIRE.has(rel) || rel.startsWith('admin/')) continue;

  nbLocataire++;
  const gardes = (src.match(/@UseGuards\(([^)]*)\)/) || [, ''])[1].split(',').map((g) => g.trim());
  if (!gardes.includes('TenantGuard')) {
    defauts.push(`${rel} : TenantGuard absent — user.tenantId peut être undefined`);
  } else if (gardes.indexOf('TenantGuard') > gardes.indexOf('RolesGuard')) {
    defauts.push(`${rel} : TenantGuard doit précéder RolesGuard`);
  }

  const h = (src.match(/^\s*@(Get|Post|Put|Patch|Delete)\(/gm) || []).length;
  const r = (src.match(/^\s*@Roles\(/gm) || []).length;
  nbHandlers += h;
  if (r < h) defauts.push(`${rel} : ${h} handlers pour ${r} @Roles`);
}

if (defauts.length) {
  console.error('\nDéfauts :');
  for (const d of defauts) console.error(`  ✗ ${d}`);
  process.exit(1);
}
console.log(`  ok  ${nbLocataire} contrôleurs locataire, ${nbHandlers} handlers`);
ok++;

// ─── Chemin d'archive ──────────────────────────────────────────────────────
console.log("\nChemin d'archive");
const { cheminArchive } = require('../dist/common/pdf.service');

const T1 = '11111111-1111-4111-8111-111111111111';
const T2 = '22222222-2222-4222-8222-222222222222';
const D1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const D2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const t = new Date('2026-08-08T10:00:00Z');
const doc = (tenantId, documentId) => ({ tenantId, documentId, type: 'FACTURES', filename: 'FAC-26-001' });

verifie('deux sociétés, même numéro → deux chemins distincts', () => {
  const a = cheminArchive('/srv', doc(T1, D1), t);
  const b = cheminArchive('/srv', doc(T2, D2), t);
  assert.notStrictEqual(a, b, "c'est le défaut d'origine : les archives s'écrasent");
  assert.ok(a.includes(T1) && b.includes(T2), 'le tenantId est absent du chemin');
});

verifie('même facture régénérée → chemin stable', () => {
  assert.strictEqual(cheminArchive('/srv', doc(T1, D1), t), cheminArchive('/srv', doc(T1, D1), t));
});

verifie("un numéro contenant un séparateur ne crée pas de répertoire", () => {
  // La propriété n'est pas « la chaîne ne contient pas .. » — les séparateurs
  // sont neutralisés, donc « .. » peut subsister comme simple texte.
  const p = cheminArchive('/srv', { ...doc(T1, D1), filename: '../../../etc/cron.d/x' }, t);
  const attendu = path.join('/srv', 'ARCHIVES', T1, '2026', '08', 'FACTURES');
  assert.strictEqual(path.dirname(p), attendu, 'le nom de fichier a créé des répertoires');
});

for (const [label, tenantId, documentId] of [
  ['tenantId absent', undefined, D1],
  ['tenantId vide', '', D1],
  ['tenantId non-UUID', 'null', D1],
  ['documentId absent', T1, undefined],
]) {
  verifie(`refuse d'archiver : ${label}`, () => {
    assert.throws(() => cheminArchive('/srv', doc(tenantId, documentId), t),
      /pdf_archive_identity_missing/, `${label} a produit un chemin au lieu d'échouer`);
  });
}

// ─── Source du logo dans le PDF ────────────────────────────────────────────
console.log('\nSource du logo');
const { sourceImageSure } = require('../dist/common/pdf/document-template');

verifie("une data-URL d'image est acceptée", () => {
  const v = 'data:image/png;base64,iVBORw0KGgo=';
  assert.strictEqual(sourceImageSure(v), v);
});
for (const [label, valeur] of [
  ['file://', 'file:///etc/passwd'],
  ['adresse interne', 'http://169.254.169.254/latest/meta-data/'],
  ['type non-image', 'data:text/html;base64,PHNjcmlwdD4='],
  ['valeur non-chaîne', 42],
]) {
  verifie(`refuse : ${label}`, () => assert.strictEqual(sourceImageSure(valeur), null));
}

console.log(`\n${ok} vérifications passées.\n`);
