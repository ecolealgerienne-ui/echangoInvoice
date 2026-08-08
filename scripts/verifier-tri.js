#!/usr/bin/env node
/**
 * Tri des listes : une colonne de tri est un fragment de SQL.
 *
 * R030 — ces cas sont construits pour que le contrôle DOIVE refuser. Si la
 * liste blanche disparaît un jour, `?sortBy=` devient un point d'injection et
 * ce script passe au rouge.
 *
 * Prérequis : npm run build.
 */
const assert = require('assert');
const { resoudreTri, fragmentOrderBy, appliquerTri } = require('../dist/common/tri');

let ok = 0;
function verifie(label, fn) { fn(); ok++; console.log(`  ok  ${label}`); }

const COLONNES = ['name', 'createdAt', 'totalAmount'];
const DEFAUT = { colonne: 'name', sens: 'ASC' };

console.log('\nColonnes autorisées');

verifie('sans demande → tri par défaut', () => {
  assert.deepStrictEqual(resoudreTri(COLONNES, DEFAUT), { name: 'ASC' });
});

verifie('colonne autorisée, sens demandé', () => {
  assert.deepStrictEqual(
    resoudreTri(COLONNES, DEFAUT, { sortBy: 'totalAmount', sortOrder: 'DESC' }),
    { totalAmount: 'DESC' },
  );
});

verifie('sens en minuscules accepté', () => {
  assert.deepStrictEqual(
    resoudreTri(COLONNES, DEFAUT, { sortBy: 'createdAt', sortOrder: 'desc' }),
    { createdAt: 'DESC' },
  );
});

verifie('sens inconnu → ASC, jamais du SQL', () => {
  assert.deepStrictEqual(
    resoudreTri(COLONNES, DEFAUT, { sortBy: 'name', sortOrder: 'DESC; DROP TABLE users' }),
    { name: 'ASC' },
  );
});

console.log('\nColonnes refusées');

for (const [label, sortBy] of [
  ['colonne inconnue', 'motDePasse'],
  ['injection SQL', 'name; DROP TABLE users --'],
  ['sous-requête', '(SELECT 1)'],
  ['colonne d\'une autre table', 'users.email'],
  ['chaîne vide déguisée', ' name'],
]) {
  verifie(`refuse : ${label}`, () => {
    assert.throws(
      () => resoudreTri(COLONNES, DEFAUT, { sortBy }),
      (e) => e.status === 400 || /invalid_sort_column/.test(JSON.stringify(e.response ?? e.message)),
      `« ${sortBy} » a été accepté`,
    );
  });
}

console.log('\nFragment SQL et QueryBuilder');

verifie('le fragment ORDER BY cite la colonne', () => {
  assert.strictEqual(
    fragmentOrderBy(COLONNES, DEFAUT, { sortBy: 'createdAt', sortOrder: 'DESC' }),
    'ORDER BY "createdAt" DESC',
  );
});

verifie('le QueryBuilder reçoit alias.colonne', () => {
  let recu = null;
  appliquerTri({ orderBy: (s, o) => { recu = [s, o]; } }, 'inv', COLONNES, DEFAUT,
    { sortBy: 'totalAmount', sortOrder: 'DESC' });
  assert.deepStrictEqual(recu, ['inv.totalAmount', 'DESC']);
});

verifie('une colonne refusée n\'atteint jamais le QueryBuilder', () => {
  let appele = false;
  assert.throws(() => appliquerTri({ orderBy: () => { appele = true; } }, 'inv', COLONNES, DEFAUT,
    { sortBy: 'name; DROP TABLE users' }));
  assert.strictEqual(appele, false, 'le QueryBuilder a été appelé malgré le refus');
});

console.log('\nListes blanches déclarées par les services');

const fs = require('fs');
const path = require('path');
const SRC = path.join(__dirname, '..', 'src');
const SERVICES = [
  'products/products.service.ts', 'customers/customers.service.ts',
  'suppliers/suppliers.service.ts', 'expenses/expenses.service.ts',
  'invoices/sales-invoices.service.ts', 'quotes/quotes.service.ts',
  'deliveries/deliveries.service.ts',
];
for (const rel of SERVICES) {
  verifie(`${rel.split('/')[0]} déclare sa liste blanche`, () => {
    const s = fs.readFileSync(path.join(SRC, rel), 'utf8');
    const m = /COLONNES_TRIABLES = \[([^\]]*)\]/.exec(s);
    assert.ok(m, 'liste blanche absente');
    // Une liste vide déclare la bonne forme et ne trie rien : « la déclaration
    // existe » n'est pas la propriété qu'on veut tenir.
    const colonnes = m[1].split(',').map((c) => c.trim()).filter(Boolean);
    assert.ok(colonnes.length >= 2, `liste blanche vide ou quasi vide (${colonnes.length})`);
    assert.ok(/resoudreTri|appliquerTri/.test(s), 'liste blanche déclarée mais jamais utilisée');
  });
}

console.log(`\n${ok} vérifications passées.\n`);
