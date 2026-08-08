/**
 * Gabarit commun des documents commerciaux.
 *
 * Facture, bon de livraison et devis partageaient trois blocs HTML de deux
 * cents lignes, recopiés et déjà divergents : la facture affichait
 * `item.description ?? item.finishedProductId` alors que la colonne
 * `description` n'existe pas sur ses lignes — elle imprimait donc l'IDENTIFIANT
 * de l'article, tandis que le BL et le devis affichaient son nom.
 *
 * Le rendu est une fonction pure : c'est le HTML qui porte tout le contenu, et
 * il se vérifie sans lancer de navigateur.
 */

export interface Emetteur {
  companyName: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  nif: string | null;
  rc: string | null;
  ai: string | null;
  nis: string | null;
  rib: string | null;
  logo: string | null;
  footerText: string | null;
  accentColor: string | null;
}

export interface Destinataire {
  name: string | null;
  address: string | null;
  nif: string | null;
  rc: string | null;
  ai: string | null;
}

export interface LignePdf {
  libelle: string;
  quantite: number | string;
  unite: string | null;
  prixUnitaire: number | string;
  tauxTva: number | string | null;
  total: number | string;
}

export interface TotalPdf {
  libelle: string;
  montant: number | string;
  fort?: boolean;
}

export interface OptionsDocument {
  titre: string;
  numero: string;
  /** Paires libellé/valeur affichées sous le numéro (dates, échéance…). */
  entetes: { libelle: string; valeur: string }[];
  labelEmetteur: string;
  labelDestinataire: string;
  emetteur: Emetteur;
  destinataire: Destinataire;
  lignes: LignePdf[];
  totaux: TotalPdf[];
  notes: string | null;
  /** Deux cartouches de signature en bas de page. */
  signatures?: [string, string];
  /** Mention propre au document, avant le pied de page du locataire. */
  mention?: string | null;
}

/** Couleur de repli si le réglage est vide ou mal formé. */
const ACCENT_DEFAUT = '#1e3a5f';

/**
 * Échappement HTML.
 *
 * Les noms de clients, les libellés d'articles et les notes sont saisis par
 * l'utilisateur et étaient injectés bruts dans le gabarit. Un nom contenant
 * « </div> » disloquait la mise en page, et une note contenant une balise
 * `img` à source distante faisait sortir une requête du navigateur sans tête
 * au moment de générer le PDF.
 */
export function echapper(valeur: unknown): string {
  if (valeur === null || valeur === undefined) return '';
  return String(valeur)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Une couleur d'accent arrive dans une feuille de style : seule une notation
 * hexadécimale est acceptée, faute de quoi « red; } body { display:none » y
 * entrerait tel quel.
 */
export function couleurSure(valeur: string | null | undefined): string {
  return valeur && /^#[0-9a-fA-F]{6}$/.test(valeur) ? valeur : ACCENT_DEFAUT;
}

export function montant(valeur: number | string | null | undefined): string {
  if (valeur === null || valeur === undefined) return '';
  return (
    new Intl.NumberFormat('fr-DZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      .format(Number(valeur)) + ' DA'
  );
}

export function jour(valeur: string | Date | null | undefined): string {
  if (!valeur) return '';
  return new Intl.DateTimeFormat('fr-DZ', {
    timeZone: 'Africa/Algiers', day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(new Date(valeur as string));
}

function styles(accent: string): string {
  return `<style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #1a1a1a; }
    .page { padding: 20px; }
    .header { display: flex; justify-content: space-between; margin-bottom: 24px; }
    .company-name { font-size: 18px; font-weight: bold; color: ${accent}; }
    .company-info { font-size: 10px; color: #555; margin-top: 3px; }
    .doc-title { text-align: right; }
    .doc-number { font-size: 20px; font-weight: bold; color: ${accent}; }
    .doc-date { font-size: 10px; color: #555; margin-top: 4px; }
    .parties { display: flex; justify-content: space-between; margin-bottom: 20px; gap: 20px; }
    .party-box { flex: 1; border: 1px solid #dde; border-radius: 4px; padding: 10px; }
    .party-label { font-size: 9px; text-transform: uppercase; color: #888; margin-bottom: 4px; letter-spacing: 0.5px; }
    .party-name { font-weight: bold; font-size: 12px; margin-bottom: 2px; }
    .party-detail { font-size: 10px; color: #444; line-height: 1.5; }
    .legal-ids { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 4px; }
    .legal-id { font-size: 9px; color: #555; }
    .legal-id span { font-weight: bold; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
    th { background: ${accent}; color: white; text-align: left; padding: 7px 8px; font-size: 10px; }
    td { padding: 6px 8px; border-bottom: 1px solid #eee; font-size: 10px; }
    tr:nth-child(even) td { background: #f8f9fb; }
    .text-right { text-align: right; }
    .totals { display: flex; justify-content: flex-end; margin-bottom: 16px; }
    .totals-box { width: 280px; border: 1px solid #dde; border-radius: 4px; overflow: hidden; }
    .total-row { display: flex; justify-content: space-between; padding: 6px 10px; font-size: 10px; border-bottom: 1px solid #eee; }
    .total-row.fort { background: ${accent}; color: white; font-weight: bold; font-size: 11px; border-bottom: none; }
    .notes { border: 1px solid #dde; border-radius: 4px; padding: 10px; font-size: 10px; color: #444; margin-bottom: 12px; }
    .rib { font-size: 10px; color: #444; margin-bottom: 12px; }
    .signatures { display: flex; justify-content: space-between; margin-top: 30px; }
    .signature { text-align: center; width: 200px; }
    .signature div { border-top: 1px solid #333; padding-top: 4px; font-size: 10px; }
    .footer { text-align: center; font-size: 9px; color: #888; border-top: 1px solid #eee; padding-top: 8px; margin-top: 16px; white-space: pre-line; }
  </style>`;
}

function identifiants(ids: { libelle: string; valeur: string | null }[]): string {
  const presents = ids.filter((i) => i.valeur);
  if (!presents.length) return '';
  return `<div class="legal-ids">${presents
    .map((i) => `<div class="legal-id">${echapper(i.libelle)} : <span>${echapper(i.valeur)}</span></div>`)
    .join('')}</div>`;
}

function partie(
  label: string,
  nom: string | null,
  adresse: string | null,
  ids: { libelle: string; valeur: string | null }[],
  lignesSup: (string | null)[] = [],
): string {
  return `<div class="party-box">
    <div class="party-label">${echapper(label)}</div>
    <div class="party-name">${echapper(nom)}</div>
    ${adresse ? `<div class="party-detail">${echapper(adresse)}</div>` : ''}
    ${lignesSup.filter(Boolean).map((l) => `<div class="party-detail">${echapper(l)}</div>`).join('')}
    ${identifiants(ids)}
  </div>`;
}

export function rendreDocument(o: OptionsDocument): string {
  const accent = couleurSure(o.emetteur.accentColor);
  const e = o.emetteur;

  const idsEmetteur = [
    { libelle: 'NIF', valeur: e.nif },
    { libelle: 'RC', valeur: e.rc },
    { libelle: 'AI', valeur: e.ai },
    { libelle: 'NIS', valeur: e.nis },
  ];

  return `<!DOCTYPE html><html><head><meta charset="utf-8">${styles(accent)}</head><body>
  <div class="page">
    <div class="header">
      <div style="display:flex; align-items:flex-start; gap:12px;">
        ${e.logo ? `<img src="${echapper(e.logo)}" style="max-height:60px; max-width:140px; object-fit:contain;" alt="logo"/>` : ''}
        <div>
          <div class="company-name">${echapper(e.companyName ?? 'Mon Entreprise')}</div>
          ${e.address ? `<div class="company-info">${echapper(e.address)}</div>` : ''}
          ${e.phone || e.email
            ? `<div class="company-info">${[e.phone, e.email].filter(Boolean).map(echapper).join(' — ')}</div>`
            : ''}
        </div>
      </div>
      <div class="doc-title">
        <div class="doc-number">${echapper(o.titre)} N° ${echapper(o.numero)}</div>
        ${o.entetes.map((h) => `<div class="doc-date">${echapper(h.libelle)} : ${echapper(h.valeur)}</div>`).join('')}
      </div>
    </div>

    <div class="parties">
      ${partie(o.labelEmetteur, e.companyName, e.address, idsEmetteur)}
      ${partie(o.labelDestinataire, o.destinataire.name, o.destinataire.address, [
        { libelle: 'NIF', valeur: o.destinataire.nif },
        { libelle: 'RC', valeur: o.destinataire.rc },
        { libelle: 'AI', valeur: o.destinataire.ai },
      ])}
    </div>

    <table>
      <thead>
        <tr>
          <th style="width:45%">Désignation</th>
          <th class="text-right" style="width:12%">Qté</th>
          <th class="text-right" style="width:15%">P.U. HT</th>
          <th class="text-right" style="width:8%">TVA</th>
          <th class="text-right" style="width:20%">Total TTC</th>
        </tr>
      </thead>
      <tbody>
        ${o.lignes.map((l) => `<tr>
          <td>${echapper(l.libelle)}</td>
          <td class="text-right">${Number(l.quantite)} ${echapper(l.unite ?? '')}</td>
          <td class="text-right">${montant(l.prixUnitaire)}</td>
          <td class="text-right">${l.tauxTva != null ? `${Number(l.tauxTva)} %` : '—'}</td>
          <td class="text-right">${montant(l.total)}</td>
        </tr>`).join('')}
      </tbody>
    </table>

    <div class="totals">
      <div class="totals-box">
        ${o.totaux.map((t) => `<div class="total-row${t.fort ? ' fort' : ''}">
          <span>${echapper(t.libelle)}</span><span>${montant(t.montant)}</span>
        </div>`).join('')}
      </div>
    </div>

    ${o.notes ? `<div class="notes"><strong>Notes :</strong> ${echapper(o.notes)}</div>` : ''}
    ${e.rib ? `<div class="rib"><strong>RIB :</strong> ${echapper(e.rib)}</div>` : ''}

    ${o.signatures ? `<div class="signatures">
      <div class="signature"><div>${echapper(o.signatures[0])}</div></div>
      <div class="signature"><div>${echapper(o.signatures[1])}</div></div>
    </div>` : ''}

    <div class="footer">${[o.mention, e.footerText].filter(Boolean).map(echapper).join('\n')}</div>
  </div>
</body></html>`;
}
