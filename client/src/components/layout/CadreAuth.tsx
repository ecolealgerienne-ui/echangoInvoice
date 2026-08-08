import { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText, PackageCheck, ShieldCheck } from 'lucide-react';
import { SelecteurLangue } from './SelecteurLangue';
import { SelecteurTheme } from './SelecteurTheme';

/**
 * Cadre commun des écrans d'entrée : connexion, création de compte, invitation.
 *
 * Les trois posaient chacun une carte seule au centre d'un fond vide. C'était
 * le motif de 2015 ; en 2026 il se lit comme un formulaire administratif,
 * exactement l'impression qu'un logiciel de facturation n'a pas besoin de
 * renforcer. Et surtout, ces écrans sont vus par deux publics très différents :
 * celui qui se connecte pour la centième fois — à qui il faut le chemin le plus
 * court — et celui qui découvre le produit, à qui personne ne disait rien.
 *
 * D'où deux colonnes : le formulaire garde toute la place à gauche, et le
 * panneau de droite dit ce que fait l'outil. Ce panneau disparaît sous 1024 px,
 * puisque sur un téléphone c'est toujours le premier public qui est là.
 *
 * Le choix de la langue et du thème est offert **avant** la connexion : un
 * arabophone ne doit pas avoir à traverser un écran en français pour trouver
 * comment le mettre en arabe.
 */
export function CadreAuth({ children }: { children: ReactNode }) {
  const { t } = useTranslation();

  const arguments_ = [
    { icone: FileText, cle: 'auth.pitch.documents' },
    { icone: PackageCheck, cle: 'auth.pitch.stock' },
    { icone: ShieldCheck, cle: 'auth.pitch.conformite' },
  ];

  return (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-[1fr_minmax(0,26rem)]">
      {/* ── Colonne du formulaire ─────────────────────────────────────── */}
      <div className="flex min-h-screen flex-col px-6 py-8 lg:px-16">
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <MarqueEchango />
            <span className="text-base font-semibold tracking-tight text-foreground">
              Echango&nbsp;Invoice
            </span>
          </div>
          <div className="flex items-center gap-2">
            <SelecteurTheme />
            <SelecteurLangue />
          </div>
        </header>

        <main className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-sm animate-slide-up">{children}</div>
        </main>

        <footer className="text-xs text-muted-foreground">{t('auth.footer')}</footer>
      </div>

      {/* ── Panneau de présentation ───────────────────────────────────────
          Caché sous 1024 px : sur un téléphone, c'est un utilisateur qui
          revient, pas un visiteur à convaincre. */}
      <aside className="relative hidden overflow-hidden bg-panneau lg:flex lg:flex-col lg:justify-center lg:px-12">
        {/* Trame très basse en contraste, dessinée en CSS plutôt qu'en image :
            rien à charger, et elle suit la couleur de la marque. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              'linear-gradient(oklch(1 0 0) 1px, transparent 1px), linear-gradient(90deg, oklch(1 0 0) 1px, transparent 1px)',
            backgroundSize: '28px 28px',
          }}
        />
        <div className="relative space-y-8">
          <p className="text-xl font-semibold leading-snug text-panneau-foreground">
            {t('auth.pitch.titre')}
          </p>
          <ul className="space-y-5">
            {arguments_.map(({ icone: Icone, cle }) => (
              <li key={cle} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-panneau-foreground/15">
                  <Icone className="h-4 w-4 text-panneau-foreground" aria-hidden />
                </span>
                <span className="text-sm leading-relaxed text-panneau-foreground/80">{t(cle)}</span>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}

/** Marque dessinée en SVG : nette à toute taille, et elle suit le thème. */
function MarqueEchango() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7" aria-hidden>
      <rect width="24" height="24" rx="6" className="fill-primary" />
      <path
        d="M7 8.5h10M7 12h7M7 15.5h10"
        className="stroke-primary-foreground"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
    </svg>
  );
}
