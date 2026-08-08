import type { Config } from 'tailwindcss';

/**
 * Les jetons stockent les **composantes** OKLCH — `0.50 0.155 254` — et non la
 * couleur formée. Tailwind reforme `oklch(…)` autour et y injecte l'alpha, ce
 * qui laisse fonctionner les cent-neuf `bg-muted/50` déjà écrits dans
 * l'application. Une couleur déjà formée les aurait tous cassés en silence :
 * Tailwind n'aurait simplement pas produit la classe, et les fonds seraient
 * devenus opaques sans qu'aucune erreur ne le signale.
 *
 * Le survol de la primaire a malgré tout son propre jeton plutôt qu'une
 * opacité : `bg-primary/90` éclaircit sur fond clair et assombrit sur fond
 * sombre — le même geste donne deux effets opposés selon le thème.
 *
 * Trois familles ont été ajoutées avec la direction « Azur & Ambre » :
 * `serie-1..6` (les séries de graphique, ordre figé et validé sous
 * daltonisme), `filiere-*` (la teinte propre à chaque métier de la barre
 * latérale) et `halo` (les lueurs colorées). Voir `globals.css` pour le
 * raisonnement complet.
 */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: 'oklch(var(--ci-background) / <alpha-value>)',
        surface: 'oklch(var(--ci-surface) / <alpha-value>)',
        'surface-elevated': 'oklch(var(--ci-surface-elevated) / <alpha-value>)',
        foreground: 'oklch(var(--ci-foreground) / <alpha-value>)',
        primary: {
          DEFAULT: 'oklch(var(--ci-primary) / <alpha-value>)',
          foreground: 'oklch(var(--ci-primary-foreground) / <alpha-value>)',
          hover: 'oklch(var(--ci-primary-hover) / <alpha-value>)',
          subtle: 'oklch(var(--ci-primary-subtle) / <alpha-value>)',
        },
        secondary: {
          DEFAULT: 'oklch(var(--ci-secondary) / <alpha-value>)',
          foreground: 'oklch(var(--ci-secondary-foreground) / <alpha-value>)',
        },
        // Rôles sémantiques : chacun a sa couleur pleine, son fond ténu et sa
        // couleur de texte sur ce fond. Les trois sont nécessaires — un texte
        // « success » posé sur un fond « success-subtle » doit rester lisible
        // dans les deux thèmes, ce qu'une seule valeur ne peut pas garantir.
        success: {
          DEFAULT: 'oklch(var(--ci-success) / <alpha-value>)',
          foreground: 'oklch(var(--ci-success-foreground) / <alpha-value>)',
          subtle: 'oklch(var(--ci-success-subtle) / <alpha-value>)',
          text: 'oklch(var(--ci-success-text) / <alpha-value>)',
        },
        warning: {
          DEFAULT: 'oklch(var(--ci-warning) / <alpha-value>)',
          foreground: 'oklch(var(--ci-warning-foreground) / <alpha-value>)',
          subtle: 'oklch(var(--ci-warning-subtle) / <alpha-value>)',
          text: 'oklch(var(--ci-warning-text) / <alpha-value>)',
        },
        destructive: {
          DEFAULT: 'oklch(var(--ci-destructive) / <alpha-value>)',
          foreground: 'oklch(var(--ci-destructive-foreground) / <alpha-value>)',
          subtle: 'oklch(var(--ci-destructive-subtle) / <alpha-value>)',
          text: 'oklch(var(--ci-destructive-text) / <alpha-value>)',
        },
        info: {
          DEFAULT: 'oklch(var(--ci-info) / <alpha-value>)',
          foreground: 'oklch(var(--ci-info-foreground) / <alpha-value>)',
          subtle: 'oklch(var(--ci-info-subtle) / <alpha-value>)',
          text: 'oklch(var(--ci-info-text) / <alpha-value>)',
        },
        // Séries de graphique. Elles ne sont pas interchangeables avec les
        // rôles sémantiques : « série 2 » est verte parce que c'est la
        // deuxième, pas parce que c'est une bonne nouvelle.
        serie: {
          1: 'oklch(var(--ci-serie-1) / <alpha-value>)',
          2: 'oklch(var(--ci-serie-2) / <alpha-value>)',
          3: 'oklch(var(--ci-serie-3) / <alpha-value>)',
          4: 'oklch(var(--ci-serie-4) / <alpha-value>)',
          5: 'oklch(var(--ci-serie-5) / <alpha-value>)',
          6: 'oklch(var(--ci-serie-6) / <alpha-value>)',
        },
        // Teinte de métier. Elle colore la navigation et l'en-tête des écrans,
        // pour qu'on sache où l'on est sans lire le titre.
        filiere: {
          ventes: 'oklch(var(--ci-filiere-ventes) / <alpha-value>)',
          'ventes-subtle': 'oklch(var(--ci-filiere-ventes-subtle) / <alpha-value>)',
          catalogue: 'oklch(var(--ci-filiere-catalogue) / <alpha-value>)',
          'catalogue-subtle': 'oklch(var(--ci-filiere-catalogue-subtle) / <alpha-value>)',
          achats: 'oklch(var(--ci-filiere-achats) / <alpha-value>)',
          'achats-subtle': 'oklch(var(--ci-filiere-achats-subtle) / <alpha-value>)',
          production: 'oklch(var(--ci-filiere-production) / <alpha-value>)',
          'production-subtle': 'oklch(var(--ci-filiere-production-subtle) / <alpha-value>)',
          finance: 'oklch(var(--ci-filiere-finance) / <alpha-value>)',
          'finance-subtle': 'oklch(var(--ci-filiere-finance-subtle) / <alpha-value>)',
        },
        halo: {
          DEFAULT: 'oklch(var(--ci-halo) / <alpha-value>)',
          chaud: 'oklch(var(--ci-halo-chaud) / <alpha-value>)',
        },
        muted: {
          DEFAULT: 'oklch(var(--ci-muted) / <alpha-value>)',
          foreground: 'oklch(var(--ci-muted-foreground) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'oklch(var(--ci-accent) / <alpha-value>)',
          foreground: 'oklch(var(--ci-accent-foreground) / <alpha-value>)',
        },
        card: {
          DEFAULT: 'oklch(var(--ci-card) / <alpha-value>)',
          foreground: 'oklch(var(--ci-card-foreground) / <alpha-value>)',
        },
        border: {
          DEFAULT: 'oklch(var(--ci-border) / <alpha-value>)',
          strong: 'oklch(var(--ci-border-strong) / <alpha-value>)',
        },
        panneau: {
          DEFAULT: 'oklch(var(--ci-panneau) / <alpha-value>)',
          foreground: 'oklch(var(--ci-panneau-foreground) / <alpha-value>)',
        },
        input: 'oklch(var(--ci-input) / <alpha-value>)',
        ring: 'oklch(var(--ci-ring) / <alpha-value>)',
        sidebar: {
          DEFAULT: 'oklch(var(--ci-sidebar) / <alpha-value>)',
          foreground: 'oklch(var(--ci-sidebar-foreground) / <alpha-value>)',
          accent: 'oklch(var(--ci-sidebar-accent) / <alpha-value>)',
          'accent-foreground': 'oklch(var(--ci-sidebar-accent-foreground) / <alpha-value>)',
          border: 'oklch(var(--ci-sidebar-border) / <alpha-value>)',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 3px)',
        sm: 'calc(var(--radius) - 6px)',
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        DEFAULT: 'var(--shadow)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
        // La seule ombre colorée. Réservée à ce sur quoi on veut cliquer.
        halo: 'var(--shadow-halo)',
      },
      fontFamily: {
        sans: ['Inter', 'Noto Sans Arabic', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        // Une échelle courte et tenue : sans elle, chaque page choisissait sa
        // taille et deux tableaux voisins ne s'accordaient jamais.
        '2xs': ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.01em' }],
        xs: ['0.75rem', { lineHeight: '1.125rem' }],
        sm: ['0.8125rem', { lineHeight: '1.25rem' }],
        base: ['0.875rem', { lineHeight: '1.375rem' }],
        lg: ['1rem', { lineHeight: '1.5rem' }],
        xl: ['1.125rem', { lineHeight: '1.625rem', letterSpacing: '-0.008em' }],
        '2xl': ['1.375rem', { lineHeight: '1.875rem', letterSpacing: '-0.012em' }],
        '3xl': ['1.75rem', { lineHeight: '2.125rem', letterSpacing: '-0.016em' }],
        '4xl': ['2.125rem', { lineHeight: '2.5rem', letterSpacing: '-0.020em' }],
      },
      // Une seule courbe pour toute l'application : un départ franc, une
      // arrivée qui se pose. Deux courbes sur un même écran se voient.
      transitionTimingFunction: {
        ci: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        entree: {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        surgir: {
          from: { opacity: '0', transform: 'scale(0.94)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 140ms ease-out',
        'slide-up': 'slide-up 180ms cubic-bezier(0.16, 1, 0.3, 1)',
        entree: 'entree 420ms cubic-bezier(0.16, 1, 0.3, 1) both',
        surgir: 'surgir 260ms cubic-bezier(0.16, 1, 0.3, 1) both',
      },
    },
  },
  plugins: [],
} satisfies Config;
