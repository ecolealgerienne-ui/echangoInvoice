/**
 * Couleur d'un statut, décidée une seule fois.
 *
 * Dix-huit tables `Record<string, string>` traînaient dans quatorze pages, et
 * elles **ne disaient pas la même chose**. Le même bon de livraison signé
 * s'affichait en vert sur sa fiche et en orange dans la liste ; un avoir émis
 * passait de bleu à vert selon l'écran ; une facture annulée était tantôt
 * grise, tantôt rouge. Rien ne cassait — chaque page était cohérente avec
 * elle-même — mais l'utilisateur apprenait un code couleur qui changeait sous
 * ses yeux d'un écran à l'autre.
 *
 * Le vocabulaire retenu, et pourquoi :
 *
 * - `muted` — pas encore réel : brouillon, planifié, sorti du stock ;
 * - `info` — en cours chez quelqu'un d'autre : envoyé, validé, en production ;
 * - `warning` — commencé mais incomplet, ou immobilisé : partiel, réservé ;
 * - `success` — abouti : payé, livré, reçu, accepté ;
 * - `destructive` — anormal, appelle une action : en retard, rejeté ;
 * - `secondary` — clos sans être une faute : annulé, expiré, ajusté.
 *
 * Le cas qui a demandé un arbitrage est **`cancelled`**. Les listes le
 * peignaient en rouge. Une facture annulée n'est pourtant pas un incident :
 * c'est un état terminal régulier, prévu par le décret 05-468, qui laisse une
 * trace au lieu d'effacer. Le rouge est réservé à ce qui réclame un geste —
 * une facture en retard, un devis rejeté. `cancelled` est donc neutre.
 */
export type VarianteStatut =
  | 'muted' | 'info' | 'warning' | 'success' | 'destructive' | 'secondary';

const STATUTS: Record<string, VarianteStatut> = {
  // Cycle de vie commun aux documents commerciaux
  draft: 'muted',
  sent: 'info',
  partial: 'warning',
  paid: 'success',
  overdue: 'destructive',
  cancelled: 'secondary',

  // Devis
  accepted: 'success',
  rejected: 'destructive',
  expired: 'secondary',
  converted: 'success',

  // Bons de livraison
  signed: 'success',
  delivered: 'success',

  // Avoirs : émis puis imputé — l'imputation est l'aboutissement, pas
  // l'émission.
  issued: 'info',
  applied: 'success',

  // Achats
  validated: 'info',
  received: 'success',
  invoiced: 'success',
  pending: 'muted',
  completed: 'success',

  // Lots de stock
  available: 'success',
  reserved: 'warning',
  sold: 'muted',
  adjusted: 'secondary',

  // Production
  planned: 'muted',
  in_progress: 'info',

  // Nomenclatures, abonnements, locataires
  active: 'success',
  inactive: 'warning',
  archived: 'muted',
  trial: 'info',
  suspended: 'destructive',
  paused: 'warning',
};

/** Un statut inconnu reste neutre : il ne doit ni alarmer ni rassurer à tort. */
export function varianteStatut(statut: string | null | undefined): VarianteStatut {
  return (statut && STATUTS[statut]) || 'muted';
}

/**
 * Rôles et types de mouvement ne sont pas des statuts : ils ne décrivent pas
 * l'avancement d'un document. Ils gardent leur table, mais au même endroit.
 */
const ROLES: Record<string, VarianteStatut> = {
  owner: 'success', manager: 'info', accountant: 'info',
  agent: 'muted', superadmin: 'destructive',
};
export function varianteRole(role: string | null | undefined): VarianteStatut {
  return (role && ROLES[role]) || 'muted';
}

const MOUVEMENTS: Record<string, VarianteStatut> = {
  mp_consumption: 'info', rejection: 'destructive', mp_loss: 'warning',
};
export function varianteMouvement(type: string | null | undefined): VarianteStatut {
  return (type && MOUVEMENTS[type]) || 'muted';
}
