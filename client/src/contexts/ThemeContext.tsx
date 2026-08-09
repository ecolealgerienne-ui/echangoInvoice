import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import {
  Theme, appliquerTheme, enregistrerTheme, themeEffectif, themeStocke,
} from '@/lib/theme';

interface ValeurTheme {
  /** Le choix de l'utilisateur : clair, sombre, ou « suivre le système ». */
  theme: Theme;
  /** Ce qui est réellement affiché, une fois « système » résolu. */
  effectif: 'light' | 'dark';
  definirTheme: (t: Theme) => void;
}

const Contexte = createContext<ValeurTheme | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(themeStocke);
  const [effectif, setEffectif] = useState<'light' | 'dark'>(() => themeEffectif(themeStocke()));

  const definirTheme = useCallback((t: Theme) => {
    setTheme(t);
    enregistrerTheme(t);
    appliquerTheme(t);
    setEffectif(themeEffectif(t));
  }, []);

  useEffect(() => {
    appliquerTheme(theme);
    setEffectif(themeEffectif(theme));
  }, [theme]);

  // En mode « système », suivre le basculement pendant que l'application est
  // ouverte : sans cet écouteur, le thème ne changerait qu'au rechargement, et
  // l'écran resterait clair jusque tard dans la soirée.
  useEffect(() => {
    if (theme !== 'system') return undefined;
    const requete = window.matchMedia('(prefers-color-scheme: dark)');
    const suivre = () => { appliquerTheme('system'); setEffectif(themeEffectif('system')); };
    requete.addEventListener('change', suivre);
    return () => requete.removeEventListener('change', suivre);
  }, [theme]);

  const valeur = useMemo(() => ({ theme, effectif, definirTheme }), [theme, effectif, definirTheme]);
  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>;
}

export function useTheme(): ValeurTheme {
  const v = useContext(Contexte);
  if (!v) throw new Error('useTheme doit être utilisé dans un ThemeProvider');
  return v;
}
