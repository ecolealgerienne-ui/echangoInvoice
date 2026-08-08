import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { productsApi } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import { useDouchette } from './useDouchette';

export interface ProduitScanne {
  id: string;
  name: string;
  unit: string;
  defaultSalesPrice: number | string | null;
  lastCostPerUnit: number | string | null;
}

/**
 * Saisie de lignes de document par scan.
 *
 * Le comportement qui fait adopter la fonction n'est pas « un scan ajoute une
 * ligne » mais **« un re-scan incrémente la ligne existante »** : sur un
 * comptoir, on passe trois fois le même article plutôt que de saisir 3.
 *
 * `construireLigne` reste à la charge de l'appelant : une ligne de facture
 * porte un taux de TVA, une ligne de bon de livraison non. Imposer une forme
 * commune obligerait chaque écran à s'y plier.
 */
export function useScanLignes<L extends Record<string, any>>({
  lignes, ajouter, remplacer, majQuantite, construireLigne,
  actif = true, cleProduit = 'finishedProductId',
}: {
  /** Lignes courantes du formulaire, dans l'ordre d'affichage. */
  lignes: L[];
  ajouter: (ligne: L) => void;
  /** Remplit une ligne encore vide plutôt que d'en créer une à côté. */
  remplacer: (indice: number, ligne: L) => void;
  majQuantite: (indice: number, quantite: number) => void;
  construireLigne: (produit: ProduitScanne, quantite: number) => L;
  actif?: boolean;
  /**
   * Nom du champ portant l'article. Les lignes d'achat l'appellent encore
   * `rawMaterialId` — un héritage de la table fusionnée dans le catalogue.
   */
  cleProduit?: string;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [dernier, setDernier] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const traiter = useCallback(async (code: string) => {
    setEnCours(true);
    try {
      const reponse = await productsApi.parCodeBarres(code);
      const produit: ProduitScanne = reponse.data.product;
      // Le code du carton vaut douze unités : c'est le serveur qui le sait.
      const quantite = Number(reponse.data.packQuantity) || 1;

      const dejaLa = lignes.findIndex((l) => l[cleProduit] === produit.id);
      if (dejaLa >= 0) {
        majQuantite(dejaLa, Number(lignes[dejaLa].quantity ?? 0) + quantite);
      } else {
        // Un formulaire neuf porte une ligne vide : le premier scan doit la
        // remplir, pas en créer une seconde au-dessous.
        const vide = lignes.findIndex((l) => !l[cleProduit]);
        const ligne = construireLigne(produit, quantite);
        if (vide >= 0) remplacer(vide, ligne);
        else ajouter(ligne);
      }

      setDernier(produit.name);
      toast(`${produit.name} × ${quantite}`, 'success');
    } catch (err: any) {
      if (err?.response?.status === 404) toast(t('scan.inconnu', { code }), 'error');
      else toast(t('errors.generic'), 'error');
    } finally {
      setEnCours(false);
    }
  }, [lignes, ajouter, remplacer, majQuantite, construireLigne, cleProduit, t, toast]);

  useDouchette(traiter, { actif });

  return { traiter, dernier, enCours };
}
