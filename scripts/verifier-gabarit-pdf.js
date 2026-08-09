/**
 * Le gabarit PDF rend-il vraiment ce qu'on lui passe ?
 *
 * Ce controle existe a cause d'un defaut precis : le QR de verification etait
 * genere, passe au gabarit, declare dans son interface — et jamais dessine.
 * Une insertion silencieusement ratee avait laisse le champ orphelin. Rien ne
 * l'a vu : la compilation passait (le champ est optionnel), les tests de
 * generation passaient (le PDF sortait), et le document partait au client sans
 * son QR.
 *
 * La lecon tient en une phrase : « le champ existe » et « le champ est rendu »
 * sont deux proprietes differentes, et c'est la seconde qui interesse le
 * client. On verifie donc le HTML produit, pas la forme du code.
 *
 * Lancement : node scripts/verifier-gabarit-pdf.js  (via `npm run verify`)
 */
const fs = require('fs');
const path = require('path');

// Seul controle de la serie a exercer le code compile plutot qu'a le relire :
// c'est le prix a payer pour verifier une sortie et non une forme.
const compile = path.join(__dirname, '..', 'dist', 'common', 'pdf', 'document-template.js');
if (!fs.existsSync(compile)) {
  console.log('\nGabarit PDF : `npm run build` requis avant ce controle.\n');
  process.exit(1);
}
const { rendreDocument } = require(compile);

let echecs = 0;
function verifier(intitule, condition) {
  if (condition) {
    console.log(`  ok   ${intitule}`);
  } else {
    console.log(`  ECHEC ${intitule}`);
    echecs += 1;
  }
}

// Un PNG minimal valide : le gabarit ne regarde que le schema de la data-URL.
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const base = {
  titre: 'FACTURE',
  numero: 'FAC-26-0355',
  entetes: [],
  labelEmetteur: 'Emetteur',
  labelDestinataire: 'Client',
  emetteur: { companyName: 'Test' },
  destinataire: { name: 'Client' },
  lignes: [],
  totaux: [],
  notes: null,
};

console.log('\nGabarit PDF — QR de verification et code-barres du numero\n');

const complet = rendreDocument({
  ...base,
  qrVerification: { image: PNG, url: 'https://exemple.dz/v/facture/abc/signature' },
  codeBarresNumero: PNG,
});

verifier('le QR de verification est dessine', complet.includes('alt="QR de verification"'));
verifier("l'URL de verification est lisible a l'oeil", complet.includes('exemple.dz/v/facture/abc/signature'));
verifier('le code-barres du numero est dessine', complet.includes('alt="code-barres du numero"'));
verifier('le numero figure sous le code-barres', complet.includes('>FAC-26-0355<'));

// Les deux images sont facultatives : un document reste valable sans elles, et
// le bloc ne doit pas laisser un cadre vide en pied de page.
const vide = rendreDocument(base);
verifier('aucun bloc quand les deux manquent', !vide.includes('class="pied-technique"'));

const qrSeul = rendreDocument({ ...base, qrVerification: { image: PNG, url: 'https://x.dz/v/a/b/c' } });
verifier('le QR seul suffit a afficher le bloc', qrSeul.includes('class="pied-technique"'));
verifier('pas de code-barres fantome', !qrSeul.includes('alt="code-barres du numero"'));

// Ces deux valeurs finissent dans un attribut `src`. Le service PDF bloque deja
// les requetes sortantes, mais la liste blanche de schemas est la premiere
// barriere : une URL distante ne doit meme pas atteindre le HTML.
const hostile = rendreDocument({
  ...base,
  qrVerification: { image: 'https://pirate.example/pixel.png', url: 'https://x.dz/v/a/b/c' },
  codeBarresNumero: 'file:///etc/passwd',
});
verifier('une image distante est refusee', !hostile.includes('pirate.example'));
verifier('un chemin de fichier est refuse', !hostile.includes('/etc/passwd'));

// L'URL est du texte libre cote gabarit : elle doit etre echappee comme le reste.
const injection = rendreDocument({
  ...base,
  qrVerification: { image: PNG, url: 'https://x.dz/"><script>alert(1)</script>' },
});
verifier("l'URL de verification est echappee", !injection.includes('<script>'));

console.log(echecs === 0 ? '\nGabarit PDF : conforme.\n' : `\nGabarit PDF : ${echecs} echec(s).\n`);
process.exit(echecs === 0 ? 0 : 1);
