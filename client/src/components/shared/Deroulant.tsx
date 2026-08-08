import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

/**
 * Panneau déroulant accroché à son déclencheur.
 *
 * Trois écrans en réclamaient un le même jour — le menu « + Nouveau » et le
 * réglage « Personnaliser » du tableau de bord, le bloc utilisateur en pied de
 * barre latérale — et deux copies existaient déjà ailleurs (`ColumnToggleMenu`,
 * `ExportButton`), chacune avec sa propre gestion du clic extérieur. La
 * troisième aurait figé la divergence : l'une se ferme à Échap, l'autre non.
 *
 * Il reste volontairement plus modeste que `MenuActions` : pas de portail, pas
 * de bascule au-dessus, pas de navigation aux flèches. Ces trois-là servent aux
 * menus de **ligne de tableau**, qui vivent dans un conteneur à
 * `overflow-hidden` et peuvent tomber au ras du bas de fenêtre. Un menu de
 * barre d'outils n'a ni l'un ni l'autre problème, et le portail lui coûterait
 * un calcul de position pour rien.
 *
 * L'alignement est logique — `end-0` — et non « à droite » : en arabe, le
 * panneau doit tomber du côté où l'on commence à lire.
 */
export function Deroulant({
  declencheur, children, largeur = 'w-56', aligne = 'end', className,
}: {
  /** Rendu du bouton. `ouvert` sert à retourner un chevron, par exemple. */
  declencheur: (etat: { ouvert: boolean; basculer: () => void }) => ReactNode;
  children: ReactNode;
  largeur?: string;
  /** Bord du déclencheur sur lequel le panneau s'aligne. */
  aligne?: 'start' | 'end';
  /** Position verticale du panneau : sous le bouton par défaut. */
  className?: string;
}) {
  const [ouvert, setOuvert] = useState(false);
  const conteneur = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ouvert) return undefined;
    const clic = (e: MouseEvent) => {
      if (!conteneur.current?.contains(e.target as Node)) setOuvert(false);
    };
    const touche = (e: KeyboardEvent) => { if (e.key === 'Escape') setOuvert(false); };
    document.addEventListener('mousedown', clic);
    document.addEventListener('keydown', touche);
    return () => {
      document.removeEventListener('mousedown', clic);
      document.removeEventListener('keydown', touche);
    };
  }, [ouvert]);

  return (
    <div className="relative" ref={conteneur}>
      {declencheur({ ouvert, basculer: () => setOuvert((o) => !o) })}
      {ouvert && (
        <div
          // Le clic sur une entrée referme le panneau : sans cela, choisir
          // « Déconnexion » laisserait le menu ouvert par-dessus l'écran de
          // connexion.
          onClick={() => setOuvert(false)}
          className={cn(
            'surgir absolute z-50 rounded-lg border border-border bg-surface-elevated p-1 shadow-lg',
            aligne === 'end' ? 'end-0' : 'start-0',
            className ?? 'top-full mt-1',
            largeur,
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
}

/** Entrée de menu : même dessin que celles de `MenuActions`. */
export function EntreeDeroulant({
  icone: Icone, children, onSelect, to, danger,
}: {
  icone?: React.ElementType;
  children: ReactNode;
  onSelect?: () => void;
  /** Rendue en lien quand l'entrée mène ailleurs — le clic milieu doit marcher. */
  to?: string;
  danger?: boolean;
}) {
  const classe = cn(
    'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-start text-sm transition-colors duration-150',
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
    danger
      ? 'text-destructive-text hover:bg-destructive-subtle'
      : 'text-foreground hover:bg-accent hover:text-accent-foreground',
  );
  const contenu = (
    <>
      {Icone && <Icone className={cn('h-4 w-4 shrink-0', !danger && 'text-muted-foreground')} aria-hidden />}
      <span className="min-w-0 truncate">{children}</span>
    </>
  );

  if (to) return <Link to={to} className={classe}>{contenu}</Link>;
  return <button type="button" onClick={onSelect} className={classe}>{contenu}</button>;
}
