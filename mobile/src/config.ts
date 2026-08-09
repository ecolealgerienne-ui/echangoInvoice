/**
 * URL absolue de l'API.
 *
 * Obligatoirement absolue : la webview Capacitor est servie depuis
 * https://localhost, une URL relative n'atteindrait jamais le serveur.
 *
 * En développement sur émulateur Android, 10.0.2.2 pointe vers la machine hôte.
 */
export const API_URL: string =
  import.meta.env.VITE_API_URL ?? 'http://10.0.2.2:3000/api/v1';
