#!/usr/bin/env node
/**
 * Périodes du tableau de bord et calcul d'évolution.
 *
 * Ce sont des dates : les pièges sont les mois de longueurs différentes, les
 * années bissextiles et les divisions par zéro. Aucun ne provoque d'erreur —
 * ils produisent un écart faux, affiché comme un fait.
 *
 * Prérequis : npm run build.
 */
const assert = require('assert');
const { resoudrePeriode, bornesDuMois, evolution } = require('../dist/dashboard/periode');

let ok = 0;
function verifie(label, fn) { fn(); ok++; console.log(`  ok  ${label}`); }

console.log('\nBornes de mois');
verifie('mois de 31 jours', () => {
  assert.deepStrictEqual(bornesDuMois('2026-08'), { dateFrom: '2026-08-01', dateTo: '2026-08-31' });
});
verifie('mois de 30 jours', () => {
  assert.deepStrictEqual(bornesDuMois('2026-04'), { dateFrom: '2026-04-01', dateTo: '2026-04-30' });
});
verifie('février non bissextile', () => {
  assert.strictEqual(bornesDuMois('2026-02').dateTo, '2026-02-28');
});
verifie('février bissextile', () => {
  assert.strictEqual(bornesDuMois('2028-02').dateTo, '2028-02-29');
});

console.log('\nPériode de comparaison');
verifie('même durée, collée juste avant', () => {
  const p = resoudrePeriode({ from: '2026-08-10', to: '2026-08-16' });
  assert.strictEqual(p.jours, 7);
  assert.deepStrictEqual(p.comparaison, { dateFrom: '2026-08-03', dateTo: '2026-08-09' });
});

verifie('un mois de 31 jours se compare à 31 jours, pas au mois précédent', () => {
  // Le piège : comparer août (31 j) à juillet (31 j) tombe juste, mais mars
  // (31 j) à février (28 j) ferait passer une baisse pour une saisonnalité.
  const p = resoudrePeriode({ month: '2026-03' });
  assert.strictEqual(p.jours, 31);
  assert.strictEqual(p.comparaison.dateTo, '2026-02-28');
  assert.strictEqual(p.comparaison.dateFrom, '2026-01-29');
});

verifie('la comparaison traverse un changement d\'année', () => {
  const p = resoudrePeriode({ month: '2026-01' });
  assert.strictEqual(p.comparaison.dateTo, '2025-12-31');
});

verifie('une seule journée se compare à la veille', () => {
  const p = resoudrePeriode({ from: '2026-08-08', to: '2026-08-08' });
  assert.strictEqual(p.jours, 1);
  assert.deepStrictEqual(p.comparaison, { dateFrom: '2026-08-07', dateTo: '2026-08-07' });
});

verifie('from/to priment sur month', () => {
  const p = resoudrePeriode({ month: '2026-01', from: '2026-08-01', to: '2026-08-05' });
  assert.strictEqual(p.dateFrom, '2026-08-01');
});

console.log('\nDemandes refusées');
verifie('refuse : from sans to', () => {
  assert.throws(() => resoudrePeriode({ from: '2026-08-01' }), /periode_incomplete/);
});
verifie('refuse : to sans from', () => {
  assert.throws(() => resoudrePeriode({ to: '2026-08-01' }), /periode_incomplete/);
});
verifie('refuse : période inversée', () => {
  assert.throws(() => resoudrePeriode({ from: '2026-08-31', to: '2026-08-01' }), /periode_inversee/);
});

console.log('\nÉvolution');
verifie('hausse', () => assert.strictEqual(evolution(120, 100), 20));
verifie('baisse', () => assert.strictEqual(evolution(80, 100), -20));
verifie('stagnation', () => assert.strictEqual(evolution(100, 100), 0));
verifie('arrondi au dixième', () => assert.strictEqual(evolution(1234, 1000), 23.4));
verifie('référence nulle → null, jamais 0 ni +100 %', () => {
  // Un 0 se lirait comme une stagnation alors qu'on part de rien.
  assert.strictEqual(evolution(500, 0), null);
});
verifie('référence négative : l\'écart reste orienté', () => {
  assert.strictEqual(evolution(-50, -100), 50);
});
verifie('valeur non finie → null', () => {
  assert.strictEqual(evolution(NaN, 100), null);
});

console.log(`\n${ok} vérifications passées.\n`);
