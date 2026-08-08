import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export type TypeResultat =
  | 'customer' | 'supplier' | 'product'
  | 'invoice' | 'quote' | 'deliveryNote' | 'purchaseOrder' | 'vendorBill' | 'creditNote';

export interface Resultat {
  type: TypeResultat;
  id: string;
  /** Ce qui identifie la ligne : un numéro de document, un nom de tiers. */
  titre: string;
  /** Contexte : le client d'une facture, la ville d'un tiers, le code d'un article. */
  sousTitre: string | null;
  /** Chemin de la fiche correspondante. */
  lien: string;
  /** Montant ou date, affiché à droite. Déjà formaté par l'appelant. */
  meta: string | null;
}

/** Au-delà, la liste cesse d'aider : on affine la recherche plutôt que de dérouler. */
const PAR_TYPE = 5;

@Injectable()
export class SearchService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  /**
   * Recherche transverse.
   *
   * Volontairement **non paginée** — exception assumée à R010. Ce n'est pas une
   * liste qu'on parcourt mais un aiguillage : cinq résultats par type, et si ce
   * n'est pas dedans, c'est la requête qu'il faut affiner.
   *
   * Chaque requête porte son `tenantId` : la recherche traverse neuf tables,
   * c'est exactement le genre d'endroit où un oubli passerait inaperçu.
   */
  async rechercher(tenantId: string, terme: string): Promise<{ data: Resultat[] }> {
    const q = terme.trim();
    if (q.length < 2) return { data: [] };
    const motif = `%${q}%`;

    // Un scan arrive ici comme n'importe quelle saisie. S'il correspond
    // exactement à un code-barres, l'article visé passe en tête : c'est la
    // seule réponse attendue quand on a passé une douchette.
    const parScan: any[] = await this.ds.query(
      `SELECT p.id, p.name, p.code, cb.barcode
       FROM product_barcodes cb
       JOIN finished_products p ON p.id = cb."finishedProductId"
       WHERE cb."tenantId" = $1 AND cb.barcode = $2
         AND cb."deletedAt" IS NULL AND p."deletedAt" IS NULL
       LIMIT 1`,
      [tenantId, q.replace(/[\s-]/g, '')],
    );

    const [clients, fournisseurs, produits, factures, devis, bl, commandes, facturesF, avoirs] =
      await Promise.all([
        this.ds.query(
          `SELECT id, name, city, nif FROM partners
           WHERE "tenantId" = $1 AND "isCustomer" = true AND "deletedAt" IS NULL
             AND (name ILIKE $2 OR nif ILIKE $2 OR phone ILIKE $2 OR email ILIKE $2)
           ORDER BY name LIMIT ${PAR_TYPE}`, [tenantId, motif]),
        this.ds.query(
          `SELECT id, name, city, nif FROM partners
           WHERE "tenantId" = $1 AND "isSupplier" = true AND "deletedAt" IS NULL
             AND (name ILIKE $2 OR nif ILIKE $2 OR phone ILIKE $2 OR email ILIKE $2)
           ORDER BY name LIMIT ${PAR_TYPE}`, [tenantId, motif]),
        this.ds.query(
          `SELECT id, name, code, unit FROM finished_products
           WHERE "tenantId" = $1 AND "deletedAt" IS NULL
             AND (name ILIKE $2 OR code ILIKE $2)
           ORDER BY name LIMIT ${PAR_TYPE}`, [tenantId, motif]),
        this.ds.query(
          `SELECT f.id, f."invoiceNumber", f."invoiceDate", f."totalAmount", c.name AS client
           FROM sales_invoices f JOIN partners c ON c.id = f."customerId"
           WHERE f."tenantId" = $1 AND f."deletedAt" IS NULL
             AND (f."invoiceNumber" ILIKE $2 OR c.name ILIKE $2)
           ORDER BY f."invoiceDate" DESC LIMIT ${PAR_TYPE}`, [tenantId, motif]),
        this.ds.query(
          `SELECT d.id, d."quoteNumber", d."quoteDate", d."totalAmount", c.name AS client
           FROM quotes d JOIN partners c ON c.id = d."customerId"
           WHERE d."tenantId" = $1 AND d."deletedAt" IS NULL
             AND (d."quoteNumber" ILIKE $2 OR c.name ILIKE $2)
           ORDER BY d."quoteDate" DESC LIMIT ${PAR_TYPE}`, [tenantId, motif]),
        this.ds.query(
          `SELECT b.id, b."blNumber", b."deliveryDate", b.total, c.name AS client
           FROM delivery_notes b JOIN partners c ON c.id = b."customerId"
           WHERE b."tenantId" = $1 AND b."deletedAt" IS NULL
             AND (b."blNumber" ILIKE $2 OR c.name ILIKE $2)
           ORDER BY b."deliveryDate" DESC LIMIT ${PAR_TYPE}`, [tenantId, motif]),
        this.ds.query(
          `SELECT p.id, p."poNumber", p."orderDate", p.total, f.name AS fournisseur
           FROM purchase_orders p JOIN partners f ON f.id = p."supplierId"
           WHERE p."tenantId" = $1 AND p."deletedAt" IS NULL
             AND (p."poNumber" ILIKE $2 OR f.name ILIKE $2)
           ORDER BY p."orderDate" DESC LIMIT ${PAR_TYPE}`, [tenantId, motif]),
        this.ds.query(
          `SELECT v.id, v."billNumber", v."billDate", v."totalAmount", f.name AS fournisseur
           FROM vendor_bills v JOIN partners f ON f.id = v."supplierId"
           WHERE v."tenantId" = $1 AND v."deletedAt" IS NULL
             AND (v."billNumber" ILIKE $2 OR f.name ILIKE $2)
           ORDER BY v."billDate" DESC LIMIT ${PAR_TYPE}`, [tenantId, motif]),
        this.ds.query(
          `SELECT a.id, a."creditNoteNumber", a."creditNoteDate", a."totalAmount", c.name AS client
           FROM credit_notes a JOIN partners c ON c.id = a."customerId"
           WHERE a."tenantId" = $1 AND a."deletedAt" IS NULL
             AND (a."creditNoteNumber" ILIKE $2 OR c.name ILIKE $2)
           ORDER BY a."creditNoteDate" DESC LIMIT ${PAR_TYPE}`, [tenantId, motif]),
      ]);

    const data: Resultat[] = [
      ...parScan.map((r: any) =>
        this.ligne('product', r.id, r.name, r.barcode, `/products/${r.id}`, null)),
      ...clients.map((r: any) => this.ligne('customer', r.id, r.name, r.city ?? r.nif, `/customers/${r.id}`, null)),
      ...fournisseurs.map((r: any) => this.ligne('supplier', r.id, r.name, r.city ?? r.nif, `/suppliers/${r.id}`, null)),
      ...produits
        .filter((r: any) => !parScan.some((p: any) => p.id === r.id))
        .map((r: any) => this.ligne('product', r.id, r.name, r.code, `/products/${r.id}`, r.unit)),
      ...factures.map((r: any) => this.ligne('invoice', r.id, r.invoiceNumber, r.client, `/invoices/${r.id}`, r.totalAmount)),
      ...devis.map((r: any) => this.ligne('quote', r.id, r.quoteNumber, r.client, `/quotes/${r.id}`, r.totalAmount)),
      ...bl.map((r: any) => this.ligne('deliveryNote', r.id, r.blNumber, r.client, `/deliveries/${r.id}`, r.total)),
      ...commandes.map((r: any) => this.ligne('purchaseOrder', r.id, r.poNumber, r.fournisseur, `/purchases/orders/${r.id}`, r.total)),
      ...facturesF.map((r: any) => this.ligne('vendorBill', r.id, r.billNumber, r.fournisseur, `/purchases/vendor-bills/${r.id}`, r.totalAmount)),
      // Les avoirs n'ont pas de fiche : on renvoie vers leur liste.
      ...avoirs.map((r: any) => this.ligne('creditNote', r.id, r.creditNoteNumber, r.client, '/credit-notes', r.totalAmount)),
    ];

    return { data };
  }

  private ligne(
    type: TypeResultat, id: string, titre: string,
    sousTitre: string | null, lien: string, meta: unknown,
  ): Resultat {
    return {
      type, id, titre,
      sousTitre: sousTitre ?? null,
      lien,
      meta: meta === null || meta === undefined ? null : String(meta),
    };
  }
}
