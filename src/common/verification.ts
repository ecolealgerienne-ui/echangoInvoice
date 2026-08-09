import { createHmac, timingSafeEqual } from 'crypto';
import { requireEnv } from '../config/env.config';

/**
 * Jeton de vérification d'un document.
 *
 * Le QR d'une facture porte une URL publique : n'importe qui peut la lire. Elle
 * doit donc être **infalsifiable sans être secrète** — un identifiant de
 * document suffirait à énumérer les factures d'un locataire, une signature
 * l'interdit.
 *
 * La clé dérive de `JWT_SECRET` mais n'est pas `JWT_SECRET` : un jeton de
 * vérification et un jeton d'authentification n'ont ni la même durée de vie ni
 * la même surface. Les mélanger ferait qu'une fuite de l'un compromette
 * l'autre.
 */
const LONGUEUR_SIGNATURE = 16;

function cle(): Buffer {
  return createHmac('sha256', requireEnv('JWT_SECRET')).update('verification-document-v1').digest();
}

export type TypeDocumentVerifiable = 'facture' | 'devis' | 'bl' | 'avoir';

/** Signature courte, suffisante ici : elle protège d'une falsification, pas d'un secret. */
export function signerDocument(type: TypeDocumentVerifiable, documentId: string): string {
  return createHmac('sha256', cle())
    .update(`${type}:${documentId}`)
    .digest('base64url')
    .slice(0, LONGUEUR_SIGNATURE);
}

/**
 * Comparaison à temps constant : une comparaison naïve laisse deviner la
 * signature octet par octet en mesurant le temps de réponse.
 */
export function verifierSignature(
  type: TypeDocumentVerifiable, documentId: string, signature: string,
): boolean {
  if (typeof signature !== 'string' || signature.length !== LONGUEUR_SIGNATURE) return false;
  const attendue = Buffer.from(signerDocument(type, documentId));
  const fournie = Buffer.from(signature);
  if (attendue.length !== fournie.length) return false;
  return timingSafeEqual(attendue, fournie);
}

/**
 * URL portée par le QR. `APP_PUBLIC_URL` est distincte de `ALLOWED_ORIGINS` :
 * c'est l'adresse par laquelle un tiers — le client qui scanne — atteint
 * l'application, pas celle du poste de travail.
 */
export function urlVerification(type: TypeDocumentVerifiable, documentId: string): string {
  const base = (process.env.APP_PUBLIC_URL ?? 'http://localhost:5173').replace(/\/+$/, '');
  return `${base}/v/${type}/${documentId}/${signerDocument(type, documentId)}`;
}
