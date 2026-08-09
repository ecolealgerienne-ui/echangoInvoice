import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { PdfService } from '../common/pdf.service';
import { montantEnLettres } from '../common/montant-en-lettres';
import { LignePdf, jour, rendreDocument } from '../common/pdf/document-template';
import { CHAMPS_EMETTEUR, codeBarresNumero, lireEmetteur } from '../common/pdf/emetteur';

/**
 * PDF des documents d'achat.
 *
 * Le module PDF avait ete bati pour les documents de vente : un client comme
 * destinataire, la numerotation des ventes, et l'entete societe en position
 * d'emetteur. Les achats inversent ce sens, et n'avaient donc rien.
 *
 * Le renversement n'est pas qu'une question de libelle. Sur un bon de commande,
 * c'est **nous** qui commandons : nos identifiants legaux restent en tete —
 * le fournisseur en a besoin pour nous facturer — mais le destinataire est le
 * fournisseur, et le document engage notre signature, pas la sienne.
 *
 * Trois documents, trois statuts differents, qu'il faut distinguer :
 *
 * - le **bon de commande** est emis par nous et part chez le fournisseur. Il
 *   engage : c'est le seul des trois qui avait vraiment besoin d'un PDF ;
 * - le **bon de reception** ne sort pas de la maison. Son PDF sert de preuve
 *   interne de ce que le magasin a accepte, signe au dechargement ;
 * - la **facture fournisseur** ne nous appartient pas. L'original du
 *   fournisseur fait foi ; notre rendu n'est qu'une copie de travail, et il le
 *   dit en toutes lettres — imprimer une facture d'autrui sans cette mention
 *   fabriquerait un faux.
 *
 * Aucun de ces trois documents ne porte de QR de verification. Cette page est
 * publique et non authentifiee : elle existe pour qu'un tiers detenant *notre*
 * document confirme qu'il est authentique. L'ouvrir aux achats publierait nos
 * prix d'achat fournisseur sur une URL devinable — exactement ce qu'un
 * concurrent cherche. Le code-barres du numero, lui, reste : il ne sert qu'au
 * classement et ne divulgue rien.
 */
@Injectable()
export class PurchasePdfService {
  private readonly logger = new Logger(PurchasePdfService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly pdfService: PdfService,
  ) {}

  /**
   * Les lignes d'achat designent l'article par `rawMaterialId`, celles de vente
   * par `finishedProductId` — deux noms herites pour la meme cle etrangere.
   */
  private lignes(items: Record<string, unknown>[]): LignePdf[] {
    return items.map((i) => ({
      libelle: (i.product_name as string) ?? (i.description as string) ?? '',
      quantite: i.quantity as number,
      unite: (i.unit as string) ?? null,
      prixUnitaire: i.unitPrice as number,
      tauxTva: (i.taxRate as number) ?? null,
      total: i.lineTotal as number,
    }));
  }

  /** Coordonnees du fournisseur, en position de destinataire. */
  private fournisseur(row: Record<string, unknown>) {
    return {
      name: (row.supplier_name as string) ?? '',
      address: (row.supplier_address as string) ?? null,
      nif: (row.supplier_nif as string) ?? null,
      rc: (row.supplier_rc as string) ?? null,
      ai: (row.supplier_ai as string) ?? null,
    };
  }

  /**
   * Bon de commande fournisseur.
   *
   * C'est le document que le fournisseur recoit et sur lequel il livre. Sans
   * PDF, il fallait le lui dicter au telephone ou le retaper dans un tableur —
   * et un litige de quantite se reglait sans piece ecrite.
   */
  async generatePurchaseOrderPdf(poId: string, tenantId: string) {
    const rows = await this.ds.query(
      `SELECT bc.*, f.name AS supplier_name, f.address AS supplier_address,
              f.nif AS supplier_nif, f.rc AS supplier_rc, f.ai AS supplier_ai,
              ${CHAMPS_EMETTEUR}
       FROM purchase_orders bc
       JOIN partners f ON f.id = bc."supplierId"
       LEFT JOIN settings s ON s."tenantId" = bc."tenantId"
       WHERE bc.id = $1 AND bc."tenantId" = $2 AND bc."deletedAt" IS NULL`,
      [poId, tenantId],
    );
    if (!rows.length) throw new NotFoundException('purchase_order_not_found');
    const bc = rows[0];

    const items = await this.ds.query(
      `SELECT poi.*, fp.name AS product_name FROM purchase_order_items poi
       LEFT JOIN finished_products fp ON fp.id = poi."rawMaterialId"
       WHERE poi."purchaseOrderId" = $1 AND poi."tenantId" = $2
       ORDER BY poi."createdAt"`,
      [poId, tenantId],
    );

    const entetes = [{ libelle: 'Date de commande', valeur: jour(bc.orderDate) }];
    if (bc.expectedDeliveryDate) {
      entetes.push({ libelle: 'Livraison souhaitée', valeur: jour(bc.expectedDeliveryDate) });
    }

    const html = rendreDocument({
      titre: 'BON DE COMMANDE',
      numero: bc.poNumber,
      entetes,
      // Sur un achat, les roles s'inversent : nous commandons, le fournisseur
      // livre. Nos identifiants legaux restent en tete — il en a besoin pour
      // etablir sa facture.
      labelEmetteur: 'Donneur d’ordre',
      labelDestinataire: 'Fournisseur',
      emetteur: lireEmetteur(bc),
      destinataire: this.fournisseur(bc),
      lignes: this.lignes(items),
      totaux: [
        { libelle: 'Sous-total HT', montant: bc.subtotal },
        { libelle: 'TVA', montant: bc.taxAmount },
        { libelle: 'TOTAL TTC', montant: bc.total, fort: true },
      ],
      notes: bc.notes,
      montantEnLettres: `Arrêté le présent bon de commande à la somme de : ${montantEnLettres(bc.total)}`,
      // Une commande annulee qui ressort a l'identique ferait livrer pour rien.
      filigrane: bc.status === 'cancelled' ? 'COMMANDE ANNULÉE' : null,
      codeBarresNumero: await codeBarresNumero(bc.poNumber, this.logger),
      signatures: ['Cachet et signature du donneur d’ordre', 'Bon pour accord — fournisseur'],
    });

    const { buffer } = await this.pdfService.generateAndArchive({
      type: 'COMMANDES', tenantId, documentId: bc.id, filename: bc.poNumber, html,
    });
    return { buffer, filename: `${bc.poNumber}.pdf` };
  }

  /**
   * Bon de reception.
   *
   * Document interne : il atteste de ce que le magasin a réellement accepté,
   * lot par lot. C'est la piece qui tranche quand la facture du fournisseur
   * annonce plus que ce qui est entre en stock.
   */
  async generateReceptionBlPdf(blId: string, tenantId: string) {
    const rows = await this.ds.query(
      `SELECT r.*, bc."poNumber" AS po_numero, bc."orderDate" AS po_date,
              f.name AS supplier_name, f.address AS supplier_address,
              f.nif AS supplier_nif, f.rc AS supplier_rc, f.ai AS supplier_ai,
              ${CHAMPS_EMETTEUR}
       FROM reception_bls r
       LEFT JOIN purchase_orders bc ON bc.id = r."purchaseOrderId"
       LEFT JOIN partners f ON f.id = bc."supplierId"
       LEFT JOIN settings s ON s."tenantId" = r."tenantId"
       WHERE r.id = $1 AND r."tenantId" = $2 AND r."deletedAt" IS NULL`,
      [blId, tenantId],
    );
    if (!rows.length) throw new NotFoundException('reception_bl_not_found');
    const r = rows[0];

    // Une reception se lit par les lots qu'elle a crees : c'est la seule trace
    // de ce qui est physiquement entre, avec son numero de lot et sa DLC.
    const lots = await this.ds.query(
      `SELECT se.*, fp.name AS product_name FROM stock_entries se
       LEFT JOIN finished_products fp ON fp.id = se."rawMaterialId"
       WHERE se."receptionBlId" = $1 AND se."tenantId" = $2
       ORDER BY se."createdAt"`,
      [blId, tenantId],
    );

    const entetes = [{ libelle: 'Date de réception', valeur: jour(r.receptionDate) }];
    if (r.po_numero) {
      entetes.push({ libelle: 'Commande', valeur: `${r.po_numero} du ${jour(r.po_date)}` });
    }

    const html = rendreDocument({
      titre: 'BON DE RÉCEPTION',
      numero: r.blNumber,
      entetes,
      labelEmetteur: 'Réceptionnaire',
      labelDestinataire: 'Fournisseur',
      emetteur: lireEmetteur(r),
      destinataire: this.fournisseur(r),
      lignes: lots.map((l: Record<string, unknown>) => ({
        libelle: (l.product_name as string) ?? '',
        quantite: l.quantity as number,
        unite: (l.unit as string) ?? null,
        // Une reception constate des quantites, pas des prix : les colonnes
        // monetaires resteraient vides et donneraient un document a moitie
        // rempli. Le lot prend leur place, seule information utile ici.
        prixUnitaire: null,
        tauxTva: null,
        total: null,
        complement: (l.batchNumber as string) ?? null,
      })) as LignePdf[],
      colonnes: 'quantitatif',
      totaux: [
        { libelle: 'Quantité totale reçue', montant: r.totalQuantityReceived, brut: true },
      ],
      notes: r.notes,
      mention: r.status === 'partial'
        ? 'Réception partielle : le reliquat de la commande demeure attendu.'
        : null,
      codeBarresNumero: await codeBarresNumero(r.blNumber, this.logger),
      signatures: ['Signature du livreur', 'Signature du magasinier'],
    });

    const { buffer } = await this.pdfService.generateAndArchive({
      type: 'RECEPTIONS', tenantId, documentId: r.id, filename: r.blNumber, html,
    });
    return { buffer, filename: `${r.blNumber}.pdf` };
  }

  /**
   * Facture fournisseur — copie de travail.
   *
   * Ce document ne nous appartient pas : l'original du fournisseur est la piece
   * comptable, et c'est lui qui part au dossier fiscal. Le rendu ci-dessous est
   * une **copie interne**, utile pour joindre au dossier de reglement ce qui a
   * ete saisi, avec l'etat des paiements que l'original ne porte pas.
   *
   * La mention et le filigrane ne sont pas decoratifs : sans eux, ce PDF
   * circulerait comme une facture fournisseur authentique alors qu'il ne
   * reproduit que notre saisie. Ils ne doivent pas etre retires.
   */
  async generateVendorBillPdf(billId: string, tenantId: string) {
    const rows = await this.ds.query(
      `SELECT vb.*, f.name AS supplier_name, f.address AS supplier_address,
              f.nif AS supplier_nif, f.rc AS supplier_rc, f.ai AS supplier_ai,
              bc."poNumber" AS po_numero,
              ${CHAMPS_EMETTEUR}
       FROM vendor_bills vb
       JOIN partners f ON f.id = vb."supplierId"
       LEFT JOIN purchase_orders bc ON bc.id = vb."purchaseOrderId"
       LEFT JOIN settings s ON s."tenantId" = vb."tenantId"
       WHERE vb.id = $1 AND vb."tenantId" = $2 AND vb."deletedAt" IS NULL`,
      [billId, tenantId],
    );
    if (!rows.length) throw new NotFoundException('vendor_bill_not_found');
    const vb = rows[0];

    const items = await this.ds.query(
      `SELECT vbi.*, fp.name AS product_name FROM vendor_bill_items vbi
       LEFT JOIN finished_products fp ON fp.id = vbi."finishedProductId"
       WHERE vbi."vendorBillId" = $1 AND vbi."tenantId" = $2
       ORDER BY vbi."createdAt"`,
      [billId, tenantId],
    );

    const entetes = [{ libelle: 'Date de facture', valeur: jour(vb.billDate) }];
    if (vb.dueDate) entetes.push({ libelle: 'Échéance', valeur: jour(vb.dueDate) });
    if (vb.po_numero) entetes.push({ libelle: 'Commande', valeur: vb.po_numero });

    const totaux = [
      { libelle: 'Sous-total HT', montant: vb.subtotal },
      { libelle: 'TVA', montant: vb.taxAmount },
      { libelle: 'TOTAL TTC', montant: vb.totalAmount, fort: true },
    ];
    // L'etat du reglement est la seule chose que l'original du fournisseur ne
    // porte pas, et la raison d'etre de cette copie.
    if (Number(vb.amountPaid) > 0) {
      totaux.push({ libelle: 'Déjà réglé', montant: vb.amountPaid });
      totaux.push({ libelle: 'Reste à payer', montant: vb.amountDue, fort: true });
    }

    const html = rendreDocument({
      titre: 'FACTURE FOURNISSEUR',
      numero: vb.billNumber,
      entetes,
      // Ici l'emetteur reel est le fournisseur : ne pas inverser les blocs
      // ferait passer notre societe pour l'auteur de la facture.
      labelEmetteur: 'Fournisseur',
      labelDestinataire: 'Client',
      emetteur: {
        ...lireEmetteur(vb),
        companyName: vb.supplier_name,
        address: vb.supplier_address,
        nif: vb.supplier_nif, rc: vb.supplier_rc, ai: vb.supplier_ai,
        // Ni notre logo ni notre cachet sur un document dont nous ne sommes
        // pas l'auteur.
        logo: null, stampImage: null, rib: null, nis: null,
        phone: null, email: null,
      },
      destinataire: {
        name: vb.company_name, address: vb.company_address,
        nif: vb.company_nif, rc: vb.company_rc, ai: vb.company_ai,
      },
      lignes: this.lignes(items),
      totaux,
      notes: vb.notes,
      mention: 'Copie interne — reproduction de la saisie. Seul l’original '
        + 'remis par le fournisseur a valeur de pièce comptable.',
      filigrane: vb.status === 'cancelled' ? 'ANNULÉE' : 'COPIE INTERNE',
      codeBarresNumero: await codeBarresNumero(vb.billNumber, this.logger),
    });

    const { buffer } = await this.pdfService.generateAndArchive({
      type: 'FACTURES_FOURNISSEURS', tenantId, documentId: vb.id,
      filename: vb.billNumber, html,
    });
    return { buffer, filename: `${vb.billNumber}.pdf` };
  }
}
