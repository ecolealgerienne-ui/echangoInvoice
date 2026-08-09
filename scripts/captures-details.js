/**
 * Captures de détail : pagination, menus ouverts, barre repliée, arabe.
 * Outil de travail, hors `npm run verify`.
 */
const fs = require('fs');
const puppeteer = require('/home/amar/projects/echangoinvoice/echangoInvoice/node_modules/puppeteer');

const BASE = process.argv[2] || 'http://localhost:5199';
const SORTIE = '/tmp/captures';
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

async function connecter(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle0' });
  if (await page.$('input[type=email]')) {
    await page.type('input[type=email]', 'admin@chambre-froide.dz');
    await page.type('input[type=password]', 'admin1234');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => {}),
      page.click('button[type=submit]'),
    ]);
  }
}

(async () => {
  fs.mkdirSync(SORTIE, { recursive: true });
  const b = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });

  // ── Pagination et bas de la liste des clients ───────────────────────────
  {
    const page = await b.newPage();
    await page.setViewport({ width: 1600, height: 1000 });
    await page.evaluateOnNewDocument(() => localStorage.setItem('echango-theme', 'light'));
    await connecter(page);
    await page.goto(`${BASE}/customers`, { waitUntil: 'networkidle0' });
    await pause(1500);
    await page.evaluate(() => document.querySelector('main').scrollTo(0, 99999));
    await pause(700);
    await page.screenshot({ path: `${SORTIE}/clients-pagination.png` });
    console.log(`  ${SORTIE}/clients-pagination.png`);
    await page.close();
  }

  // ── Barre repliée + menu utilisateur ────────────────────────────────────
  {
    const page = await b.newPage();
    await page.setViewport({ width: 1600, height: 1000 });
    await page.evaluateOnNewDocument(() => {
      localStorage.setItem('echango-theme', 'light');
      localStorage.setItem('echango-barre-repliee', '1');
    });
    await connecter(page);
    await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle0' });
    await pause(1600);
    // Le bloc utilisateur est le dernier bouton de la barre latérale.
    await page.evaluate(() => {
      const boutons = [...document.querySelectorAll('aside button[aria-haspopup="menu"]')];
      boutons[boutons.length - 1]?.click();
    });
    await pause(400);
    await page.screenshot({ path: `${SORTIE}/barre-repliee-menu.png` });
    console.log(`  ${SORTIE}/barre-repliee-menu.png`);
    await page.close();
  }

  // ── Menu « Personnaliser » ouvert ───────────────────────────────────────
  {
    const page = await b.newPage();
    await page.setViewport({ width: 1600, height: 1000 });
    await page.evaluateOnNewDocument(() => localStorage.setItem('echango-theme', 'dark'));
    await connecter(page);
    await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle0' });
    await pause(1600);
    await page.evaluate(() => {
      const b2 = [...document.querySelectorAll('button')]
        .find((e) => /Personnaliser/.test(e.textContent || ''));
      b2?.click();
    });
    await pause(400);
    await page.screenshot({ path: `${SORTIE}/personnaliser-dark.png` });
    console.log(`  ${SORTIE}/personnaliser-dark.png`);
    await page.close();
  }

  // ── Arabe, de droite à gauche ───────────────────────────────────────────
  for (const [chemin, nom] of [['/dashboard', 'tableau-de-bord'], ['/customers', 'clients']]) {
    const page = await b.newPage();
    await page.setViewport({ width: 1600, height: 1000 });
    await page.evaluateOnNewDocument(() => {
      localStorage.setItem('echango-theme', 'light');
      localStorage.setItem('langue', 'ar');
    });
    await connecter(page);
    await page.goto(`${BASE}${chemin}`, { waitUntil: 'networkidle0' });
    await pause(1600);
    await page.screenshot({ path: `${SORTIE}/${nom}-ar.png` });
    console.log(`  ${SORTIE}/${nom}-ar.png`);
    await page.close();
  }

  await b.close();
})().catch((e) => { console.error('ECHEC', e.message); process.exit(1); });
