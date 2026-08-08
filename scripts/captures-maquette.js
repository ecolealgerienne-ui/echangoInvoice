/**
 * Captures de comparaison avec les maquettes.
 *
 * Outil de travail, hors `npm run verify` : il exige un serveur de
 * développement et la base. Il ouvre le tableau de bord et la liste des
 * clients dans les deux thèmes, en pleine hauteur, et dépose les images dans
 * /tmp/captures.
 *
 *     node scripts/captures-maquette.js http://localhost:5199
 */
const fs = require('fs');
const puppeteer = require('/home/amar/projects/echangoinvoice/echangoInvoice/node_modules/puppeteer');

const BASE = process.argv[2] || 'http://localhost:5199';
const SORTIE = '/tmp/captures';
const PAGES = [
  { chemin: '/dashboard', nom: 'tableau-de-bord' },
  { chemin: '/customers', nom: 'clients' },
];

(async () => {
  fs.mkdirSync(SORTIE, { recursive: true });
  const navigateur = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });

  for (const theme of ['light', 'dark']) {
    const page = await navigateur.newPage();
    await page.setViewport({ width: 1600, height: 1100 });
    await page.evaluateOnNewDocument((t) => localStorage.setItem('echango-theme', t), theme);

    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle0' });
    if (await page.$('input[type=email]')) {
      await page.type('input[type=email]', 'admin@chambre-froide.dz');
      await page.type('input[type=password]', 'admin1234');
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => {}),
        page.click('button[type=submit]'),
      ]);
    }

    for (const { chemin, nom } of PAGES) {
      await page.goto(`${BASE}${chemin}`, { waitUntil: 'networkidle0', timeout: 45000 }).catch(() => {});
      // Les animations d'entrée durent au plus 1,1 s ; on capture après.
      await new Promise((r) => setTimeout(r, 1800));
      await page.screenshot({ path: `${SORTIE}/${nom}-${theme}.png`, fullPage: true });
      console.log(`  ${SORTIE}/${nom}-${theme}.png`);
    }
    await page.close();
  }

  await navigateur.close();
})().catch((e) => { console.error('ECHEC', e.message); process.exit(1); });
