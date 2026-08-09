#!/usr/bin/env node
/**
 * Conformité algérienne : montant en toutes lettres et droit de timbre.
 *
 * Ces deux calculs figurent sur un document légal. Une erreur ne provoque
 * aucune panne : elle produit une facture fausse, qui s'imprime, s'envoie et se
 * paie. Seule une table de cas connus peut le dire.
 *
 * Barème et exemple chiffré : docs/CONFORMITE-FISCALE.md §2.
 * Prérequis : npm run build.
 */
const assert = require('assert');
const { entierEnLettres, montantEnLettres } = require('../dist/common/montant-en-lettres');
const { calculerDroitDeTimbre, estSoumisAuTimbre, calculerNetAPayer } = require('../dist/common/droit-de-timbre');

let ok = 0;
function eq(recu, attendu, label) {
  assert.strictEqual(recu, attendu, `${label}\n    attendu : ${attendu}\n    reçu    : ${recu}`);
  ok++;
}

console.log('\nMontant en toutes lettres — accords du français');
const CAS = [
  [0, 'zéro'], [1, 'un'], [16, 'seize'], [17, 'dix-sept'],
  [20, 'vingt'], [21, 'vingt et un'], [22, 'vingt-deux'], [31, 'trente et un'],
  [70, 'soixante-dix'], [71, 'soixante et onze'], [72, 'soixante-douze'],
  [80, 'quatre-vingts'],            // s : multiplié ET final
  [81, 'quatre-vingt-un'],          // pas de s, pas de « et »
  [90, 'quatre-vingt-dix'], [91, 'quatre-vingt-onze'], [99, 'quatre-vingt-dix-neuf'],
  [100, 'cent'],                    // jamais « un cent »
  [101, 'cent un'], [200, 'deux cents'], [201, 'deux cent un'],
  [280, 'deux cent quatre-vingts'],
  [1000, 'mille'],                  // jamais « un mille »
  [1001, 'mille un'], [2000, 'deux mille'],
  // « mille » est un adjectif numéral : il fait tomber le s.
  [80_000, 'quatre-vingt mille'],
  [180_000, 'cent quatre-vingt mille'],
  [200_000, 'deux cent mille'],
  // « million »/« milliard » sont des noms : le s reste.
  [80_000_000, 'quatre-vingts millions'],
  [200_000_000, 'deux cents millions'],
  [1_000_000, 'un million'], [2_000_000, 'deux millions'],
  [1_234_567, 'un million deux cent trente-quatre mille cinq cent soixante-sept'],
  [1_000_000_000, 'un milliard'],
];
for (const [n, attendu] of CAS) eq(entierEnLettres(n), attendu, `entierEnLettres(${n})`);
console.log(`  ok  ${CAS.length} formes d'entiers`);

console.log('\nMontant en toutes lettres — devise');
eq(montantEnLettres(0), 'zéro dinar algérien', 'zéro');
eq(montantEnLettres(1), 'un dinar algérien', 'singulier');
eq(montantEnLettres(2), 'deux dinars algériens', 'pluriel');
eq(montantEnLettres(1234.5), 'mille deux cent trente-quatre dinars algériens et cinquante centimes', 'centimes');
eq(montantEnLettres('1234.50'), 'mille deux cent trente-quatre dinars algériens et cinquante centimes', 'decimal TypeORM (chaîne)');
eq(montantEnLettres(129.999), 'cent trente dinars algériens', 'arrondi, pas troncature');
eq(montantEnLettres(0.05), 'zéro dinar algérien et cinq centimes', 'centimes seuls');
console.log('  ok  7 montants');

console.log('\nDroit de timbre — barème art. 100');
eq(calculerDroitDeTimbre(31_010), 466.5, 'exemple publié : 31 010 DA → 311 tranches × 1,5');
eq(calculerDroitDeTimbre(0), 0, 'montant nul');
eq(calculerDroitDeTimbre(299.99), 0, 'sous 300 DA → exonéré');
eq(calculerDroitDeTimbre(300), 5, '300 DA → 3 tranches × 1 = 3, relevé au minimum de 5');
eq(calculerDroitDeTimbre(1000), 10, '1 000 DA → 10 tranches × 1');
eq(calculerDroitDeTimbre(1001), 11, 'tranche entamée comptée en entier');
eq(calculerDroitDeTimbre(30_000), 300, 'borne haute de la 1re tranche');
eq(calculerDroitDeTimbre(30_100), 451.5, 'au-delà de 30 000 → 1,5 sur TOUTES les tranches');
eq(calculerDroitDeTimbre(100_000), 1500, 'borne haute de la 2e tranche');
eq(calculerDroitDeTimbre(100_100), 2002, 'au-delà de 100 000 → taux 2');
// L'ordre de grandeur cité par l'étude : ~3 000 DA sur 150 000 DA.
const surCentCinquanteMille = calculerDroitDeTimbre(150_000);
assert.ok(surCentCinquanteMille > 2_900 && surCentCinquanteMille < 3_100,
  `150 000 DA devrait donner ~3 000 DA de timbre, obtenu ${surCentCinquanteMille}`);
ok++;

// Le piège principal : le barème n'est PAS progressif.
const siProgressif = (30_000 / 100) * 1 + (100 / 100) * 1.5;
assert.notStrictEqual(calculerDroitDeTimbre(30_100), siProgressif,
  "le calcul est devenu progressif par tranches — ce n'est pas le barème de l'art. 100");
ok++;
console.log('  ok  11 montants + ordre de grandeur + non-progressivité');

console.log('\nModes de règlement');
eq(estSoumisAuTimbre('cash'), true, 'espèces soumises');
for (const m of ['bank_transfer', 'cheque', 'other', null, undefined]) {
  eq(estSoumisAuTimbre(m), false, `${m} dispensé`);
}
console.log('  ok  6 modes');

console.log('\nNet à payer');
eq(calculerNetAPayer(1000, 10), 1010, 'TTC + timbre');
eq(calculerNetAPayer('1000.00', '0'), 1000, 'sans timbre, inchangé');
console.log('  ok  2 cas');

console.log(`\n${ok} vérifications passées.`);
console.log('Barème : docs/CONFORMITE-FISCALE.md §2 — à faire confirmer par un comptable.\n');
