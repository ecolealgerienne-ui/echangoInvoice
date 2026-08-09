import { useId, useMemo, useState } from 'react';
import { Minus, TrendingDown, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { couleurSerie, creneauSerie } from '@/lib/filieres';
import { abrege, ecartPourcent, pourcentage } from '@/lib/montants';
import { ProgressBar } from '@/components/ui/ProgressBar';

export { couleurSerie };

/**
 * Graphiques.
 *
 * Écrits en SVG plutôt qu'avec une bibliothèque, pour trois raisons :
 *
 * - **le thème.** Les couleurs viennent des jetons via `currentColor` et des
 *   variables CSS ; une bibliothèque impose ses palettes et il faut ensuite les
 *   traduire dans les deux thèmes à la main ;
 * - **le poids.** Le paquet client dépasse déjà le mégaoctet ; Recharts en
 *   ajouterait plus de cent kilo-octets pour trois graphiques ;
 * - **le hors-ligne.** L'application est utilisée en mobilité, et tout ce qui
 *   est embarqué ici l'est pour de bon.
 *
 * ── Couleur ──────────────────────────────────────────────────────────────
 *
 * Les six familles de séries (`--ci-serie-1..6`) ont un **ordre figé**, validé
 * sous protanopie et deutéranopie : le pire couple voisin tient ΔE 15,7 en
 * clair et 13,6 en sombre, et toutes tiennent 3:1 contre la carte. Cet ordre
 * est la sécurité — il ne se réarrange pas au gré des écrans.
 *
 * Deux règles en découlent, et elles ne sont pas négociables :
 *
 * 1. **La couleur suit l'entité, jamais le rang.** Les espèces sont la série 1
 *    en janvier comme en juin. Un mois sans chèques ne repeint pas les autres.
 * 2. **Un classement ne se colore pas.** « Top clients », « valeur du stock par
 *    article » sont des rangs de la même mesure : la longueur de la barre dit
 *    déjà tout. Leur donner huit teintes dépenserait le canal de l'identité à
 *    ré-encoder ce qu'on voit déjà, et laisserait croire que le troisième
 *    client a quelque chose de violet. Ils gardent une teinte unique.
 *
 * ── Mouvement ────────────────────────────────────────────────────────────
 *
 * La courbe se trace de gauche à droite en 1,1 s et l'aire se dévoile derrière
 * elle ; les barres poussent depuis leur origine. Ce n'est pas décoratif : sur
 * une série temporelle, le tracé impose le sens de lecture — le temps va de la
 * gauche vers la droite — et fait remarquer la forme avant les chiffres. Tout
 * est coupé par `prefers-reduced-motion`, et rien n'est porté par le mouvement
 * seul : à l'arrêt, le graphique est complet.
 */

export interface PointGraphique {
  /** Étiquette de l'axe horizontal (date déjà formatée). */
  libelle: string;
  valeur: number;
}

interface ProprietesCourbe {
  points: PointGraphique[];
  /** Formatage de la valeur lue. */
  format: (v: number) => string;
  hauteur?: number;
  className?: string;
  /** Créneau de série (0 à 5). Par défaut le premier — l'azur de la marque. */
  serie?: number;
  /**
   * Affiche sous la valeur lue son écart avec le **premier point** de la série,
   * et la date de ce point.
   *
   * C'est la question que pose une courbe courte — « ça monte ou ça descend
   * depuis lundi ? » — et à laquelle la forme seule répond mal quand deux jours
   * creusent au milieu. L'écart suit le point survolé : on peut donc lire
   * l'évolution jusqu'à n'importe quel jour de la fenêtre, pas seulement
   * jusqu'au dernier.
   *
   * Rien n'est affiché quand le premier point est nul : « +∞ » et « +100 % »
   * seraient tous deux faux.
   */
  compare?: boolean;
  /** Libellé de comparaison, interpolé sur la date du premier point. */
  formatComparaison?: (libelle: string) => string;
}

/** Arrondit la borne haute pour que les graduations tombent juste. */
function borneHaute(max: number): number {
  if (max <= 0) return 1;
  const puissance = 10 ** Math.floor(Math.log10(max));
  return Math.ceil(max / puissance) * puissance;
}

/**
 * Graduation abrégée : « 5,0 M » plutôt que « 5 000 000,00 DA ».
 *
 * Un axe n'est pas un total : il donne l'ordre de grandeur, et le montant exact
 * se lit sur le point survolé. Écrit en entier, il occupait quatre centimètres
 * de gouttière, se coupait en deux lignes, et poussait la courbe hors du cadre.
 *
 * La fonction est passée dans `lib/montants` : les cartes d'indicateur du
 * tableau de bord posent exactement la même question, et deux copies auraient
 * divergé.
 */

/**
 * Courbe d'aire.
 *
 * La ligne dit la tendance, l'aire dit le volume. Les deux ensemble se lisent
 * d'un coup d'œil là où une ligne seule oblige à suivre du regard.
 *
 * Le trait est d'**une seule couleur**, à deux pixels. Il a été un dégradé
 * horizontal entre deux voisins de la même famille, au motif qu'un aplat
 * aplatit ; sur une courbe de trente jours, ce dégradé faisait surtout changer
 * la courbe de teinte en cours de route, et laissait croire qu'on lisait deux
 * séries. L'aire descend de 22 % d'opacité à zéro : au-delà, elle concurrence
 * la ligne ; en deçà, elle ne dit plus rien du volume.
 */
export function CourbeAire({
  points, format, hauteur = 190, className, serie = 0, compare, formatComparaison,
}: ProprietesCourbe) {
  const id = useId();
  const [survole, setSurvole] = useState<number | null>(null);

  const { chemin, aire, coords, max, graduations } = useMemo(() => {
    const L = 100;
    const H = 100;
    const maxBrut = Math.max(...points.map((p) => p.valeur), 0);
    const m = borneHaute(maxBrut);
    // Un seul point ne trace pas de ligne : on le pose au centre.
    const x = (i: number) => (points.length <= 1 ? L / 2 : (i / (points.length - 1)) * L);
    const y = (v: number) => H - (v / m) * H;
    const c = points.map((p, i) => ({ x: x(i), y: y(p.valeur), ...p }));
    return {
      max: m,
      coords: c,
      chemin: c.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' '),
      aire: c.length
        ? `M${c[0].x.toFixed(2)},${H} ${c.map((p) => `L${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ')} L${c[c.length - 1].x.toFixed(2)},${H} Z`
        : '',
      graduations: [0, 0.25, 0.5, 0.75, 1].map((f) => ({ f, valeur: m * (1 - f) })),
    };
  }, [points]);

  if (!points.length) return null;
  const indexActif = survole !== null ? survole : coords.length - 1;
  const actif = coords[indexActif];
  const teinte = creneauSerie(serie);

  return (
    <div className={cn('space-y-3', className)}>
      {/* La valeur lue est posée **au-dessus** du graphique, comme sur les
          tableaux de bord financiers : c'est le chiffre qu'on vient chercher,
          il doit être le premier lu. Sous la courbe, il entrait en collision
          avec la dernière graduation de l'axe. */}
      {actif && (
        <div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-titre tabular-nums text-foreground">
              {format(actif.valeur)}
            </span>
            <span className="text-xs text-muted-foreground">{actif.libelle}</span>
          </div>
          {compare && coords.length > 1 && coords[0].valeur > 0 && indexActif > 0 && (() => {
            const ecart = Math.round(
              ((actif.valeur - coords[0].valeur) / coords[0].valeur) * 1000,
            ) / 10;
            const Fleche = ecart > 0 ? TrendingUp : ecart < 0 ? TrendingDown : Minus;
            return (
              <div className="mt-1.5 flex items-center gap-1.5 text-2xs">
                {/* Texte coloré, pas pastille : la même règle que sur les
                    cartes d'indicateur. Un écart est l'annotation d'un chiffre,
                    pas une deuxième information à côté de lui. */}
                <span
                  className={cn(
                    'inline-flex items-center gap-1 whitespace-nowrap font-semibold tabular-nums',
                    ecart >= 0 ? 'text-success-text' : 'text-destructive-text',
                  )}
                >
                  <Fleche className="h-3 w-3" aria-hidden />
                  {ecartPourcent(ecart)}
                </span>
                <span className="text-tertiaire">
                  {formatComparaison ? formatComparaison(coords[0].libelle) : coords[0].libelle}
                </span>
              </div>
            );
          })()}
        </div>
      )}

      <div className="relative">
        {/* Graduations, posées en HTML plutôt que dans le SVG : le texte garde
            ainsi sa taille réelle au lieu d'être étiré par le viewBox. */}
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
          {graduations.map((g) => (
            <div key={g.f} className="flex items-center gap-2">
              {/* Dix pixels sur l'encre d'axe : une graduation se lit du coin de
                  l'œil pendant qu'on suit la courbe, jamais frontalement. */}
              <span className="w-10 shrink-0 text-right text-3xs tabular-nums tracking-normal text-axe">
                {abrege(g.valeur)}
              </span>
              {/* La grille a son propre jeton, à peine au-dessus du fond de la
                  carte : elle doit se deviner sous la courbe, pas la découper. */}
              <span className="h-px flex-1 bg-grille" />
            </div>
          ))}
        </div>

        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="ml-12 block w-[calc(100%-3rem)]"
          style={{ height: hauteur }}
          role="img"
          aria-label={`Évolution, maximum ${format(max)}`}
        >
          <defs>
            {/* L'aire descend de 22 % à rien. Elle plafonnait à 34 % : sur le
                fond bleu nuit, un aplat à ce niveau concurrence la ligne et
                l'on finit par lire la surface au lieu de la courbe. */}
            <linearGradient id={`aire-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={couleurSerie(teinte)} stopOpacity="0.22" />
              <stop offset="60%" stopColor={couleurSerie(teinte)} stopOpacity="0.07" />
              <stop offset="100%" stopColor={couleurSerie(teinte)} stopOpacity="0" />
            </linearGradient>
          </defs>

          <path d={aire} fill={`url(#aire-${id})`} className="devoiler" />
          {/* Le trait est d'une seule couleur, à deux pixels. Il était un
              dégradé horizontal entre deux familles voisines — une jolie idée
              qui, sur trente jours, faisait changer la courbe de teinte en
              cours de route et laissait croire à un changement de série.

              `vectorEffect` garde l'épaisseur constante malgré l'étirement du
              viewBox : sans lui, un graphique large donne un trait écrasé.
              `pathLength` normalise la longueur à 1, ce qui rend le tracé
              indépendant de la forme de la courbe. */}
          <path
            d={chemin}
            pathLength={1}
            fill="none"
            stroke={couleurSerie(teinte)}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            className="tracer"
          />
        </svg>

        {/* Le point lu, posé en HTML : dans un SVG étiré, un cercle deviendrait
            une ellipse. Deux couches — un halo doux et un cœur bordé de la
            surface — pour qu'il reste visible quelle que soit la pente. */}
        {actif && coords.length > 1 && (
          <span
            aria-hidden
            /* Le point lu : rempli de la teinte, cerné de trois pixels de la
               surface de la carte. Le contour n'est pas décoratif — sans lui,
               sur une pente raide, le point se confond avec le trait qui le
               traverse et l'on ne sait plus quel jour on lit. */
            className="pointer-events-none absolute z-10 block h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-card transition-[left,top] duration-150 ease-ci"
            style={{
              left: `calc(3rem + ${actif.x}% - ${(actif.x / 100) * 3}rem)`,
              top: `${(actif.y / 100) * hauteur}px`,
              backgroundColor: couleurSerie(teinte),
            }}
          />
        )}

        {/* Zones de survol : une bande par point, pour que la lecture s'attrape
            sans viser le pixel exact de la courbe. */}
        <div className="absolute inset-y-0 left-12 right-0 flex">
          {coords.map((p, i) => (
            <button
              key={p.libelle}
              type="button"
              className="h-full flex-1 focus-visible:outline-none"
              onMouseEnter={() => setSurvole(i)}
              onFocus={() => setSurvole(i)}
              onMouseLeave={() => setSurvole(null)}
              onBlur={() => setSurvole(null)}
              aria-label={`${p.libelle} : ${format(p.valeur)}`}
            >
              {survole === i && (
                <span
                  className="block h-full w-px"
                  aria-hidden
                  style={{ backgroundColor: couleurSerie(teinte, 0.55) }}
                />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Bornes de la période, seules étiquettes horizontales utiles : les
          dates intermédiaires se lisent au survol. */}
      {coords.length > 1 && (
        <div className="flex justify-between pl-12 text-3xs tracking-normal text-axe">
          <span>{coords[0].libelle}</span>
          <span>{coords[coords.length - 1].libelle}</span>
        </div>
      )}
    </div>
  );
}

/**
 * Sparkline : la même tendance, réduite à sa plus simple expression.
 *
 * Ni axe ni graduation — placée dans une carte d'indicateur, elle répond à une
 * seule question : est-ce que ça monte ou est-ce que ça descend. Tout le reste
 * y serait du bruit. Elle porte une couleur de **statut** et non de série :
 * c'est le seul cas où la teinte dit « bonne ou mauvaise nouvelle », parce que
 * c'est exactement la question posée.
 */
export function Sparkline({
  valeurs, className, positif = true, couleur,
}: {
  valeurs: number[];
  className?: string;
  positif?: boolean;
  /**
   * Couleur imposée. Elle sert au seul cas où l'étincelle n'est pas un
   * jugement mais un décor de fond — la trace posée sous une carte
   * d'indicateur, qui doit porter la teinte de sa filière et non un vert de
   * réussite : un chiffre d'affaires n'est ni bon ni mauvais tant qu'on ne
   * l'a pas comparé, et le vert le dirait à sa place.
   */
  couleur?: string;
}) {
  const id = useId();
  const { chemin, aire } = useMemo(() => {
    if (valeurs.length < 2) return { chemin: '', aire: '' };
    const max = Math.max(...valeurs);
    const min = Math.min(...valeurs);
    const amplitude = max - min || 1;
    const pts = valeurs.map((v, i) => ({
      x: (i / (valeurs.length - 1)) * 100,
      y: 100 - ((v - min) / amplitude) * 92 - 4,
    }));
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    return { chemin: d, aire: `M${pts[0].x},100 ${d.slice(1)} L100,100 Z` };
  }, [valeurs]);

  if (!chemin) return null;
  const teinte = couleur ?? (positif ? 'oklch(var(--ci-success))' : 'oklch(var(--ci-destructive))');

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden
      className={cn('h-8 w-full', className)}
    >
      <defs>
        <linearGradient id={`etincelle-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={teinte} stopOpacity="0.30" />
          <stop offset="100%" stopColor={teinte} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={aire} fill={`url(#etincelle-${id})`} className="devoiler" />
      <path
        d={chemin}
        pathLength={1}
        fill="none"
        stroke={teinte}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        className="tracer"
      />
    </svg>
  );
}

/**
 * Barres horizontales avec leur valeur.
 *
 * Préférées aux barres verticales pour les classements : un nom de client tient
 * sur la ligne, là où une barre verticale l'obligerait à s'incliner. Le
 * classement se lit de haut en bas, comme un texte.
 *
 * `teintes` n'est fourni que lorsque les lignes sont des **entités fixes** —
 * les quatre modes de règlement, par exemple, où le créneau vient de la
 * position du mode dans sa liste de référence et non de son rang du mois. Sans
 * lui, toutes les barres prennent la teinte de la série demandée : un
 * classement n'a pas d'identités à distinguer.
 *
 * ── Le rang, et sa variation ─────────────────────────────────────────────
 *
 * `rangs` numérote les lignes `01 02 03`. Ce n'est pas de la décoration : sans
 * numéro, cinq barres décroissantes se lisent comme cinq mesures, pas comme un
 * classement — et l'on ne sait plus dire « le troisième client » sans compter
 * du doigt. Le zéro de tête aligne les chiffres et évite qu'un « 1 » maigre
 * flotte à côté d'un « 10 ».
 *
 * `variations` porte l'écart avec la période précédente, en pourcentage, ou
 * `null` quand il n'y en a pas de calculable — un client qui n'existait pas le
 * mois d'avant n'a pas progressé de l'infini, il est nouveau, et la case reste
 * vide plutôt que de mentir.
 */
export function BarresClassement({
  lignes, format, className, serie = 0, teintes, rangs, icones,
}: {
  lignes: { libelle: string; valeur: number; variation?: number | null }[];
  format: (v: number) => string;
  className?: string;
  serie?: number;
  teintes?: number[];
  rangs?: boolean;
  /**
   * Une icône par ligne. Fournie, la pastille ronde devient un carré arrondi
   * qui la porte — c'est la forme des modes de règlement dans la maquette.
   *
   * Le glyphe prend `primary-foreground`, qui est clair en thème clair et
   * sombre en thème sombre : c'est exactement l'inverse de la clarté des
   * séries dans chaque thème, donc le seul jeton qui reste lisible sur un
   * aplat de série des deux côtés. Un `text-white` en dur aurait disparu sur
   * les séries claires du thème sombre.
   */
  icones?: React.ElementType[];
}) {
  const max = Math.max(...lignes.map((l) => l.valeur), 0) || 1;

  return (
    <div className={cn('space-y-3', className)}>
      {lignes.map((l, i) => {
        const creneau = creneauSerie(teintes ? teintes[i] : serie);
        const part = Math.max(1.5, (l.valeur / max) * 100);
        const Fleche = l.variation != null && l.variation < 0 ? TrendingDown : TrendingUp;
        const Pastille = icones?.[i];
        return (
          <div key={l.libelle} className="group/barre space-y-1.5">
            <div className="flex items-baseline justify-between gap-3 text-xs">
              <span className="flex min-w-0 items-center gap-2">
                {/* Le rang est un carré de vingt-quatre pixels sur le fond
                    `rang`, et non plus deux chiffres gris posés devant le nom.
                    Un classement se lit comme un podium : le numéro doit être
                    un objet, sinon il se confond avec le début du libellé —
                    « 01 EURL Hoggar » se lisait comme un code client. */}
                {rangs && (
                  <span
                    aria-hidden
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm bg-rang text-3xs font-semibold tabular-nums text-muted-foreground"
                  >
                    {i + 1}
                  </span>
                )}
                {Pastille ? (
                  <span
                    aria-hidden
                    className="flex h-4 w-4 shrink-0 translate-y-0.5 items-center justify-center rounded-[5px]"
                    style={{ backgroundColor: couleurSerie(creneau) }}
                  >
                    <Pastille className="h-2.5 w-2.5 text-primary-foreground" />
                  </span>
                ) : teintes && (
                  <span
                    aria-hidden
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: couleurSerie(creneau) }}
                  />
                )}
                <span className="truncate text-muted-foreground">{l.libelle}</span>
              </span>
              <span className="flex shrink-0 items-baseline gap-1.5">
                {l.variation != null && (
                  <span
                    className={cn(
                      'inline-flex items-center gap-0.5 whitespace-nowrap text-2xs font-semibold tabular-nums',
                      l.variation >= 0 ? 'text-success-text' : 'text-destructive-text',
                    )}
                  >
                    <Fleche className="h-2.5 w-2.5" aria-hidden />
                    {ecartPourcent(l.variation)}
                  </span>
                )}
                <span className="font-medium tabular-nums text-foreground">
                  {format(l.valeur)}
                </span>
              </span>
            </div>
            {/* La barre est celle du système : cinq pixels, piste neutre,
                aplat sans dégradé. Elle porte auparavant une rainure teintée de
                sa propre couleur et un dégradé interne — deux raffinements qui,
                à cinq pixels de haut, ne se lisent pas comme des raffinements
                mais comme du bruit. */}
            <ProgressBar
              part={part}
              creneau={creneau}
              delai={Math.min(i, 8) * 60}
            />
          </div>
        );
      })}
    </div>
  );
}

/**
 * Anneau de répartition.
 *
 * Les dépenses par catégorie étaient six barres horizontales. Une barre répond
 * à « laquelle est la plus grosse » ; elle ne répond pas à « quelle part du
 * total », qui est pourtant la question posée dès qu'un total est écrit
 * au-dessus. Il fallait faire la division de tête, six fois.
 *
 * L'anneau répond aux deux d'un coup : la longueur d'arc **est** la part, et le
 * total se lit au centre, dans le trou que l'anneau laisse justement — un
 * camembert plein n'aurait nulle part où le mettre. La légende garde le montant
 * exact et le pourcentage écrit, parce qu'un arc ne se lit pas au dixième.
 *
 * ── Fabrication ──────────────────────────────────────────────────────────
 *
 * Le rayon vaut 15,9155 pour que la circonférence tombe **exactement à 100** :
 * chaque `stroke-dasharray` s'écrit alors en pourcentage sans conversion, et
 * aucun arrondi ne peut laisser un cheveu de fond entre deux segments. Le
 * décalage part de 25 pour que le premier segment commence à midi, là où l'œil
 * commence à lire un cadran.
 *
 * Les segments sont des arcs de cercle et non des secteurs dessinés en `path` :
 * un `stroke` garde son épaisseur quelle que soit la taille rendue.
 *
 * Une part sous un demi pour cent n'est pas dessinée — elle produirait un trait
 * plus fin que la jointure entre deux segments — mais elle reste en légende
 * avec son montant : ne pas la voir dans l'anneau est juste, ne pas la trouver
 * du tout serait un oubli.
 *
 * La couleur vient du **créneau de l'entité**, jamais du rang : le loyer garde
 * sa teinte le mois où il passe deuxième.
 */
export interface PartAnneau {
  libelle: string;
  valeur: number;
  /** Créneau de couleur de l'entité — sa position de référence, pas son rang. */
  creneau: number;
}

export function Anneau({
  parts, format, libelleTotal, className,
}: {
  parts: PartAnneau[];
  format: (v: number) => string;
  /** Intitulé posé au-dessus du total, au centre de l'anneau. */
  libelleTotal: string;
  className?: string;
}) {
  const total = parts.reduce((s, p) => s + p.valeur, 0);

  const segments = useMemo(() => {
    if (total <= 0) return [];
    let debut = 0;
    return parts.map((p) => {
      const part = (p.valeur / total) * 100;
      const segment = { libelle: p.libelle, creneau: p.creneau, part, decalage: 25 - debut };
      debut += part;
      return segment;
    });
  }, [parts, total]);

  if (total <= 0) return null;

  return (
    <div className={cn('flex flex-wrap items-center gap-x-5 gap-y-4', className)}>
      <div className="surgir relative h-36 w-36 shrink-0">
        <svg
          viewBox="0 0 42 42"
          className="h-full w-full -rotate-90"
          role="img"
          aria-label={`${libelleTotal} ${format(total)}`}
        >
          {/* La rainure : exactement la piste des barres de progression, pour
              qu'un anneau presque vide reste un anneau et non un arc qui
              flotte. Rayon intérieur 63 % du rayon utile, extérieur 89 % — le
              trou du centre doit tenir le total sans que l'anneau devienne un
              filet. */}
          <circle
            cx="21" cy="21" r="15.9155" fill="none"
            stroke="oklch(var(--ci-piste))" strokeWidth="5.5"
          />
          {segments.map((s) => (s.part < 0.5 ? null : (
            <circle
              key={s.libelle}
              cx="21" cy="21" r="15.9155" fill="none"
              stroke={couleurSerie(s.creneau)}
              strokeWidth="5.5"
              strokeDasharray={`${s.part} ${100 - s.part}`}
              strokeDashoffset={s.decalage}
            />
          )))}
        </svg>

        {/* Le total est posé en HTML par-dessus : dans le SVG il aurait suivi
            la rotation du cadran et se serait écrit sur le flanc. */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-2xs text-muted-foreground">{libelleTotal}</span>
          <span className="text-base font-bold tabular-nums text-foreground">{format(total)}</span>
        </div>
      </div>

      <div className="min-w-[10rem] flex-1 space-y-2">
        {parts.map((p) => (
          <div key={p.libelle} className="flex items-center gap-2 text-xs">
            <span
              aria-hidden
              className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
              style={{ backgroundColor: couleurSerie(p.creneau) }}
            />
            <span className="min-w-0 flex-1 truncate text-muted-foreground">{p.libelle}</span>
            <span className="w-8 shrink-0 text-end tabular-nums text-muted-foreground">
              {pourcentage(p.valeur, total, 0)}
            </span>
            <span className="w-16 shrink-0 text-end font-medium tabular-nums text-foreground">
              {format(p.valeur)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
