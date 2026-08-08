import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatEntier } from '@/lib/montants';

/**
 * Pagination.
 *
 * Elle se réduisait à deux chevrons et à un « 41–60 sur 1 248 ». On savait
 * avancer d'une page, reculer d'une page, et rien d'autre : ni combien il y en
 * avait, ni comment atteindre la dernière — sur mille deux cents clients, il
 * fallait soixante-deux clics pour aller au bout, ou renoncer.
 *
 * Trois choses la rendent utilisable :
 *
 * - **les numéros de page**, avec les élisions. La première et la dernière sont
 *   toujours là : ce sont les deux seules destinations qu'on vise réellement
 *   au-delà du voisinage immédiat ;
 * - **le rang affiché**, qui répond à « où suis-je » sans compter ;
 * - **la taille de page**. Un comptable qui relit son fichier veut cent lignes
 *   d'un coup ; celui qui cherche un nom en veut dix. C'était un réglage du
 *   développeur, ça devient un réglage de l'utilisateur.
 *
 * Le bloc reste affiché quand tout tient sur une page — seuls les numéros
 * disparaissent. Il portait auparavant `return null` dans ce cas, ce qui aurait
 * enfermé qui passe à « 100 / page » : le sélecteur qu'il faut pour revenir
 * s'en va avec la ligne.
 */

/**
 * Fenêtre de numéros : première, dernière, et le voisinage immédiat de la page
 * courante. `null` marque une élision.
 *
 * Le voisinage vaut un de chaque côté, jamais deux : au-delà, la ligne change
 * de largeur selon la position dans la liste, et les boutons se déplacent sous
 * le curseur d'un clic à l'autre.
 */
export function fenetrePages(page: number, total: number): (number | null)[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const retenues = new Set([1, total, page, page - 1, page + 1]);
  // Les extrémités gardent trois numéros pleins : « 1 … 3 » ne vaut pas mieux
  // que « 1 2 3 », et coûte une élision pour rien.
  if (page <= 3) [2, 3, 4].forEach((n) => retenues.add(n));
  if (page >= total - 2) [total - 1, total - 2, total - 3].forEach((n) => retenues.add(n));

  const pages = [...retenues].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
  const sortie: (number | null)[] = [];
  let precedent = 0;
  for (const n of pages) {
    if (precedent && n - precedent > 1) sortie.push(null);
    sortie.push(n);
    precedent = n;
  }
  return sortie;
}

const TAILLES = [10, 20, 50, 100];

interface PaginationProps {
  page: number;
  total: number;
  limit: number;
  onChange: (page: number) => void;
  /**
   * Fourni, le sélecteur « 10 / page » apparaît. Absent, la taille reste celle
   * que l'écran a choisie — tous ne peuvent pas l'ouvrir : une liste dont
   * chaque ligne déclenche une requête n'a rien à gagner à passer à cent.
   */
  onLimitChange?: (limit: number) => void;
}

export function Pagination({ page, total, limit, onChange, onLimitChange }: PaginationProps) {
  const { t } = useTranslation();
  const totalPages = Math.max(1, Math.ceil(total / limit));
  if (total === 0) return null;

  const debut = (page - 1) * limit + 1;
  const fin = Math.min(page * limit, total);

  const bouton = 'inline-flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-xs font-medium'
    + ' transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-4">
      <nav className="flex items-center gap-1" aria-label={t('common.pagination.libelle')}>
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
          aria-label={t('common.pagination.precedent')}
          className={cn(bouton, 'border border-border text-muted-foreground hover:bg-muted disabled:pointer-events-none disabled:opacity-40')}
        >
          {/* Les chevrons se retournent en arabe : ils montrent le sens de la
              lecture, pas un côté d'écran. */}
          <ChevronLeft className="h-4 w-4 rtl:rotate-180" aria-hidden />
        </button>

        {totalPages > 1 && fenetrePages(page, totalPages).map((n, i) => (
          n === null ? (
            <span key={`elision-${i}`} aria-hidden className={cn(bouton, 'text-muted-foreground')}>…</span>
          ) : (
            <button
              key={n}
              type="button"
              onClick={() => onChange(n)}
              aria-current={n === page ? 'page' : undefined}
              aria-label={t('common.pagination.page', { nombre: n })}
              className={cn(
                bouton, 'tabular-nums',
                n === page
                  ? 'border border-primary bg-primary-subtle text-primary'
                  : 'text-muted-foreground hover:bg-muted',
              )}
            >
              {n}
            </button>
          )
        ))}

        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onChange(page + 1)}
          aria-label={t('common.pagination.suivant')}
          className={cn(bouton, 'border border-border text-muted-foreground hover:bg-muted disabled:pointer-events-none disabled:opacity-40')}
        >
          <ChevronRight className="h-4 w-4 rtl:rotate-180" aria-hidden />
        </button>
      </nav>

      <div className="flex items-center gap-3">
        <span className="text-xs tabular-nums text-muted-foreground">
          {t('common.pagination.affichage', {
            debut: formatEntier(debut), fin: formatEntier(fin), total: formatEntier(total),
          })}
        </span>
        {onLimitChange && (
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="sr-only">{t('common.pagination.parPage')}</span>
            <select
              value={limit}
              onChange={(e) => onLimitChange(Number(e.target.value))}
              className="h-8 rounded-md border border-border bg-surface px-2 text-xs tabular-nums text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {TAILLES.map((n) => (
                <option key={n} value={n}>{t('common.pagination.parPageOption', { nombre: n })}</option>
              ))}
            </select>
          </label>
        )}
      </div>
    </div>
  );
}
