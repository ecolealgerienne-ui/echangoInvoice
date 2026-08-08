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

  function valider(e: React.FormEvent) {
    e.preventDefault();
    const code = saisie.trim();
    if (!code) return;
    onScan(code);
    setSaisie('');
  }

  return (
    <form
      onSubmit={valider}
      className="flex flex-wrap items-center gap-2 rounded-md border border-dashed border-border bg-muted/30 px-3 py-2"
    >
      <ScanLine className="h-4 w-4 text-muted-foreground shrink-0" />
      <Input
        value={saisie}
        onChange={(e) => setSaisie(e.target.value)}
        placeholder={t('scan.placeholder')}
        className="h-8 w-56 font-mono"
      />
      <Button type="submit" size="sm" variant="outline" disabled={!saisie.trim() || enCours}>
        {enCours ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t('scan.ajouter')}
      </Button>
      <span className="text-xs text-muted-foreground">
        {dernier ? t('scan.dernier', { produit: dernier }) : t('scan.aide')}
      </span>
    </form>
  );
}
