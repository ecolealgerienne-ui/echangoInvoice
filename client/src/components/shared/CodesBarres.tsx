import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { productsApi, resolveApiError } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { useToast } from '@/components/ui/Toast';
import { Plus, Trash2, Star } from 'lucide-react';

const TYPES = ['EAN13', 'EAN8', 'UPCA', 'CODE128', 'INTERNE'] as const;

interface Code {
  id: string;
  barcode: string;
  type: string;
  packQuantity: string | number;
  isPrimary: boolean;
  label: string | null;
}

/**
 * Gestion des codes-barres d'un article.
 *
 * Le champ de saisie accepte aussi bien la frappe qu'une douchette : celle-ci
 * se comporte comme un clavier et termine par Entrée, donc un simple formulaire
 * suffit — inutile d'écouter le clavier globalement ici, contrairement aux
 * écrans de saisie de lignes.
 */
export function CodesBarres({ productId }: { productId: string }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [code, setCode] = useState('');
  const [type, setType] = useState('');
  const [pack, setPack] = useState('1');
  const [label, setLabel] = useState('');

  const { data } = useQuery({
    queryKey: ['product-barcodes', productId],
    queryFn: () => productsApi.listerCodesBarres(productId),
  });
  const codes: Code[] = data?.data ?? [];

  const ajout = useMutation({
    mutationFn: () => productsApi.ajouterCodeBarres(productId, {
      barcode: code,
      type: type || undefined,
      packQuantity: Number(pack) || 1,
      label: label || undefined,
      isPrimary: codes.length === 0,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['product-barcodes', productId] });
      setCode(''); setType(''); setPack('1'); setLabel('');
    },
    // Le serveur nomme l'article qui détient déjà le code : c'est la question
    // que pose l'utilisateur, elle mérite d'arriver jusqu'à lui.
    onError: (err: any) => {
      const detenteur = err?.response?.data?.details?.product;
      const base = resolveApiError(err, t);
      toast(detenteur ? `${base} (${detenteur})` : base, 'error');
    },
  });

  const suppression = useMutation({
    mutationFn: (id: string) => productsApi.retirerCodeBarres(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['product-barcodes', productId] }),
    onError: (err) => toast(resolveApiError(err, t), 'error'),
  });

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-foreground">{t('products.barcodes')}</h2>
        <p className="text-xs text-muted-foreground">{t('products.barcodeHint')}</p>
      </div>

      {codes.length === 0 && (
        <p className="text-sm text-muted-foreground">{t('products.barcodeNone')}</p>
      )}

      {codes.length > 0 && (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">{t('products.barcode')}</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">{t('products.barcodeType')}</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">{t('products.barcodeLabel')}</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">{t('products.barcodePack')}</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {codes.map((c) => (
                <tr key={c.id} className="hover:bg-muted/30">
                  <td className="px-3 py-2 font-mono text-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      {c.isPrimary && <Star className="h-3.5 w-3.5 fill-current text-amber-500" aria-label={t('products.barcodePrimary')} />}
                      {c.barcode}
                    </span>
                  </td>
                  <td className="px-3 py-2"><Badge variant="secondary">{c.type}</Badge></td>
                  <td className="px-3 py-2 text-muted-foreground">{c.label || '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                    {Number(c.packQuantity)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button variant="ghost" size="icon" onClick={() => suppression.mutate(c.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => { e.preventDefault(); if (code.trim()) ajout.mutate(); }}
      >
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">{t('products.barcode')}</label>
          {/* autoFocus volontairement absent : la fiche s'ouvre pour être lue,
              pas pour saisir. */}
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="3017620422003"
            className="w-52 font-mono"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">{t('products.barcodeType')}</label>
          <Select value={type} onChange={(e) => setType(e.target.value)} className="w-32">
            <option value="">{t('common.auto')}</option>
            {TYPES.map((x) => <option key={x} value={x}>{x}</option>)}
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">{t('products.barcodePack')}</label>
          <Input type="number" min="0.01" step="0.01" value={pack}
            onChange={(e) => setPack(e.target.value)} className="w-24" />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">{t('products.barcodeLabel')}</label>
          <Input value={label} onChange={(e) => setLabel(e.target.value)}
            placeholder="Carton de 12" className="w-40" />
        </div>
        <Button type="submit" size="sm" disabled={!code.trim() || ajout.isPending}>
          <Plus className="h-4 w-4" /> {t('products.barcodeAdd')}
        </Button>
      </form>
    </div>
  );
}
