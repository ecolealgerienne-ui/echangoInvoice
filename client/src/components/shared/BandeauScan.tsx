import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { ScanLine, Loader2 } from 'lucide-react';

/**
 * Bandeau de saisie par scan, au-dessus des lignes d'un document.
 *
 * Il sert deux publics à la fois : la douchette, qui écrit dans le champ sans
 * qu'on ait à cliquer dedans, et celui qui n'en a pas et tape le code à la
 * main. Le champ reste donc visible même quand la douchette fonctionne — sans
 * lui, rien à l'écran ne dirait que le scan est possible.
 */
export function BandeauScan({ onScan, enCours, dernier }: {
  onScan: (code: string) => void;
  enCours?: boolean;
  dernier?: string | null;
}) {
  const { t } = useTranslation();
  const [saisie, setSaisie] = useState('');

  /**
   * ⚠️ **Ce bandeau n'est pas un `<form>`, et il ne peut pas en être un.**
   *
   * Il est rendu à l'intérieur du formulaire du document — facture, devis, BL,
   * commande d'achat. Un `<form>` dans un `<form>` est interdit en HTML : la
   * soumission n'appartient plus à personne, et React 19 le refuse à voix
   * haute (« <form> cannot be a descendant of form »).
   *
   * **Vérifié dans le DOM, pas déduit de l'avertissement** : sur `/invoices`
   * comme sur `/quotes`, `document.querySelectorAll('form')` rendait
   * `body > div > form > div > form`. L'imbrication était réelle — le portail
   * de Radix, qu'on aurait pu accuser, n'y était pour rien.
   *
   * Le comportement ne change pas : Entrée valide le code, le bouton aussi.
   * Seule l'enveloppe change.
   *
   * Trouvé le 2026-08-09 par la suite Playwright, sur **huit tests à la
   * fois** — c'est le défaut fondateur de `docs/CHANTIER_TESTS.md`.
   */
  function valider() {
    const code = saisie.trim();
    if (!code) return;
    onScan(code);
    setSaisie('');
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed border-border bg-muted/30 px-3 py-2">
      <ScanLine className="h-4 w-4 text-muted-foreground shrink-0" />
      <Input
        value={saisie}
        onChange={(e) => setSaisie(e.target.value)}
        onKeyDown={(e) => {
          // Entrée valide le scan et **ne remonte pas** au formulaire du
          // document — sans quoi scanner un article enregistrerait la facture.
          if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            valider();
          }
        }}
        placeholder={t('scan.placeholder')}
        className="h-8 w-56 font-mono"
      />
      {/* `type="button"` : dans un formulaire, un bouton sans type vaut
          `submit`. C'est lui qui empêche d'enregistrer le document. */}
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={valider}
        disabled={!saisie.trim() || enCours}
      >
        {enCours ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t('scan.ajouter')}
      </Button>
      <span className="text-xs text-muted-foreground">
        {dernier ? t('scan.dernier', { produit: dernier }) : t('scan.aide')}
      </span>
    </div>
  );
}
