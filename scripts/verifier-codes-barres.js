#!/usr/bin/env node
/**
 * Codes-barres : normalisation, clé de contrôle, détection de type.
 *
 * R030 — un code mal saisi ne lève rien : il crée un article introuvable au
 * scan. Ces cas sont donc construits pour que le contrôle DOIVE refuser.
 *
 * Les codes utilisés sont de vrais EAN dont la clé est vérifiable à la main.
 * Prérequis : npm run build.
 */
const assert = require('assert');
const {
  normaliserCodeBarres, cleDeControle, verifierCodeBarres, deviserType,
} = require('../dist/common/code-barres');

let ok = 0;
function verifie(label, fn) { fn(); ok++; console.log(`  ok  ${label}`); }

console.log('\nNormalisation');
verifie('espaces et tirets retirés (douchettes et copier-coller)', () => {
  assert.strictEqual(normaliserCodeBarres(' 3 017 620-422 003 '), '3017620422003');
});

console.log('\nClé de contrôle');
verifie('clé calculée sur un EAN-13 connu', () => {
  // 3017620422003 : Nutella. Clé = 3.
  assert.strictEqual(cleDeControle('301762042200'), 3);
});
verifie('clé calculée sur un EAN-8 connu', () => {
  assert.strictEqual(cleDeControle('9638507'), 4); // 96385074
});
verifie('clé nulle quand la somme tombe juste', () => {
  assert.strictEqual(typeof cleDeControle('000000000000'), 'number');
  assert.strictEqual(cleDeControle('000000000000'), 0);
});

console.log('\nCodes acceptés');
for (const [code, type] of [
  ['3017620422003', 'EAN13'],
  ['96385074', 'EAN8'],
  ['036000291452', 'UPCA'],
  ['REF-INTERNE-42', 'INTERNE'],
  ['ABC/123', 'CODE128'],
]) {
  verifie(`accepte ${type} : ${code}`, () => {
    const v = verifierCodeBarres(code, type);
    assert.strictEqual(v.valide, true, v.raison);
  });
}

console.log('\nCodes refusés');
for (const [label, code, type, raison] of [
  ['clé de contrôle fausse', '3017620422004', 'EAN13', 'check_digit'],
  ['un chiffre de trop', '30176204220031', 'EAN13', 'wrong_length'],
  ['un chiffre de moins', '301762042200', 'EAN13', 'wrong_length'],
  ['des lettres dans un EAN', '30176204220AB', 'EAN13', 'digits_only'],
  ['code vide', '   ', 'EAN13', 'empty'],
  ['EAN-8 à clé fausse', '96385075', 'EAN8', 'check_digit'],
]) {
  verifie(`refuse : ${label}`, () => {
    const v = verifierCodeBarres(code, type);
    assert.strictEqual(v.valide, false, `« ${code} » a été accepté`);
    assert.ok(v.raison.includes(raison), `raison inattendue : ${v.raison}`);
  });
}

verifie('refuse : code au-delà de la colonne (64 caractères)', () => {
  assert.strictEqual(verifierCodeBarres('X'.repeat(65), 'INTERNE').valide, false);
});

console.log('\nDétection de type');
verifie('un EAN-13 valide est reconnu', () => {
  assert.strictEqual(deviserType('3017620422003'), 'EAN13');
});
verifie('un EAN-8 valide est reconnu', () => {
  assert.strictEqual(deviserType('96385074'), 'EAN8');
});
verifie('treize chiffres à clé fausse retombent sur INTERNE, pas sur EAN13', () => {
  // Le piège : reconnaître un type d'après la seule longueur validerait un
  // code faux en le déclarant conforme.
  assert.strictEqual(deviserType('3017620422004'), 'INTERNE');
});
verifie('une référence maison reste INTERNE', () => {
  assert.strictEqual(deviserType('REF-2026-001'), 'INTERNE');
});

console.log(`\n${ok} vérifications passées.\n`);
