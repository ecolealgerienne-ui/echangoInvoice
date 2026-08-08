import type { Config } from 'tailwindcss';

/**
 * Les jetons stockent les **composantes** OKLCH — `0.45 0.098 254` — et non la
 * couleur formée. Tailwind reforme `oklch(…)` autour et y injecte l'alpha, ce
 * qui laisse fonctionner les cent-neuf `bg-muted/50` déjà écrits dans
 * l'application. Une couleur déjà formée les aurait tous cassés en silence :
 * Tailwind n'aurait simplement pas produit la classe, et les fonds seraient
 * devenus opaques sans qu'aucune erreur ne le signale.
 *
 * Le survol de la primaire a malgré tout son propre jeton plutôt qu'une
 * opacité : `bg-primary/90` éclaircit sur fond clair et assombrit sur fond
 * sombre — le même geste donne deux effets opposés selon le thème.
 */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: 'oklch(var(--background) / <alpha-value>)',
        surface: 'oklch(var(--surface) / <alpha-value>)',
        'surface-elevated': 'oklch(var(--surface-elevated) / <alpha-value>)',
        foreground: 'oklch(var(--foreground) / <alpha-value>)',
        primary: {
          DEFAULT: 'oklch(var(--primary) / <alpha-value>)',
          foreground: 'oklch(var(--primary-foreground) / <alpha-value>)',
          hover: 'oklch(var(--primary-hover) / <alpha-value>)',
          subtle: 'oklch(var(--primary-subtle) / <alpha-value>)',
        },
        secondary: {
          DEFAULT: 'oklch(var(--secondary) / <alpha-value>)',
          foreground: 'oklch(var(--secondary-foreground) / <alpha-value>)',
        },
        // Rôles sémantiques : chacun a sa couleur pleine, son fond ténu et sa
        // couleur de texte sur ce fond. Les trois sont nécessaires — un texte
        // « success » posé sur un fond « success-subtle » doit rester lisible
        // dans les deux thèmes, ce qu'une seule valeur ne peut pas garantir.
        success: {
          DEFAULT: 'oklch(var(--success) / <alpha-value>)',
          foreground: 'oklch(var(--success-foreground) / <alpha-value>)',
          subtle: 'oklch(var(--success-subtle) / <alpha-value>)',
          text: 'oklch(var(--success-text) / <alpha-value>)',
        },
        warning: {
          DEFAULT: 'oklch(var(--warning) / <alpha-value>)',
          foreground: 'oklch(var(--warning-foreground) / <alpha-value>)',
          subtle: 'oklch(var(--warning-subtle) / <alpha-value>)',
          text: 'oklch(var(--warning-text) / <alpha-value>)',
        },
        destructive: {
          DEFAULT: 'oklch(var(--destructive) / <alpha-value>)',
          foreground: 'oklch(var(--destructive-foreground) / <alpha-value>)',
          subtle: 'oklch(var(--destructive-subtle) / <alpha-value>)',
          text: 'oklch(var(--destructive-text) / <alpha-value>)',
        },
        info: {
          DEFAULT: 'oklch(var(--info) / <alpha-value>)',
          foreground: 'oklch(var(--info-foreground) / <alpha-value>)',
          subtle: 'oklch(var(--info-subtle) / <alpha-value>)',
          text: 'oklch(var(--info-text) / <alpha-value>)',
        },
        muted: {
          DEFAULT: 'oklch(var(--muted) / <alpha-value>)',
          foreground: 'oklch(var(--muted-foreground) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'oklch(var(--accent) / <alpha-value>)',
          foreground: 'oklch(var(--accent-foreground) / <alpha-value>)',
        },
        card: {
          DEFAULT: 'oklch(var(--card) / <alpha-value>)',
          foreground: 'oklch(var(--card-foreground) / <alpha-value>)',
        },
        border: {
          DEFAULT: 'oklch(var(--border) / <alpha-value>)',
          strong: 'oklch(var(--border-strong) / <alpha-value>)',
        },
        panneau: {
          DEFAULT: 'oklch(var(--panneau) / <alpha-value>)',
          foreground: 'oklch(var(--panneau-foreground) / <alpha-value>)',
        },
        input: 'oklch(var(--input) / <alpha-value>)',
        ring: 'oklch(var(--ring) / <alpha-value>)',
        sidebar: {
          DEFAULT: 'oklch(var(--sidebar) / <alpha-value>)',
          foreground: 'oklch(var(--sidebar-foreground) / <alpha-value>)',
          accent: 'oklch(var(--sidebar-accent) / <alpha-value>)',
          'accent-foreground': 'oklch(var(--sidebar-accent-foreground) / <alpha-value>)',
          border: 'oklch(var(--sidebar-border) / <alpha-value>)',
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
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 140ms ease-out',
        'slide-up': 'slide-up 180ms cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [],
} satisfies Config;
