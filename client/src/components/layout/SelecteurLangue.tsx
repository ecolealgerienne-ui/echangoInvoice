import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { LANGUES, SENS, memoriserLangue, type Langue } from '@echango/shared';
import { Languages } from 'lucide-react';

/**
 * Bascule de langue, et avec elle le sens d'écriture.
 *
 * L'attribut `dir` est posé sur `<html>` et non sur un conteneur : il gouverne
 * aussi les éléments rendus hors de l'arbre React — menus natifs des `select`,
 * barres de défilement, sélection de texte. Le poser plus bas donnerait une
 * page à moitié inversée.
 *
 * `lang` change en même temps : il décide de la police de repli et de la
 * césure, et un lecteur d'écran s'en sert pour choisir sa voix.
 */
export function SelecteurLangue() {
  const { i18n } = useTranslation();
  const langue = (i18n.language === 'ar' ? 'ar' : 'fr') as Langue;

  useEffect(() => {
    const racine = document.documentElement;
    racine.setAttribute('lang', langue);
    racine.setAttribute('dir', SENS[langue]);
  }, [langue]);

  function changer(code: Langue) {
    memoriserLangue(code);
    void i18n.changeLanguage(code);
  }

  return (
    <div className="flex items-center gap-1">
      <Languages className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden />
      <select
        value={langue}
        onChange={(e) => changer(e.target.value as Langue)}
        aria-label="Langue"
        className="h-8 rounded-md border border-input bg-surface px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {LANGUES.map((l) => (
          <option key={l.code} value={l.code}>{l.nom}</option>
        ))}
      </select>
    </div>
  );
}
