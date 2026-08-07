import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@echango/shared': path.resolve(__dirname, '../shared/src'),
    },
  },
  server: {
    port: 5174,
    // Le paquet partagé vit hors de la racine du projet mobile.
    fs: { allow: ['..'] },
  },
});
