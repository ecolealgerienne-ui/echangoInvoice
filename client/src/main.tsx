import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@/i18n';
import '@/globals.css';
import App from '@/App';
import { SENS, langueInitiale } from '@echango/shared';

// Posé avant le premier rendu : appliqué depuis un effet, la page s'afficherait
// une fraction de seconde à l'envers au rechargement en arabe.
const langue = langueInitiale();
document.documentElement.setAttribute('lang', langue);
document.documentElement.setAttribute('dir', SENS[langue]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
