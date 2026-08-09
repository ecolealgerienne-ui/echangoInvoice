import type { Config } from 'tailwindcss';

/**
 * Les jetons stockent les **composantes** OKLCH — `0.5987 0.2194 259` — et non
 * la couleur formée. Tailwind reforme `oklch(…)` autour et y injecte l'alpha,
 * ce qui laisse fonctionner les cent-neuf `bg-muted/50` déjà écrits dans
 * l'application. Une couleur déjà formée les aurait tous cassés en silence :
 * Tailwind n'aurait simplement pas produit la classe, et les fonds seraient
 * devenus opaques sans qu'aucune erreur ne le signale.
 *
 * Le survol de la primaire a malgré tout son propre jeton plutôt qu'une
 * opacité : `bg-primary/90` éclaircit sur fond clair et assombrit sur fond
 * sombre — le même geste donne deux effets opposés selon le thème.
 *
 * ── Ce que l'échelle impose ───────────────────────────────────────────────
 *
 * **Rayons** : 6 / 8 / 10 / 12, et rien au-delà. `rounded-md` (8) pour les
 * champs et les boutons, `rounded-lg` (10) pour les cartes, `rounded-sm` (6)
 * pour les pastilles et les boutons de pagination. Au-dessus de 12 px, une
 * carte cesse d'être une surface et devient une gélule.
 *
 * **Typographie** : une échelle courte et tenue, en pixels réels — 10 pour les
 * labels en majuscules, 11 pour le secondaire, 12 pour les titres de carte,
 * 13 pour le corps, 24 pour les titres de page et les valeurs d'indicateur.
 * Sans elle, chaque page choisissait sa taille et deux tableaux voisins ne
 * s'accordaient jamais.
 *
 * **Ombres** : deux, `md` pour la carte et `lg` pour le flottant. Le reste du
 * détachement vient du fond, de la bordure et de l'espacement — c'est ce qui
 * permet à une carte de se passer d'ombre sans disparaître.
 */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: 'oklch(var(--ci-background) / <alpha-value>)',
        surface: {
          DEFAULT: 'oklch(var(--ci-surface) / <alpha-value>)',
          hover: 'oklch(var(--ci-surface-hover) / <alpha-value>)',
          active: 'oklch(var(--ci-surface-active) / <alpha-value>)',
        },
        'surface-elevated': 'oklch(var(--ci-surface-elevated) / <alpha-value>)',
        /** Fond en creux : champs de saisie, en-têtes de tableau. */
        champ: 'oklch(var(--ci-champ) / <alpha-value>)',
        foreground: 'oklch(var(--ci-foreground) / <alpha-value>)',
        /** Troisième niveau d'encre : labels, axes, mentions de service. */
        tertiaire: 'oklch(var(--ci-tertiaire) / <alpha-value>)',
        desactive: 'oklch(var(--ci-desactive) / <alpha-value>)',
        primary: {
          DEFAULT: 'oklch(var(--ci-primary) / <alpha-value>)',
          foreground: 'oklch(var(--ci-primary-foreground) / <alpha-value>)',
          hover: 'oklch(var(--ci-primary-hover) / <alpha-value>)',
          active: 'oklch(var(--ci-primary-active) / <alpha-value>)',
          subtle: 'oklch(var(--ci-primary-subtle) / <alpha-value>)',
        },
        secondary: {
          DEFAULT: 'oklch(var(--ci-secondary) / <alpha-value>)',
          foreground: 'oklch(var(--ci-secondary-foreground) / <alpha-value>)',
        },
        // Rôles sémantiques : chacun a sa couleur pleine, son fond ténu, la
        // couleur de texte sur ce fond, et la bordure de ce fond. Les quatre
        // sont nécessaires — une carte d'alerte est un aplat `-subtle` cerné
        // d'un `-border`, et le texte posé dessus doit rester lisible dans les
        // deux thèmes, ce qu'une seule valeur ne peut pas garantir.
        success: {
          DEFAULT: 'oklch(var(--ci-success) / <alpha-value>)',
          foreground: 'oklch(var(--ci-success-foreground) / <alpha-value>)',
          subtle: 'oklch(var(--ci-success-subtle) / <alpha-value>)',
          text: 'oklch(var(--ci-success-text) / <alpha-value>)',
          border: 'oklch(var(--ci-success-border) / <alpha-value>)',
        },
        warning: {
          DEFAULT: 'oklch(var(--ci-warning) / <alpha-value>)',
          foreground: 'oklch(var(--ci-warning-foreground) / <alpha-value>)',
          subtle: 'oklch(var(--ci-warning-subtle) / <alpha-value>)',
          text: 'oklch(var(--ci-warning-text) / <alpha-value>)',
          border: 'oklch(var(--ci-warning-border) / <alpha-value>)',
        },
        destructive: {
          DEFAULT: 'oklch(var(--ci-destructive) / <alpha-value>)',
          foreground: 'oklch(var(--ci-destructive-foreground) / <alpha-value>)',
          subtle: 'oklch(var(--ci-destructive-subtle) / <alpha-value>)',
          text: 'oklch(var(--ci-destructive-text) / <alpha-value>)',
          border: 'oklch(var(--ci-destructive-border) / <alpha-value>)',
        },
        info: {
          DEFAULT: 'oklch(var(--ci-info) / <alpha-value>)',
          foreground: 'oklch(var(--ci-info-foreground) / <alpha-value>)',
          subtle: 'oklch(var(--ci-info-subtle) / <alpha-value>)',
          text: 'oklch(var(--ci-info-text) / <alpha-value>)',
          border: 'oklch(var(--ci-info-border) / <alpha-value>)',
        },
        // Le violet du résultat net. Il a son créneau propre : ce n'est ni un
        // rôle sémantique — un résultat n'est pas « bon » — ni une série, dont
        // l'ordre est figé par la sécurité daltonienne.
        violet: {
          DEFAULT: 'oklch(var(--ci-violet) / <alpha-value>)',
          subtle: 'oklch(var(--ci-violet-subtle) / <alpha-value>)',
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
        // Habillage des graphiques : la grille se voit à peine, l'axe se lit,
        // la piste porte les barres de progression, le rang porte son numéro.
        grille: 'oklch(var(--ci-grille) / <alpha-value>)',
        axe: 'oklch(var(--ci-axe) / <alpha-value>)',
        piste: 'oklch(var(--ci-piste) / <alpha-value>)',
        rang: 'oklch(var(--ci-rang) / <alpha-value>)',
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
          subtle: 'oklch(var(--ci-border-subtle) / <alpha-value>)',
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
          actif: 'oklch(var(--ci-sidebar-actif) / <alpha-value>)',
          'actif-foreground': 'oklch(var(--ci-sidebar-actif-foreground) / <alpha-value>)',
        },
      },
      borderRadius: {
        sm: '6px',
        md: '8px',
        lg: 'var(--radius)',
        xl: '12px',
      },
      boxShadow: {
        // `sm` reste pour les micro-éléments (pastille de thème active) ; la
        // carte prend `md`, le flottant prend `lg`. Il n'y a rien d'autre.
        sm: 'var(--shadow-sm)',
        DEFAULT: 'var(--shadow)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
        halo: 'var(--shadow-halo)',
      },
      fontFamily: {
        sans: ['Inter', 'Noto Sans Arabic', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        // Six tailles réellement utilisées, en pixels : 10 · 11 · 12 · 13 · 14
        // · 16 · 18 · 20 · 24. L'interligne suit la taille, il n'est pas
        // recalculé au cas par cas.
        '3xs': ['0.625rem', { lineHeight: '0.875rem', letterSpacing: '0.04em' }],
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
        xs: ['0.75rem', { lineHeight: '1.0625rem' }],
        sm: ['0.8125rem', { lineHeight: '1.25rem' }],
        base: ['0.875rem', { lineHeight: '1.3125rem' }],
        lg: ['1rem', { lineHeight: '1.5rem' }],
        xl: ['1.125rem', { lineHeight: '1.625rem', letterSpacing: '-0.010em' }],
        // Le titre de page et la valeur d'indicateur partagent la même taille :
        // 24 px, graisse 650, interligne serré, chasse resserrée de deux
        // centièmes — c'est ce resserrement qui empêche « 20,4 M DA » de
        // paraître lâche à côté d'un corps de texte dense.
        '2xl': ['1.5rem', { lineHeight: '1.1', letterSpacing: '-0.02em' }],
        '3xl': ['1.75rem', { lineHeight: '2.125rem', letterSpacing: '-0.016em' }],
        '4xl': ['2.125rem', { lineHeight: '2.5rem', letterSpacing: '-0.020em' }],
      },
      fontWeight: {
        // 650 n'est pas dans l'échelle Tailwind, et c'est pourtant la graisse
        // des titres et des valeurs : entre le semi-gras qui manque d'assise
        // et le gras qui hurle. La fonte est variable, elle la rend.
        titre: '650',
      },
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
