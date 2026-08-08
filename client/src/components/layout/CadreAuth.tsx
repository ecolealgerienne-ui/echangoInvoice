import { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText, PackageCheck, ShieldCheck } from 'lucide-react';
import { SelecteurLangue } from './SelecteurLangue';
import { SelecteurTheme } from './SelecteurTheme';

/**
 * Cadre commun des écrans d'entrée : connexion, création de compte, invitation.
 *
 * Deux colonnes : le formulaire garde toute la place à gauche, et le panneau
 * de droite dit ce que fait l'outil. Ce panneau disparaît sous 1024 px,
 * puisque sur un téléphone c'est un utilisateur qui revient, pas un visiteur à
 * convaincre.
 *
 * Le panneau était un aplat de bleu nuit strié d'une grille. Il est devenu la
 * seule pièce franchement expressive du produit — et c'est le bon endroit :
 * c'est le premier écran vu, le seul où personne n'est en train de travailler,
 * et il n'y a rien à y lire de dense. Trois couches s'y superposent :
 *
 * 1. l'aplat de marque (`--ci-panneau`), le bleu nuit imprimé sur les factures ;
 * 2. **deux aurores** — des taches radiales azur et sarcelle, très floues, qui
 *    dérivent sur trente et quarante secondes. Ce sont elles qui font que
 *    l'écran est vivant sans que rien ne bouge visiblement ;
 * 3. la grille, conservée mais affaiblie, qui donne une échelle.
 *
 * Aucun texte ne repose sur une aurore seule : la lisibilité ne dépend jamais
 * de leur position à un instant donné. Sous `prefers-reduced-motion`, elles
 * s'arrêtent — et l'écran reste exactement aussi lisible, simplement fixe.
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
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-[1fr_minmax(0,28rem)]">
      {/* ── Colonne du formulaire ─────────────────────────────────────── */}
      <div className="relative flex min-h-screen flex-col px-6 py-8 lg:px-16">
        {/* La même lueur que dans l'application, pour que la connexion et le
            tableau de bord aient visiblement la même origine. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-96"
          style={{
            backgroundImage:
              'radial-gradient(46rem 20rem at 20% -10%, oklch(var(--ci-halo) / 0.12), transparent 70%)',
          }}
        />

        <header className="relative flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
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

        <main className="relative flex flex-1 items-center justify-center">
          <div className="w-full max-w-sm animate-entree">{children}</div>
        </main>

        <footer className="relative text-xs text-muted-foreground">{t('auth.footer')}</footer>
      </div>

      {/* ── Panneau de présentation ─────────────────────────────────────── */}
      <aside className="relative hidden overflow-hidden bg-panneau lg:flex lg:flex-col lg:justify-center lg:px-12">
        {/* Aurore froide, en haut. */}
        <div
          aria-hidden
          className="aurore pointer-events-none absolute -left-1/4 -top-1/4 h-[38rem] w-[38rem] rounded-full blur-3xl"
          style={{ background: 'radial-gradient(circle, oklch(var(--ci-serie-1) / 0.55), transparent 65%)' }}
        />
        {/* Aurore sarcelle, en bas — l'autre extrémité du dégradé de la marque. */}
        <div
          aria-hidden
          className="aurore-lente pointer-events-none absolute -bottom-1/3 -right-1/4 h-[34rem] w-[34rem] rounded-full blur-3xl"
          style={{ background: 'radial-gradient(circle, oklch(var(--ci-serie-4) / 0.45), transparent 65%)' }}
        />
        {/* Trame dessinée en CSS plutôt qu'en image : rien à charger, et elle
            suit la couleur du texte du panneau. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.05]"
          style={{
            backgroundImage:
              'linear-gradient(oklch(var(--ci-panneau-foreground)) 1px, transparent 1px), linear-gradient(90deg, oklch(var(--ci-panneau-foreground)) 1px, transparent 1px)',
            backgroundSize: '32px 32px',
          }}
        />

        <div className="relative space-y-8">
          <p className="text-2xl font-semibold leading-snug text-panneau-foreground">
            {t('auth.pitch.titre')}
          </p>
          <ul className="echelonner space-y-5">
            {arguments_.map(({ icone: Icone, cle }) => (
              <li key={cle} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-panneau-foreground/[0.14] ring-1 ring-inset ring-panneau-foreground/20">
                  <Icone className="h-4 w-4 text-panneau-foreground" aria-hidden />
                </span>
                <span className="text-sm leading-relaxed text-panneau-foreground/90">{t(cle)}</span>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}

/**
 * Marque dessinée en SVG : nette à toute taille, et elle suit le thème.
 * Le dégradé est le même que dans la barre latérale — azur vers sarcelle,
 * deux des six familles du système, dans l'ordre.
 */
function MarqueEchango() {
  return (
    <svg viewBox="0 0 24 24" className="h-8 w-8 drop-shadow-sm" aria-hidden>
      <defs>
        <linearGradient id="marque-auth" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="oklch(var(--ci-serie-1))" />
          <stop offset="100%" stopColor="oklch(var(--ci-serie-4))" />
        </linearGradient>
      </defs>
      <rect width="24" height="24" rx="7" fill="url(#marque-auth)" />
      <path
        d="M7 8.5h10M7 12h7M7 15.5h10"
        className="stroke-primary-foreground"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
    </svg>
  );
}
