import { useQuery } from '@tanstack/react-query';
import { priceListsApi } from '@/lib/api';

/**
 * Prix applicables au client sélectionné.
 *
 * Un seul appel par client, et non un par ligne : les écrans de saisie ajoutent
 * des lignes en rafale. Les articles absents de la grille retombent sur
 * `defaultSalesPrice`.
 *
 * Hook partagé plutôt que recopié dans devis, BL et factures : c'est ce genre
 * de duplication qui laisse trois écrans diverger sur la même règle (R029).
 */
export function useCustomerPrices(customerId: string | undefined | null) {
  const { data } = useQuery({
    queryKey: ['customer-prices', customerId],
    queryFn: () => priceListsApi.forCustomer(customerId!),
    enabled: !!customerId,
    // Une grille ne change pas pendant la saisie d'un document.
    staleTime: 5 * 60 * 1000,
  });

  const prices: Record<string, number> = data?.data?.prices ?? {};

  return {
    priceListName: (data?.data?.priceListName as string | null) ?? null,
    /** Prix à proposer pour un article : celui de la grille, sinon le tarif de base. */
    priceFor: (product: { id: string; defaultSalesPrice?: number | string | null }) => {
      const grille = prices[product.id];
      if (grille != null) return grille;
      return product.defaultSalesPrice != null ? Number(product.defaultSalesPrice) : undefined;
    },
    /** Vrai si l'article est tarifé par la grille — pour le signaler à l'écran. */
    isFromList: (productId: string) => prices[productId] != null,
  };
}
