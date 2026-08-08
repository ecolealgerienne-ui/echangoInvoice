/**
 * Libellé d'un mode de règlement.
 *
 * Quatre pages portaient chacune leur propre table :
 *
 *     const MODE: Record<string, string> = { cash: 'Espèces', … };
 *
 * Figée au chargement du module, cette table ne pouvait pas suivre la langue
 * choisie — c'est l'une des raisons pour lesquelles des libellés restaient en
 * français une fois l'interface passée en arabe. La traduction doit se faire au
 * rendu, quand la langue courante est connue.
 *
 * Un mode inconnu retombe sur sa valeur brute : mieux vaut afficher `ccp` que
 * rien du tout si le serveur introduit un mode que le client ignore encore.
 */
const MODES_CONNUS = ['cash', 'bank_transfer', 'cheque', 'other'] as const;

export function libelleMode(t: (cle: string) => string, mode: string | null | undefined): string {
  if (!mode) return '—';
  return (MODES_CONNUS as readonly string[]).includes(mode)
    ? t(`invoices.methods.${mode}`)
    : mode;
}
