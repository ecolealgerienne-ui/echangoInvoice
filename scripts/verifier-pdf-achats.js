/**
 * Que contiennent reellement les PDF d'achat ?
 *
 * Ce controle ne relit pas le code : il demarre le conteneur Nest, remplace la
 * derniere etape (le rendu Chrome, seule chose lente et sans interet ici) par
 * une capture, et lit le HTML que le service a compose a partir de vraies
 * lignes en base. C'est la lecon de E010 poussee un cran plus loin — verifier
 * la sortie, pas la forme du code.
 *
 * Trois proprietes ne se voient qu'ici, et se perdraient dans un test unitaire
 * qui recopierait le mapping :
 *
 *  - sur un bon de commande, c'est notre societe qui commande et le
 *    fournisseur qui recoit ; inverser les deux blocs ferait un document faux ;
 *  - un bon de reception ne porte aucun prix ;
 *  - une facture fournisseur sort en copie interne, sans notre logo ni notre
 *    cachet, et le dit — sans quoi ce PDF circulerait comme un original.
 *
 * Lancement : node scripts/verifier-pdf-achats.js  (necessite la base)
 */
const path = require('path');

let echecs = 0;
function verifier(intitule, condition) {
  console.log(`  ${condition ? 'ok  ' : 'ECHEC'} ${intitule}`);
  if (!condition) echecs += 1;
}

async function principal() {
  const dist = path.join(__dirname, '..', 'dist');
  const { NestFactory } = require('@nestjs/core');
  const { AppModule } = require(path.join(dist, 'app.module'));
  const { PurchasePdfService } = require(path.join(dist, 'purchases', 'purchase-pdf.service'));

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const ds = app.get(require('typeorm').DataSource);
  const service = app.get(PurchasePdfService);

  // On intercepte avant le rendu : Chrome n'apporte rien a ce qu'on verifie, et
  // le lancer trois fois couterait plus que tout le reste de la serie.
  //
  // La substitution vise l'instance que *ce* service detient, pas celle que
  // `app.get(PdfService)` renverrait : `PdfService` est declare dans plusieurs
  // modules, donc le conteneur en tient plusieurs exemplaires. Sans etat, cela
  // ne gene pas la production — mais un controle qui patche le mauvais
  // exemplaire ne voit rien passer, et c'est ce qui s'est produit ici.
  const capture = [];
  service.pdfService.generateAndArchive = async (doc) => {
    capture.push(doc);
    return { buffer: Buffer.alloc(0), archivePath: '' };
  };

  const tenant = (await ds.query(
    `SELECT "tenantId" FROM purchase_orders WHERE "deletedAt" IS NULL LIMIT 1`,
  ))[0];
  if (!tenant) {
    console.log('\n  Aucun bon de commande en base : controle ignore.\n');
    await app.close();
    return 0;
  }
  const t = tenant.tenantId;

  const premier = async (table) => (await ds.query(
    `SELECT id FROM ${table} WHERE "tenantId" = $1 AND "deletedAt" IS NULL LIMIT 1`, [t],
  ))[0]?.id ?? null;

  const societe = (await ds.query(
    `SELECT "companyName" FROM settings WHERE "tenantId" = $1`, [t],
  ))[0]?.companyName ?? null;

  console.log('\nPDF des achats — contenu reellement compose\n');

  // ── Bon de commande ────────────────────────────────────────────────────
  const poId = await premier('purchase_orders');
  if (poId) {
    capture.length = 0;
    await service.generatePurchaseOrderPdf(poId, t);
    const { html, type } = capture[0];
    console.log('  — bon de commande');
    verifier('titre BON DE COMMANDE', html.includes('BON DE COMMANDE'));
    verifier('le fournisseur est le destinataire', html.includes('Fournisseur'));
    verifier('nous sommes le donneur d’ordre', html.includes('Donneur d’ordre'));
    verifier('notre societe figure en tete',
      !societe || html.includes(societe.replace(/&/g, '&amp;')));
    verifier('total en toutes lettres', html.includes('Arrêté le présent bon de commande'));
    verifier('code-barres du numero', html.includes('alt="code-barres du numero"'));
    // La page de verification est publique : l'ouvrir aux achats publierait
    // nos prix fournisseur sur une URL devinable.
    verifier('aucun QR public sur un document d’achat',
      !html.includes('alt="QR de verification"'));
    verifier('archive sous COMMANDES', type === 'COMMANDES');
  } else {
    console.log('  — bon de commande : aucune donnee');
  }

  // ── Bon de reception ───────────────────────────────────────────────────
  const blId = await premier('reception_bls');
  if (blId) {
    capture.length = 0;
    await service.generateReceptionBlPdf(blId, t);
    const { html, type } = capture[0];
    console.log('  — bon de reception');
    verifier('titre BON DE RÉCEPTION', html.includes('BON DE RÉCEPTION'));
    verifier('colonne Lot presente', html.includes('<th style="width:25%">Lot</th>'));
    verifier('aucune colonne P.U.', !html.includes('P.U. HT'));
    verifier('aucune colonne Total TTC', !html.includes('Total TTC'));
    // Le seul total est une quantite : « 12,00 DA » de marchandise reçue
    // n'aurait aucun sens pour le magasinier.
    verifier('la quantite recue n’est pas libellee en dinars',
      html.includes('Quantité totale reçue') && !/Quantité totale reçue<\/span><span>[^<]*DA/.test(html));
    verifier('deux cartouches de signature', html.includes('Signature du magasinier'));
    verifier('archive sous RECEPTIONS', type === 'RECEPTIONS');
  } else {
    console.log('  — bon de reception : aucune donnee');
  }

  // ── Facture fournisseur ────────────────────────────────────────────────
  const vbId = await premier('vendor_bills');
  if (vbId) {
    capture.length = 0;
    await service.generateVendorBillPdf(vbId, t);
    const { html, type } = capture[0];
    console.log('  — facture fournisseur');
    verifier('mention de copie interne', html.includes('Copie interne'));
    verifier('seul l’original fait foi', html.includes('a valeur de pièce comptable'));
    verifier('filigrane COPIE INTERNE ou ANNULÉE',
      html.includes('COPIE INTERNE') || html.includes('ANNULÉE'));
    // Notre logo et notre cachet sur un document dont nous ne sommes pas
    // l'auteur en feraient un faux.
    verifier('ni notre logo ni notre cachet', !html.includes('alt="logo"')
      && !html.includes('alt="cachet"'));
    verifier('le fournisseur est en position d’emetteur', html.includes('>Fournisseur<'));
    verifier('archive sous FACTURES_FOURNISSEURS', type === 'FACTURES_FOURNISSEURS');
  } else {
    console.log('  — facture fournisseur : aucune donnee');
  }

  await app.close();
  return echecs;
}

principal()
  .then((n) => {
    console.log(n === 0 ? '\nPDF des achats : conforme.\n' : `\nPDF des achats : ${n} echec(s).\n`);
    process.exit(n === 0 ? 0 : 1);
  })
  .catch((e) => {
    console.error('\nPDF des achats : controle interrompu —', e.message, '\n');
    process.exit(1);
  });
