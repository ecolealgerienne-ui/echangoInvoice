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
  '/purchases/vendor-bills', '/expenses', '/reports', '/settings',
  // `/recurring` n'existe pas : la route est `/invoices/recurring`. Le
  // contrôle mesurait donc une page vide, et l'annonçait conforme.
  '/invoices/recurring'];

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
    /**
     * Lecture d'une couleur calculée.
     *
     * Ce contrôle a été **muet pendant tout le temps où il a servi**, et
     * personne ne pouvait le voir : il ne savait lire que `rgb()`, en partant
     * du principe — vrai en 2020 — que le navigateur ramène toute couleur à
     * cette forme une fois peinte. Chrome conserve désormais `oklch()` tel
     * quel dans le style calculé. Le motif ne correspondait donc plus à rien,
     * la fonction rendait `null`, et la boucle passait au suivant : « aucun
     * texte sous 3:1 » voulait dire « aucun texte mesuré ».
     *
     * Un contrôle vert parce qu'il ne regarde rien est pire qu'un contrôle
     * absent — on cesse de vérifier à la main ce qu'on croit couvert. Les deux
     * formes sont désormais lues, et `oklch()` est converti en sRGB ici même,
     * puisque la page n'a rien d'autre à offrir.
     */
    const oklchVersRvb = (L, C, H) => {
      const h = (H * Math.PI) / 180;
      const a = C * Math.cos(h);
      const b = C * Math.sin(h);
      const l3 = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
      const m3 = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
      const s3 = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
      const lin = [
        4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3,
        -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3,
        -0.0041960863 * l3 - 0.7034186147 * m3 + 1.7076147010 * s3,
      ];
      return lin.map((v) => {
        const e = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.max(v, 0) ** (1 / 2.4) - 0.055;
        return Math.min(255, Math.max(0, Math.round(e * 255)));
      });
    };
    const rgb = (s) => {
      const texte = String(s);
      const mRgb = texte.match(/rgba?\(([^)]+)\)/);
      if (mRgb) {
        const p = mRgb[1].split(/[,\s/]+/).filter(Boolean).map(Number);
        return { c: p.slice(0, 3), a: p.length > 3 ? p[3] : 1 };
      }
      const mOk = texte.match(/oklch\(([^)]+)\)/);
      if (mOk) {
        // « oklch(0.87 0.135 82 / 0.5) » — l'alpha suit une barre oblique, et
        // la clarté peut être écrite en pourcentage.
        const [avant, apres] = mOk[1].split('/');
        const p = avant.trim().split(/\s+/).map((v) => (v.endsWith('%') ? Number(v.slice(0, -1)) / 100 : Number(v)));
        if (p.some((v) => !Number.isFinite(v))) return null;
        const alpha = apres === undefined ? 1
          : (apres.trim().endsWith('%') ? Number(apres.trim().slice(0, -1)) / 100 : Number(apres));
        return { c: oklchVersRvb(p[0], p[1] || 0, p[2] || 0), a: Number.isFinite(alpha) ? alpha : 1 };
      }
      if (/^transparent$/i.test(texte.trim())) return { c: [0, 0, 0], a: 0 };
      return null;
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
