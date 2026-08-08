import type { AxiosResponse } from 'axios';

/**
 * Déclenche l'enregistrement d'un blob sous un nom donné.
 *
 * La séquence lien-invisible / click / revoke était recopiée à l'identique
 * dans les trois écrans qui téléchargent un PDF. Les trois copies étaient
 * correctes, mais chaque nouvel écran qui télécharge quelque chose en fait une
 * quatrième, et c'est là que l'oubli du `revokeObjectURL` finit par arriver.
 */
export function enregistrerBlob(blob: Blob, nomFichier: string) {
  const url = URL.createObjectURL(blob);
  const lien = document.createElement('a');
  lien.href = url;
  lien.download = nomFichier;
  lien.click();
  URL.revokeObjectURL(url);
}

/**
 * Nom de fichier annoncé par le serveur, ou le repli fourni.
 *
 * Le serveur est seul à savoir ce que contient le fichier — la période, le
 * jeu de données, la date d'extraction. Le recalculer côté client, c'est
 * accepter qu'il diverge au premier changement.
 */
export function nomDepuisReponse(reponse: AxiosResponse, repli: string): string {
  const disposition = reponse.headers['content-disposition'] as string | undefined;
  const trouve = disposition?.match(/filename="?([^";]+)"?/);
  return trouve?.[1] ?? repli;
}

/**
 * Rétablit un corps d'erreur lisible sur une requête `responseType: 'blob'`.
 *
 * Axios rend le corps sous forme de Blob quel que soit le statut : sur un 400,
 * `error.response.data` est un Blob, `data.message` vaut `undefined`, et
 * `resolveApiError` retombe sur « une erreur est survenue ». L'utilisateur
 * perdait le seul message qui lui aurait dit quoi corriger — que le filtre de
 * période ne s'applique pas à ce jeu, par exemple.
 */
export async function lisibiliserErreurBlob(erreur: unknown): Promise<unknown> {
  const reponse = (erreur as { response?: { data?: unknown } })?.response;
  if (!(reponse?.data instanceof Blob)) return erreur;
  try {
    reponse.data = JSON.parse(await reponse.data.text());
  } catch {
    // Corps illisible (coupure réseau, HTML d'un proxy) : on laisse l'erreur
    // en l'état plutôt que d'en fabriquer une fausse.
  }
  return erreur;
}
