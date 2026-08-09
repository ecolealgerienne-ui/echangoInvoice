#!/usr/bin/env node
/**
 * Échéances des abonnements de facturation.
 *
 * Ce sont des dates : les pièges sont les mois courts, les années bissextiles
 * et la dérive du jour d'ancrage. Aucun ne lève d'erreur — ils produisent une
 * facture au mauvais jour, tous les mois, et personne ne fait le lien.
 *
 * Prérequis : npm run build.
 */
const assert = require('assert');
const { prochaineEcheance, estDue } = require('../dist/invoices/recurring/echeance');

let ok = 0;
function eq(recu, attendu, label) {
  assert.strictEqual(recu, attendu, `${label}\n    attendu : ${attendu}\n    reçu    : ${recu}`);
  ok++;
}
function verifie(label, fn) { fn(); ok++; console.log(`  ok  ${label}`); }

console.log('\nCadence simple');
eq(prochaineEcheance('2026-01-15', 'weekly', '2026-01-15'), '2026-01-22', 'hebdomadaire');
eq(prochaineEcheance('2026-01-15', 'monthly', '2026-01-15'), '2026-02-15', 'mensuelle');
eq(prochaineEcheance('2026-01-15', 'quarterly', '2026-01-15'), '2026-04-15', 'trimestrielle');
eq(prochaineEcheance('2026-01-15', 'yearly', '2026-01-15'), '2027-01-15', 'annuelle');
console.log('  ok  4 cadences');

console.log('\nMois courts');
eq(prochaineEcheance('2026-01-31', 'monthly', '2026-01-31'), '2026-02-28', '31 janvier → 28 février');
// Le piège : sans jour d'ancrage, mars resterait au 28 et la date dériverait
// vers le début du mois au fil de l'année.
eq(prochaineEcheance('2026-01-31', 'monthly', '2026-02-28'), '2026-03-31', "retour au 31 en mars");
eq(prochaineEcheance('2026-01-31', 'monthly', '2026-03-31'), '2026-04-30', '31 mars → 30 avril');
eq(prochaineEcheance('2026-01-31', 'monthly', '2026-04-30'), '2026-05-31', 'retour au 31 en mai');
eq(prochaineEcheance('2026-01-30', 'monthly', '2026-01-30'), '2026-02-28', '30 janvier → 28 février');
console.log('  ok  5 cas de mois courts');

console.log('\nAnnées bissextiles et passage d\'année');
eq(prochaineEcheance('2028-01-31', 'monthly', '2028-01-31'), '2028-02-29', 'février bissextile');
eq(prochaineEcheance('2026-12-15', 'monthly', '2026-12-15'), '2027-01-15', "passage d'année");
eq(prochaineEcheance('2026-11-30', 'quarterly', '2026-11-30'), '2027-02-28', 'trimestre vers février');
eq(prochaineEcheance('2028-02-29', 'yearly', '2028-02-29'), '2029-02-28', '29 février → 28 février');
console.log('  ok  4 cas de bord');

console.log('\nDérive sur douze mois');
verifie("un abonnement au 31 ne dérive pas", () => {
  let date = '2026-01-31';
  const jours = [];
  for (let i = 0; i < 12; i++) {
    date = prochaineEcheance('2026-01-31', 'monthly', date);
    jours.push(Number(date.split('-')[2]));
  }
  // Attendu : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31, 31
  assert.deepStrictEqual(jours, [28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31, 31],
    `dérive constatée : ${jours.join(', ')}`);
});

console.log('\nÉchéance due');
verifie('due quand la date est atteinte', () => {
  assert.strictEqual(estDue('2026-08-08', null, '2026-08-08'), true);
});
verifie('due aussi quand elle est dépassée (cron manqué)', () => {
  assert.strictEqual(estDue('2026-08-01', null, '2026-08-08'), true);
});
verifie('pas due avant la date', () => {
  assert.strictEqual(estDue('2026-08-09', null, '2026-08-08'), false);
});
verifie("pas due au-delà de la date de fin", () => {
  assert.strictEqual(estDue('2026-08-08', '2026-07-31', '2026-08-08'), false);
});
verifie('due si la date de fin est encore devant', () => {
  assert.strictEqual(estDue('2026-08-08', '2026-12-31', '2026-08-08'), true);
});

console.log(`\n${ok} vérifications passées.\n`);
