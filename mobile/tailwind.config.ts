import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      spacing: {
        // Repères terrain de la spec 17 §8.2
        tap: '48px',
        'tap-lg': '56px',
        item: '72px',
        fab: '64px',
      },
    },
  },
  plugins: [],
} satisfies Config;
