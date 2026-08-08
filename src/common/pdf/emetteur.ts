import { Logger } from '@nestjs/common';
import * as bwipjs from 'bwip-js';
import { Emetteur } from './document-template';

/**
 * Briques communes a tous les PDF, ventes comme achats.
 *
 * Elles vivaient en prive dans `InvoicePdfService`, ce qui a longtemps suffi :
 * seuls des documents de vente sortaient en PDF. Des que les achats en ont eu
 * besoin, les garder privees imposait de les recopier — et une entete societe
 * recopiee finit toujours par diverger de l'autre.
 */

/** Colonnes de l'emetteur, identiques pour tous les documents. */
export const CHAMPS_EMETTEUR = `
  s."companyName" AS company_name, s.address AS company_address,
  s.phone AS company_phone, s.email AS company_email,
  s.nif AS company_nif, s.rc AS company_rc, s.ai AS company_ai, s.nis AS company_nis,
  s.rib AS company_rib, s.logo AS company_logo,
  s."footerText" AS company_footer, s."pdfAccentColor" AS company_accent,
  s."stampImage" AS company_stamp`;

/**
 * L'emetteur venait de `settings`, sauf ses identifiants legaux : la requete
 * selectionnait `NULL AS company_nif`. Chaque facture sortait donc avec
 * « NIF : | RC : » vides — inexploitable en Algerie.
 */
export function lireEmetteur(row: Record<string, unknown>): Emetteur {
  return {
    stampImage: row.company_stamp as string | null,
    companyName: (row.company_name as string) ?? null,
    address: (row.company_address as string) ?? null,
    phone: (row.company_phone as string) ?? null,
    email: (row.company_email as string) ?? null,
    nif: (row.company_nif as string) ?? null,
    rc: (row.company_rc as string) ?? null,
    ai: (row.company_ai as string) ?? null,
    nis: (row.company_nis as string) ?? null,
    rib: (row.company_rib as string) ?? null,
    logo: (row.company_logo as string) ?? null,
    footerText: (row.company_footer as string) ?? null,
    accentColor: (row.company_accent as string) ?? null,
  };
}

/**
 * Code-barres du numero de document, en Code 128.
 *
 * Il ne sert pas a identifier un article mais a **classer** : on retrouve un
 * dossier papier en passant la douchette sur le numero, sans le retaper.
 * Code 128 parce qu'il accepte les lettres et les tirets — « FAC-26-0355 »
 * n'entre dans aucun format numerique.
 *
 * Un echec de generation ne doit pas empecher le document de sortir : il reste
 * valable sans son code-barres, l'inverse n'est pas vrai.
 */
export async function codeBarresNumero(
  numero: string, logger?: Logger,
): Promise<string | null> {
  try {
    const png = await bwipjs.toBuffer({
      bcid: 'code128', text: numero, scale: 3, height: 8,
      includetext: false, paddingwidth: 0, paddingheight: 0,
    } as Parameters<typeof bwipjs.toBuffer>[0]);
    return `data:image/png;base64,${Buffer.from(png).toString('base64')}`;
  } catch (e) {
    logger?.warn(`Code-barres non genere pour ${numero}: ${String(e)}`);
    return null;
  }
}
