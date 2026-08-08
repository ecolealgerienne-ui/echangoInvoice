#!/usr/bin/env node
/**
 * Signature des QR de vérification.
 *
 * La route est publique : la signature est la seule chose qui empêche
 * d'énumérer les factures d'un locataire en essayant des identifiants. R030 —
 * chaque cas ci-dessous est construit pour qu'elle DOIVE refuser.
 *
 * Prérequis : npm run build.
 */
const assert = require('assert');

// La signature dérive de JWT_SECRET : le fixer ici rend le contrôle
// reproductible et indépendant du .env de la machine.
process.env.JWT_SECRET = 'secret-de-test-pour-la-verification-des-signatures';

const {
  signerDocument, verifierSignature, urlVerification,
} = require('../dist/common/verification');

let ok = 0;
function verifie(label, fn) { fn(); ok++; console.log(`  ok  ${label}`); }

const ID = '11111111-1111-4111-8111-111111111111';
const AUTRE = '22222222-2222-4222-8222-222222222222';

console.log('\nSignature');

verifie('une signature valide est acceptée', () => {
  assert.strictEqual(verifierSignature('facture', ID, signerDocument('facture', ID)), true);
});

verifie('déterministe : deux appels rendent la même signature', () => {
  assert.strictEqual(signerDocument('facture', ID), signerDocument('facture', ID));
});

verifie('le type entre dans la signature', () => {
  // Sans cela, la signature d'un devis ouvrirait la facture de même id.
  assert.notStrictEqual(signerDocument('facture', ID), signerDocument('devis', ID));
  assert.strictEqual(verifierSignature('devis', ID, signerDocument('facture', ID)), false);
});

verifie("l'identifiant entre dans la signature", () => {
  assert.strictEqual(verifierSignature('facture', AUTRE, signerDocument('facture', ID)), false);
});

console.log('\nRefus');
for (const [label, sig] of [
  ['signature vide', ''],
  ['signature tronquée', signerDocument('facture', ID).slice(0, 8)],
  ['signature rallongée', signerDocument('facture', ID) + 'AA'],
  ['un caractère changé', 'A' + signerDocument('facture', ID).slice(1)],
  ['valeur non-chaîne', 42],
  ['undefined', undefined],
]) {
  verifie(`refuse : ${label}`, () => {
    assert.strictEqual(verifierSignature('facture', ID, sig), false, `« ${sig} » a été accepté`);
  });
}

console.log('\nURL portée par le QR');
verifie("l'URL contient type, identifiant et signature", () => {
  process.env.APP_PUBLIC_URL = 'https://exemple.dz/';
  const url = urlVerification('facture', ID);
  assert.ok(url.startsWith('https://exemple.dz/v/facture/'), url);
  assert.ok(url.endsWith(signerDocument('facture', ID)), url);
  // La barre finale de la variable ne doit pas produire un double séparateur.
  assert.ok(!url.includes('//v/'), `double séparateur : ${url}`);
});

verifie('la signature ne fuit pas le secret', () => {
  const sig = signerDocument('facture', ID);
  assert.ok(!sig.includes(process.env.JWT_SECRET.slice(0, 8)));
  assert.strictEqual(sig.length, 16);
});

console.log(`\n${ok} vérifications passées.\n`);
