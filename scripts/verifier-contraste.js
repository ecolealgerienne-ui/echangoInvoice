/**
 * Contraste réel de chaque texte affiché, dans les deux thèmes.
 *
 * Ce contrôle est né d'une remarque du client : « j'ai les menus invisibles ».
 * Le symptôme venait d'un serveur de développement périmé — mais l'incident a
 * montré qu'aucune mesure ne couvrait ce qu'on voit réellement. Les autres
 * contrôles inspectent la forme du code ; celui-ci mesure le rendu.
 *
 * Il parcourt les pages, ouvre chaque menu, et calcule le contraste de tout
 * texte affiché contre le fond réellement composité derrière lui — en
 * remontant les parents jusqu'à trouver une couleur opaque, puisqu'un fond
 * translucide ne dit rien à lui seul. Tout ce qui passe sous 3:1 est signalé :
 * sous ce seuil, un libellé n'est plus lisible.
 *
 * Il exige un serveur de développement et la base : il reste donc hors de
 * `npm run verify`. À lancer après toute retouche des jetons :
 *
 *     node scripts/verifier-contraste.js http://localhost:5173 dark
 *     node scripts/verifier-contraste.js http://localhost:5173 light
 *
 * Sortie non nulle si un texte passe sous le seuil.
 */
const puppeteer = require('/home/amar/projects/echangoinvoice/echangoInvoice/node_modules/puppeteer');
const BASE = process.argv[2] || 'http://localhost:5199';
const THEME = process.argv[3] || 'dark';

const PAGES = ['/dashboard', '/invoices', '/quotes', '/deliveries', '/credit-notes',
  '/customers', '/suppliers', '/products', '/stock', '/purchases',
  '/purchases/vendor-bills', '/expenses', '/reports', '/settings', '/recurring'];

(async () => {
  const b = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await b.newPage();
  await page.setViewport({ width: 1600, height: 1000 });
  await page.evaluateOnNewDocument((t) => localStorage.setItem('echango-theme', t), THEME);

  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle0' });
  if (await page.$('input[type=email]')) {
    await page.type('input[type=email]', 'admin@chambre-froide.dz');
    await page.type('input[type=password]', 'admin1234');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => {}),
      page.click('button[type=submit]'),
    ]);
  }

  const MESURE = () => {
    const lum = (c) => {
      const [r, g, bl] = c;
      const f = (v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      return 0.2126 * f(r / 255) + 0.7152 * f(g / 255) + 0.0722 * f(bl / 255);
    };
    // Le navigateur rend toute couleur calculée en rgb() une fois peinte.
    const rgb = (s) => {
      const m = String(s).match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
      return { c: p.slice(0, 3), a: p.length > 3 ? p[3] : 1 };
    };
    const fondEffectif = (el) => {
      let n = el;
      while (n && n !== document.documentElement) {
        const v = rgb(getComputedStyle(n).backgroundColor);
        if (v && v.a > 0.5) return v.c;
        n = n.parentElement;
      }
      return [255, 255, 255];
    };
    const contraste = (a, b) => {
      const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
      return (x + 0.05) / (y + 0.05);
    };
    const faibles = [];
    for (const el of document.querySelectorAll('body *')) {
      if (el.children.length) continue;
      const texte = (el.textContent || '').trim();
      if (!texte || texte.length > 60) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) < 0.2) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) continue;
      const c = rgb(cs.color);
      if (!c) continue;
      const ratio = contraste(c.c, fondEffectif(el));
      if (ratio < 3) {
        faibles.push({ texte: texte.slice(0, 28), ratio: Number(ratio.toFixed(2)), classes: el.className.toString().slice(0, 44) });
      }
    }
    return faibles;
  };

  let total = 0;
  for (const chemin of PAGES) {
    await page.goto(`${BASE}${chemin}`, { waitUntil: 'networkidle0', timeout: 45000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 900));

    // Chaque menu de la barre d'outils est ouvert avant la mesure.
    const boutons = await page.$$('button');
    for (const bt of boutons) {
      const l = await page.evaluate((el) => (el.textContent || '').trim(), bt).catch(() => '');
      if (/Colonnes|Exporter/.test(l)) await bt.click().catch(() => {});
    }
    await new Promise((r) => setTimeout(r, 350));

    const faibles = await page.evaluate(MESURE);
    if (faibles.length) {
      console.log(`\n  ${chemin}`);
      const vus = new Set();
      for (const f of faibles) {
        const cle = f.classes + f.ratio;
        if (vus.has(cle)) continue;
        vus.add(cle);
        console.log(`     ${String(f.ratio).padStart(5)}:1  « ${f.texte} »  ${f.classes}`);
        total += 1;
      }
    }
  }
  console.log(total
    ? `\n  ${total} texte(s) sous 3:1 en thème ${THEME}\n`
    : `\n  aucun texte sous 3:1 en thème ${THEME}\n`);
  await b.close();
  process.exit(total ? 1 : 0);
})().catch((e) => { console.error('ECHEC', e.message); process.exit(1); });
