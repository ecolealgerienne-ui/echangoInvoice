import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { searchApi } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Resultat {
  type: string;
  id: string;
  titre: string;
  sousTitre: string | null;
  lien: string;
  meta: string | null;
}

/** Types dont le `meta` est un montant : les autres l'affichent tel quel. */
const META_MONETAIRE = new Set([
  'invoice', 'quote', 'deliveryNote', 'purchaseOrder', 'vendorBill', 'creditNote',
]);

/** Délai avant d'interroger le serveur — une frappe rapide ne doit pas partir. */
const ATTENTE_MS = 250;

export function RechercheGlobale() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [ouvert, setOuvert] = useState(false);
  const [saisie, setSaisie] = useState('');
  const [terme, setTerme] = useState('');
  const [indice, setIndice] = useState(0);
  const champ = useRef<HTMLInputElement>(null);

  // Ctrl+K / Cmd+K, et Échap pour refermer.
  useEffect(() => {
    function auClavier(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOuvert((o) => !o);
      } else if (e.key === 'Escape') {
        setOuvert(false);
      }
    }
    window.addEventListener('keydown', auClavier);
    return () => window.removeEventListener('keydown', auClavier);
  }, []);

  useEffect(() => {
    if (ouvert) champ.current?.focus();
    else { setSaisie(''); setTerme(''); setIndice(0); }
  }, [ouvert]);

  // Anti-rebond : sans lui, une recherche part à chaque caractère et les
  // réponses reviennent dans le désordre.
  useEffect(() => {
    const minuteur = setTimeout(() => setTerme(saisie.trim()), ATTENTE_MS);
    return () => clearTimeout(minuteur);
  }, [saisie]);

  const { data, isFetching } = useQuery({
    queryKey: ['recherche', terme],
    queryFn: () => searchApi.rechercher(terme),
    enabled: ouvert && terme.length >= 2,
  });

  const resultats: Resultat[] = useMemo(() => data?.data ?? [], [data]);

  useEffect(() => { setIndice(0); }, [resultats.length]);

  function ouvrir(r: Resultat) {
    setOuvert(false);
    navigate(r.lien);
  }

  function auClavierListe(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIndice((i) => Math.min(i + 1, resultats.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIndice((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && resultats[indice]) {
      e.preventDefault();
      ouvrir(resultats[indice]);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOuvert(true)}
        className="flex items-center gap-2 rounded-md border border-input bg-surface px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Search className="h-4 w-4" />
        <span className="hidden sm:inline">{t('recherche.placeholder')}</span>
        <kbd className="hidden sm:inline rounded border border-border px-1.5 text-[10px]">Ctrl K</kbd>
      </button>

      {ouvert && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-foreground/25 backdrop-blur-[2px] p-4 pt-[10vh]"
          onClick={() => setOuvert(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t('recherche.titre')}
            className="w-full max-w-2xl rounded-lg border border-border bg-surface-elevated shadow-lg overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b border-border px-4">
              <Search className="h-4 w-4 text-muted-foreground shrink-0" />
              <input
                ref={champ}
                value={saisie}
                onChange={(e) => setSaisie(e.target.value)}
                onKeyDown={auClavierListe}
                placeholder={t('recherche.invite')}
                className="flex-1 bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
              />
              <button type="button" onClick={() => setOuvert(false)} aria-label={t('common.close')}>
                <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto">
              {terme.length < 2 && (
                <p className="px-4 py-6 text-sm text-muted-foreground">{t('recherche.aideSaisie')}</p>
              )}
              {terme.length >= 2 && isFetching && (
                <p className="px-4 py-6 text-sm text-muted-foreground">{t('common.loading')}</p>
              )}
              {terme.length >= 2 && !isFetching && resultats.length === 0 && (
                <p className="px-4 py-6 text-sm text-muted-foreground">{t('recherche.aucunResultat')}</p>
              )}

              <ul role="listbox">
                {resultats.map((r, i) => (
                  <li key={`${r.type}-${r.id}`} role="option" aria-selected={i === indice}>
                    <button
                      type="button"
                      onMouseEnter={() => setIndice(i)}
                      onClick={() => ouvrir(r)}
                      className={cn(
                        'flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors',
                        i === indice ? 'bg-muted' : 'hover:bg-muted/60',
                      )}
                    >
                      <span className="shrink-0 rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium uppercase text-secondary-foreground">
                        {t(`recherche.types.${r.type}`)}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block truncate font-medium text-foreground">{r.titre}</span>
                        {r.sousTitre && (
                          <span className="block truncate text-xs text-muted-foreground">{r.sousTitre}</span>
                        )}
                      </span>
                      {r.meta && (
                        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                          {META_MONETAIRE.has(r.type) ? formatCurrency(r.meta) : r.meta}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
