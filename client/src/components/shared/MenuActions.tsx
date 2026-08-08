import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';

/**
 * Menu d'actions d'une ligne de tableau.
 *
 * Une ligne de facture portait jusqu'à six icônes muettes — un disque, une
 * enveloppe, une horloge, un crayon, un avion, une croix — dont le sens ne se
 * découvrait qu'en survolant chacune. Elles occupaient un cinquième de la
 * largeur du tableau, changeaient de nombre d'une ligne à l'autre selon le
 * statut, et cassaient l'alignement de la colonne. Surtout, elles mettaient au
 * même niveau visuel « télécharger le PDF », qu'on fait dix fois par jour, et
 * « supprimer », qu'on fait trois fois par an.
 *
 * Le repli en un seul `⋯` rend la largeur au tableau et remet les actions dans
 * leur ordre naturel : ce qui domine reste dehors — le PDF sur une facture —,
 * le reste attend d'être demandé, **avec son libellé écrit**.
 *
 * ── Fabrication ──────────────────────────────────────────────────────────
 *
 * Le panneau est monté dans un portail sur `document.body`, pas dans la
 * cellule. Le conteneur du tableau porte `overflow-hidden` pour ses coins
 * arrondis : un menu posé dans la cellule y serait tranché net à la dernière
 * ligne, là où on en a le plus besoin. Le portail lui coûte un calcul de
 * position, et lui épargne d'exister à l'intérieur d'un cadre qui le coupe.
 *
 * Il se ferme au clic extérieur, à Échap, au défilement et au redimensionnement
 * — un panneau en position fixe ne suit pas sa cellule, et vaut mieux fermé que
 * flottant à côté d'une autre ligne. Les flèches parcourent les entrées en
 * boucle, Échap rend le focus au bouton : on ne perd jamais le fil au clavier.
 */

export interface ActionLigne {
  cle: string;
  libelle: string;
  icone: React.ElementType;
  onSelect: () => void;
  /** Suppression, annulation : l'entrée passe en rouge et se pose en dernier. */
  danger?: boolean;
  desactivee?: boolean;
}

/** Les appelants composent la liste avec des `condition && {…}` : on les filtre ici. */
type Entree = ActionLigne | false | null | undefined;

const LARGEUR = 208;
const MARGE = 8;

export function MenuActions({ actions, className }: { actions: Entree[]; className?: string }) {
  const { t } = useTranslation();
  const [ouvert, setOuvert] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const declencheur = useRef<HTMLButtonElement>(null);
  const panneau = useRef<HTMLDivElement>(null);
  const entrees = useRef<(HTMLButtonElement | null)[]>([]);

  const retenues = actions.filter((a): a is ActionLigne => Boolean(a));

  const fermer = useCallback((rendreLeFocus = true) => {
    setOuvert(false);
    // La position est oubliée avec le panneau : gardée, elle ferait apparaître
    // la prochaine ouverture une image à l'ancien emplacement — sur une autre
    // ligne, donc au mauvais endroit — avant de sauter en place.
    setPosition(null);
    if (rendreLeFocus) declencheur.current?.focus();
  }, []);

  // La position se calcule avant la peinture : mesurée après, le panneau
  // apparaîtrait un instant dans le coin haut-gauche avant de sauter en place.
  useLayoutEffect(() => {
    if (!ouvert || !declencheur.current) return;
    const r = declencheur.current.getBoundingClientRect();
    const hauteur = Math.min(retenues.length * 36 + 12, 320);
    // Le menu s'aligne sur le bord du bouton par lequel on lit : à droite en
    // français, à gauche en arabe.
    const rtl = document.documentElement.dir === 'rtl';
    const brut = rtl ? r.left : r.right - LARGEUR;
    const left = Math.min(Math.max(MARGE, brut), window.innerWidth - LARGEUR - MARGE);
    // Bascule au-dessus quand le bas de la fenêtre est trop proche : c'est le
    // cas de la dernière ligne de toutes les listes.
    const enBas = r.bottom + hauteur + MARGE > window.innerHeight;
    setPosition({ top: enBas ? r.top - hauteur - 4 : r.bottom + 4, left });
  }, [ouvert, retenues.length]);

  /**
   * Le focus attend que le panneau existe.
   *
   * Il était posé dans l'effet ci-dessous, qui s'exécute **avant** que le
   * portail soit monté — la position n'est connue qu'à l'effet de mise en page,
   * et le panneau n'est rendu qu'une fois qu'elle l'est. Les références étaient
   * donc encore nulles, l'appel ne faisait rien, et la navigation aux flèches
   * ne partait de nulle part : le menu était inutilisable au clavier sans que
   * rien ne le signale.
   */
  useEffect(() => {
    if (ouvert && position) entrees.current[0]?.focus();
  }, [ouvert, position]);

  useEffect(() => {
    if (!ouvert) return undefined;

    const clic = (e: MouseEvent) => {
      const cible = e.target as Node;
      if (panneau.current?.contains(cible) || declencheur.current?.contains(cible)) return;
      fermer(false);
    };
    const touche = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); fermer(); }
      if (e.key === 'Tab') fermer(false);
    };
    const bouger = () => fermer(false);

    document.addEventListener('mousedown', clic);
    document.addEventListener('keydown', touche);
    window.addEventListener('resize', bouger);
    // `capture` : le défilement d'un conteneur interne ne remonte pas jusqu'à
    // la fenêtre, et le menu resterait accroché à un vide.
    window.addEventListener('scroll', bouger, true);
    return () => {
      document.removeEventListener('mousedown', clic);
      document.removeEventListener('keydown', touche);
      window.removeEventListener('resize', bouger);
      window.removeEventListener('scroll', bouger, true);
    };
  }, [ouvert, fermer]);

  function naviguer(e: React.KeyboardEvent, index: number) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    const n = retenues.length;
    const cible = e.key === 'Home' ? 0
      : e.key === 'End' ? n - 1
        : e.key === 'ArrowDown' ? (index + 1) % n : (index - 1 + n) % n;
    entrees.current[cible]?.focus();
  }

  /**
   * Aucune action possible — une facture annulée, un BL clos — mais la place
   * reste prise.
   *
   * Sans ce vide, la colonne se décalait d'une ligne à l'autre : le bouton PDF
   * glissait vers la droite dès qu'une ligne n'avait plus de menu, et la
   * colonne d'actions perdait son bord. Un tableau se lit à ses alignements.
   */
  if (!retenues.length) {
    return <span aria-hidden className={cn('inline-block h-[2.125rem] w-[2.125rem]', className)} />;
  }

  return (
    <>
      <Button
        ref={declencheur}
        type="button"
        variant="ghost"
        size="icon"
        className={className}
        aria-haspopup="menu"
        aria-expanded={ouvert}
        aria-label={t('common.actions')}
        title={t('common.actions')}
        onClick={() => (ouvert ? fermer(false) : setOuvert(true))}
      >
        <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
      </Button>

      {ouvert && position && createPortal(
        <div
          ref={panneau}
          role="menu"
          aria-label={t('common.actions')}
          className="fixed z-50 overflow-hidden rounded-lg border border-border bg-surface-elevated p-1 shadow-lg"
          style={{ top: position.top, left: position.left, width: LARGEUR }}
        >
          {retenues.map((a, i) => {
            const Icone = a.icone;
            return (
              <button
                key={a.cle}
                ref={(el) => { entrees.current[i] = el; }}
                type="button"
                role="menuitem"
                disabled={a.desactivee}
                onKeyDown={(e) => naviguer(e, i)}
                onClick={() => { fermer(); a.onSelect(); }}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-start text-sm transition-colors duration-150',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  'disabled:pointer-events-none disabled:opacity-50',
                  a.danger
                    ? 'text-destructive-text hover:bg-destructive-subtle'
                    : 'text-foreground hover:bg-accent hover:text-accent-foreground',
                )}
              >
                <Icone className={cn('h-4 w-4 shrink-0', !a.danger && 'text-muted-foreground')} aria-hidden />
                <span className="min-w-0 truncate">{a.libelle}</span>
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </>
  );
}
