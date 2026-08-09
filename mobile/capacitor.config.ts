import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'dz.echango.invoice',
  appName: 'Echango Invoice',
  webDir: 'dist',
  android: {
    // La webview sert l'app depuis https://localhost : sans cela, les appels
    // vers une API en http seraient bloqués comme contenu mixte.
    allowMixedContent: true,
  },
  server: {
    androidScheme: 'https',
  },
};

export default config;
