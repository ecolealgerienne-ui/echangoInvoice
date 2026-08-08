/**
 * Les huit documents numérotés, et le réglage qui gouverne chacun.
 *
 * Ils étaient jusqu'ici codés en dur dans huit méthodes privées — dont trois
 * copies de la numérotation des factures, l'une dans SalesInvoicesService et
 * deux recopiées à l'identique là où l'on facture un BL et où l'on convertit
 * un devis. Rendre le format configurable en huit endroits, c'était accepter
 * qu'il en reste au moins un derrière.
 */
export type TypeDocument =
  | 'invoice'
  | 'delivery_note'
  | 'quote'
  | 'purchase_order'
  | 'reception'
  | 'vendor_bill'
  | 'credit_note'
  | 'production_order';

export interface DefinitionDocument {
  /** Colonne de `settings` qui porte le format. */
  reglage: string;
  /** Format appliqué quand le réglage est vide — l'historique du produit. */
  defaut: string;
}

export const DOCUMENTS: Record<TypeDocument, DefinitionDocument> = {
  invoice: { reglage: 'invoiceNumberFormat', defaut: 'FAC-YY-###' },
  delivery_note: { reglage: 'blNumberFormat', defaut: 'BL-YY-###' },
  quote: { reglage: 'quoteNumberFormat', defaut: 'DEV-YY-###' },
  purchase_order: { reglage: 'poNumberFormat', defaut: 'PO-YY-###' },
  reception: { reglage: 'receptionNumberFormat', defaut: 'BL-REC-YY-###' },
  vendor_bill: { reglage: 'vendorBillNumberFormat', defaut: 'FAC-ACH-YY-###' },
  credit_note: { reglage: 'creditNoteNumberFormat', defaut: 'AV-YY-###' },
  production_order: { reglage: 'productionOrderNumberFormat', defaut: 'MO-YY-###' },
};

/**
 * Applique un format à une séquence.
 *
 * Jetons reconnus : `YYYY` et `YY` pour l'année, `MM` pour le mois, et une
 * suite de `#` pour la séquence, dont la longueur donne le remplissage. Le
 * reste du format est recopié tel quel.
 *
 * `YYYY` est remplacé avant `YY`, sinon « YYYY » deviendrait « 2626 » : les
 * deux premiers Y seraient consommés par la règle des deux chiffres, puis les
 * deux suivants aussi.
 */
export function appliquerFormat(format: string, sequence: number, date: Date): string {
  const annee = date.getFullYear();
  const mois = String(date.getMonth() + 1).padStart(2, '0');

  return format
    .replace(/YYYY/g, String(annee))
    .replace(/YY/g, String(annee).slice(-2))
    .replace(/MM/g, mois)
    .replace(/#+/g, (diese) => String(sequence).padStart(diese.length, '0'));
}
