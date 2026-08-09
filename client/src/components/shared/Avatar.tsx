import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { couleurSerie, creneauNom } from '@/lib/filieres';

/**
 * Pastille d'initiales.
 *
 * Une liste de clients est une colonne de noms qui commencent tous pareil —
 * « EURL … », « ETS … », « SARL … ». On la relit ligne à ligne parce que rien
 * n'y accroche l'œil : le nom est à la fois l'identité et le seul repère, et il
 * ne peut pas être les deux. La pastille prend le rôle de repère et rend au nom
 * celui d'identité.
 *
 * Deux règles la gouvernent :
 *
 * - **la couleur vient du nom**, par hachage, jamais du rang de la ligne. Trier
 *   la liste autrement doit laisser « EURL Hoggar » de la même teinte, sinon la
 *   pastille ne repère plus rien — elle décore. Le hachage tombe sur l'un des
 *   six créneaux de série, le seul alphabet de couleurs de l'application ;
 *
 * - **elle ne dit pas d'état.** Un client en retard de paiement n'a pas une
 *   pastille rouge : le rouge appartient aux statuts, et une identité qui
 *   change de couleur selon la situation n'est plus une identité.
 *
 * Le fond est la teinte à 16 %, l'encre la teinte pleine — validée à 3:1 contre
 * la carte dans les deux thèmes. Un aplat plein aurait exigé du texte blanc,
 * qui ne connaît qu'un thème.
 */

/**
 * Deux lettres au plus, prises sur les deux premiers mots signifiants.
 *
 * Les formes juridiques sont écartées : « EURL Hoggar Grossiste » donnerait
 * « EH », et toutes les EURL de la liste partageraient leur première lettre —
 * exactement le défaut qu'on cherche à corriger. Reste « HG ».
 */
const FORMES = new Set(['eurl', 'sarl', 'spa', 'snc', 'ets', 'sas', 'sa', 'ste', 'sté', 'epe', 'earl']);

export function initiales(nom: string): string {
  const mots = (nom ?? '')
    .trim()
    .split(/[\s.\-_/]+/)
    .filter(Boolean);
  const signifiants = mots.filter((m) => !FORMES.has(m.toLowerCase()));
  const retenus = (signifiants.length ? signifiants : mots).slice(0, 2);
  if (!retenus.length) return '?';
  return retenus.map((m) => m[0]).join('').toUpperCase();
}

interface ProprietesAvatar {
  nom: string;
  /** Rendue plus grande sur une fiche que dans une ligne de tableau. */
  taille?: 'sm' | 'md';
  className?: string;
}

export function Avatar({ nom, taille = 'sm', className }: ProprietesAvatar) {
  const { lettres, creneau } = useMemo(
    () => ({ lettres: initiales(nom), creneau: creneauNom(nom ?? '') }),
    [nom],
  );

  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold uppercase leading-none tracking-tight',
        taille === 'sm' ? 'h-7 w-7 text-2xs' : 'h-10 w-10 text-sm',
        className,
      )}
      style={{
        backgroundColor: couleurSerie(creneau, 0.16),
        color: couleurSerie(creneau),
        // Un anneau intérieur de la même teinte, comme sur les pastilles
        // d'icône du tableau de bord : un aplat à seize pour cent se dissout
        // dans la carte — clair ou sombre — et la pastille cesse d'être un
        // disque pour n'être plus que deux lettres colorées.
        boxShadow: `inset 0 0 0 1px ${couleurSerie(creneau, 0.35)}`,
      }}
    >
      {lettres}
    </span>
  );
}
