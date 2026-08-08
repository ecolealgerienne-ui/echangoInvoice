import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { PdfService } from '../common/pdf.service';
import { EmailService } from '../common/email.service';
import { montantEnLettres } from '../common/montant-en-lettres';
import { MENTION_TIMBRE, calculerNetAPayer } from '../common/droit-de-timbre';
import {
  Emetteur, LignePdf, jour, montant, rendreDocument,
} from '../common/pdf/document-template';

/** Colonnes de l'émetteur, identiques pour les trois documents. */
const CHAMPS_EMETTEUR = `
  s."companyName" AS company_name, s.address AS company_address,
  s.phone AS company_phone, s.email AS company_email,
  s.nif AS company_nif, s.rc AS company_rc, s.ai AS company_ai, s.nis AS company_nis,
  s.rib AS company_rib, s.logo AS company_logo,
  s."footerText" AS company_footer, s."pdfAccentColor" AS company_accent`;

@Injectable()
export class InvoicePdfService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly pdfService: PdfService,
    private readonly emailService: EmailService,
  ) {}

  /**
   * L'émetteur venait de `settings`, sauf ses identifiants légaux : la requête
   * sélectionnait `NULL AS company_nif`. Chaque facture sortait donc avec
   * « NIF : | RC : » vides — inexploitable en Algérie.
   */
  private emetteur(row: Record<string, unknown>): Emetteur {
    return {
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

  private lignes(items: Record<string, unknown>[]): LignePdf[] {
    return items.map((i) => ({
      // `product_name` vient d'une jointure sur finished_products. La facture
      // lisait `description ?? finishedProductId` — une colonne qui n'existe
      // pas sur ses lignes, donc l'identifiant de l'article s'imprimait.
      libelle: (i.product_name as string) ?? '',
      quantite: i.quantity as number,
      unite: (i.unit as string) ?? null,
      prixUnitaire: i.unitPrice as number,
      tauxTva: (i.taxRate1 as number) ?? null,
      total: i.lineTotal as number,
    }));
  }

  async generateInvoicePdf(invoiceId: string, tenantId: string) {
    const rows = await this.ds.query(
      `SELECT si.*, c.name AS customer_name, c.address AS customer_address,
              c.nif AS customer_nif, c.rc AS customer_rc, c.ai AS customer_ai,
              ${CHAMPS_EMETTEUR}
       FROM sales_invoices si
       JOIN partners c ON c.id = si."customerId"
       LEFT JOIN settings s ON s."tenantId" = si."tenantId"
       WHERE si.id = $1 AND si."tenantId" = $2 AND si."deletedAt" IS NULL`,
      [invoiceId, tenantId],
    );
    if (!rows.length) throw new NotFoundException('invoice_not_found');
    const inv = rows[0];

    const items = await this.ds.query(
      `SELECT sii.*, fp.name AS product_name
       FROM sales_invoice_items sii
       LEFT JOIN finished_products fp ON fp.id = sii."finishedProductId"
       WHERE sii."salesInvoiceId" = $1
       ORDER BY sii."createdAt"`,
      [invoiceId],
    );

    const credite = Number(inv.creditedAmount ?? 0);
    const paye = Number(inv.amountPaid ?? 0);
    // Les decimal de TypeORM reviennent en chaîne : convertir avant de comparer.
    const timbre = Number(inv.stampDuty ?? 0);
    const netAPayer = calculerNetAPayer(inv.totalAmount, timbre);

    const html = rendreDocument({
      titre: 'FACTURE',
      numero: inv.invoiceNumber,
      entetes: [
        { libelle: 'Date', valeur: jour(inv.invoiceDate) },
        ...(inv.dueDate ? [{ libelle: 'Échéance', valeur: jour(inv.dueDate) }] : []),
      ],
      labelEmetteur: 'Émetteur',
      labelDestinataire: 'Client',
      emetteur: this.emetteur(inv),
      destinataire: {
        name: inv.customer_name, address: inv.customer_address,
        nif: inv.customer_nif, rc: inv.customer_rc, ai: inv.customer_ai,
      },
      lignes: this.lignes(items),
      totaux: [
        { libelle: 'Sous-total HT', montant: inv.subtotal },
        { libelle: 'TVA', montant: inv.taxAmount },
        // Quand un timbre s'ajoute, le TTC cesse d'être le montant à payer :
        // il perd donc la mise en avant au profit du net à payer.
        { libelle: 'Total TTC', montant: inv.totalAmount, fort: timbre === 0 },
        ...(timbre > 0 ? [
          { libelle: MENTION_TIMBRE, montant: timbre },
          { libelle: 'NET À PAYER', montant: netAPayer, fort: true },
        ] : []),
        ...(paye > 0 ? [{ libelle: 'Montant payé', montant: inv.amountPaid }] : []),
        // Sans cette ligne, une facture partiellement soldée par un avoir
        // affiche un reste dû inférieur au total moins les encaissements,
        // sans que rien n'explique la différence.
        ...(credite > 0 ? [{ libelle: 'Avoirs imputés', montant: inv.creditedAmount }] : []),
        ...(paye > 0 || credite > 0
          ? [{ libelle: 'Solde dû', montant: inv.amountDue, fort: true }]
          : []),
      ],
      notes: inv.notes,
      montantEnLettres: `Arrêtée la présente facture à la somme de : ${montantEnLettres(netAPayer)}`,
    });

    const { buffer } = await this.pdfService.generateAndArchive({
      type: 'FACTURES', tenantId, documentId: inv.id, filename: inv.invoiceNumber, html,
    });
    return { buffer, filename: `${inv.invoiceNumber}.pdf` };
  }

  async generateDeliveryNotePdf(dnId: string, tenantId: string) {
    const rows = await this.ds.query(
      `SELECT dn.*, c.name AS customer_name,
              COALESCE(c."shippingAddress", c.address) AS customer_address,
              c.nif AS customer_nif, c.rc AS customer_rc, c.ai AS customer_ai,
              ${CHAMPS_EMETTEUR}
       FROM delivery_notes dn
       JOIN partners c ON c.id = dn."customerId"
       LEFT JOIN settings s ON s."tenantId" = dn."tenantId"
       WHERE dn.id = $1 AND dn."tenantId" = $2 AND dn."deletedAt" IS NULL`,
      [dnId, tenantId],
    );
    if (!rows.length) throw new NotFoundException('delivery_note_not_found');
    const dn = rows[0];

    const items = await this.ds.query(
      `SELECT dni.*, fp.name AS product_name FROM delivery_note_items dni
       LEFT JOIN finished_products fp ON fp.id = dni."finishedProductId"
       WHERE dni."deliveryNoteId" = $1 ORDER BY dni."createdAt"`,
      [dnId],
    );

    const html = rendreDocument({
      titre: 'BON DE LIVRAISON',
      numero: dn.blNumber,
      entetes: [{ libelle: 'Date', valeur: jour(dn.deliveryDate) }],
      labelEmetteur: 'Expéditeur',
      labelDestinataire: 'Livrer à',
      emetteur: this.emetteur(dn),
      destinataire: {
        name: dn.customer_name, address: dn.customer_address,
        nif: dn.customer_nif, rc: dn.customer_rc, ai: dn.customer_ai,
      },
      lignes: this.lignes(items),
      totaux: [
        { libelle: 'Sous-total HT', montant: dn.subtotal },
        { libelle: 'TVA', montant: dn.taxAmount },
        { libelle: 'TOTAL TTC', montant: dn.total, fort: true },
      ],
      notes: dn.notes,
      signatures: ['Signature expéditeur', 'Signature destinataire'],
    });

    const { buffer } = await this.pdfService.generateAndArchive({
      type: 'BL', tenantId, documentId: dn.id, filename: dn.blNumber, html,
    });
    return { buffer, filename: `${dn.blNumber}.pdf` };
  }

  async generateQuotePdf(quoteId: string, tenantId: string) {
    const rows = await this.ds.query(
      `SELECT q.*, c.name AS customer_name, c.address AS customer_address,
              c.nif AS customer_nif, c.rc AS customer_rc, c.ai AS customer_ai,
              ${CHAMPS_EMETTEUR}
       FROM quotes q
       JOIN partners c ON c.id = q."customerId"
       LEFT JOIN settings s ON s."tenantId" = q."tenantId"
       WHERE q.id = $1 AND q."tenantId" = $2 AND q."deletedAt" IS NULL`,
      [quoteId, tenantId],
    );
    if (!rows.length) throw new NotFoundException('quote_not_found');
    const q = rows[0];

    const items = await this.ds.query(
      `SELECT qi.*, fp.name AS product_name FROM quote_items qi
       LEFT JOIN finished_products fp ON fp.id = qi."finishedProductId"
       WHERE qi."quoteId" = $1 ORDER BY qi."createdAt"`,
      [quoteId],
    );

    const html = rendreDocument({
      titre: 'DEVIS',
      numero: q.quoteNumber,
      entetes: [
        { libelle: 'Date', valeur: jour(q.quoteDate) },
        ...(q.expiryDate ? [{ libelle: 'Valide jusqu\'au', valeur: jour(q.expiryDate) }] : []),
      ],
      labelEmetteur: 'Émetteur',
      labelDestinataire: 'Client',
      emetteur: this.emetteur(q),
      destinataire: {
        name: q.customer_name, address: q.customer_address,
        nif: q.customer_nif, rc: q.customer_rc, ai: q.customer_ai,
      },
      lignes: this.lignes(items),
      totaux: [
        { libelle: 'Sous-total HT', montant: q.subtotal },
        { libelle: 'TVA', montant: q.taxAmount },
        { libelle: 'TOTAL TTC', montant: q.totalAmount, fort: true },
      ],
      notes: q.notes,
      signatures: ['Signature émetteur', 'Bon pour accord'],
      // La mention annonçait « valable 30 jours » quelle que soit la date de
      // validité réellement enregistrée sur le devis.
      mention: q.expiryDate ? `Devis valable jusqu'au ${jour(q.expiryDate)}.` : null,
    });

    const { buffer } = await this.pdfService.generateAndArchive({
      type: 'DEVIS', tenantId, documentId: q.id, filename: q.quoteNumber, html,
    });
    return { buffer, filename: `${q.quoteNumber}.pdf` };
  }

  async sendInvoiceEmail(invoiceId: string, tenantId: string): Promise<void> {
    const rows = await this.ds.query(
      `SELECT si.*, c.name AS customer_name, c.email AS customer_email,
              s."companyName" AS company_name
       FROM sales_invoices si
       JOIN partners c ON c.id = si."customerId"
       LEFT JOIN settings s ON s."tenantId" = si."tenantId"
       WHERE si.id = $1 AND si."tenantId" = $2 AND si."deletedAt" IS NULL`,
      [invoiceId, tenantId],
    );
    if (!rows.length) throw new NotFoundException('invoice_not_found');
    const inv = rows[0];
    if (!inv.customer_email) throw new NotFoundException('customer_email_missing');

    const { buffer, filename } = await this.generateInvoicePdf(invoiceId, tenantId);

    await this.emailService.send({
      to: inv.customer_email,
      subject: `Facture ${inv.invoiceNumber} — ${inv.company_name ?? ''}`,
      html: this.emailService.buildInvoiceEmail({
        companyName: inv.company_name ?? 'Mon Entreprise',
        invoiceNumber: inv.invoiceNumber,
        customerName: inv.customer_name,
        totalAmount: montant(inv.totalAmount),
        dueDate: jour(inv.dueDate),
      }),
      attachments: [{ filename, content: buffer, contentType: 'application/pdf' }],
    });
  }

  async sendDeliveryNoteEmail(dnId: string, tenantId: string): Promise<void> {
    const rows = await this.ds.query(
      `SELECT dn.*, c.name AS customer_name, c.email AS customer_email,
              s."companyName" AS company_name
       FROM delivery_notes dn
       JOIN partners c ON c.id = dn."customerId"
       LEFT JOIN settings s ON s."tenantId" = dn."tenantId"
       WHERE dn.id = $1 AND dn."tenantId" = $2 AND dn."deletedAt" IS NULL`,
      [dnId, tenantId],
    );
    if (!rows.length) throw new NotFoundException('delivery_note_not_found');
    const dn = rows[0];
    if (!dn.customer_email) throw new NotFoundException('customer_email_missing');

    const { buffer, filename } = await this.generateDeliveryNotePdf(dnId, tenantId);

    await this.emailService.send({
      to: dn.customer_email,
      subject: `Bon de livraison ${dn.blNumber} — ${dn.company_name ?? ''}`,
      html: this.emailService.buildDeliveryNoteEmail({
        companyName: dn.company_name ?? 'Mon Entreprise',
        blNumber: dn.blNumber,
        customerName: dn.customer_name,
        deliveryDate: jour(dn.deliveryDate),
      }),
      attachments: [{ filename, content: buffer, contentType: 'application/pdf' }],
    });
  }
}
