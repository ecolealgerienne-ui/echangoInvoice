import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, IsNull } from 'typeorm';
import { PdfService } from '../common/pdf.service';
import { EmailService } from '../common/email.service';

@Injectable()
export class InvoicePdfService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly pdfService: PdfService,
    private readonly emailService: EmailService,
  ) {}

  private formatCurrency(val: number | string) {
    return new Intl.NumberFormat('fr-DZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(val)) + ' DA';
  }

  private formatDate(val: string | Date) {
    if (!val) return '';
    return new Intl.DateTimeFormat('fr-DZ', { timeZone: 'Africa/Algiers', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(val as string));
  }

  private baseStyles() {
    return `
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #1a1a1a; }
        .page { padding: 20px; }
        .header { display: flex; justify-content: space-between; margin-bottom: 24px; }
        .company-name { font-size: 18px; font-weight: bold; color: #1e3a5f; }
        .company-info { font-size: 10px; color: #555; margin-top: 4px; }
        .doc-title { text-align: right; }
        .doc-number { font-size: 20px; font-weight: bold; color: #1e3a5f; }
        .doc-date { font-size: 10px; color: #555; margin-top: 4px; }
        .parties { display: flex; justify-content: space-between; margin-bottom: 20px; gap: 20px; }
        .party-box { flex: 1; border: 1px solid #dde; border-radius: 4px; padding: 10px; }
        .party-label { font-size: 9px; text-transform: uppercase; color: #888; margin-bottom: 4px; letter-spacing: 0.5px; }
        .party-name { font-weight: bold; font-size: 12px; margin-bottom: 2px; }
        .party-detail { font-size: 10px; color: #444; line-height: 1.5; }
        .legal-ids { display: flex; gap: 12px; margin-top: 4px; }
        .legal-id { font-size: 9px; color: #555; }
        .legal-id span { font-weight: bold; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
        th { background: #1e3a5f; color: white; text-align: left; padding: 7px 8px; font-size: 10px; }
        td { padding: 6px 8px; border-bottom: 1px solid #eee; font-size: 10px; }
        tr:nth-child(even) td { background: #f8f9fb; }
        .text-right { text-align: right; }
        .totals { display: flex; justify-content: flex-end; margin-bottom: 16px; }
        .totals-box { width: 260px; border: 1px solid #dde; border-radius: 4px; overflow: hidden; }
        .total-row { display: flex; justify-content: space-between; padding: 6px 10px; font-size: 10px; border-bottom: 1px solid #eee; }
        .total-row:last-child { border-bottom: none; background: #1e3a5f; color: white; font-weight: bold; font-size: 11px; }
        .notes { border: 1px solid #dde; border-radius: 4px; padding: 10px; font-size: 10px; color: #444; margin-bottom: 16px; }
        .footer { text-align: center; font-size: 9px; color: #aaa; border-top: 1px solid #eee; padding-top: 8px; margin-top: 16px; }
        .badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 9px; font-weight: bold; }
        .badge-draft { background: #f3f4f6; color: #6b7280; }
        .badge-sent { background: #dbeafe; color: #1d4ed8; }
        .badge-paid { background: #d1fae5; color: #065f46; }
        .badge-partial { background: #fef3c7; color: #92400e; }
      </style>
    `;
  }

  private renderParty(label: string, name: string, address: string | null, nif: string | null, rc: string | null, ai: string | null) {
    return `
      <div class="party-box">
        <div class="party-label">${label}</div>
        <div class="party-name">${name}</div>
        ${address ? `<div class="party-detail">${address}</div>` : ''}
        <div class="legal-ids">
          ${nif ? `<div class="legal-id">NIF : <span>${nif}</span></div>` : ''}
          ${rc ? `<div class="legal-id">RC : <span>${rc}</span></div>` : ''}
          ${ai ? `<div class="legal-id">AI : <span>${ai}</span></div>` : ''}
        </div>
      </div>
    `;
  }

  async generateInvoicePdf(invoiceId: string, tenantId: string): Promise<{ buffer: Buffer; filename: string }> {
    const rows = await this.ds.query(
      `SELECT si.*, c.name AS customer_name, c.address AS customer_address,
              c.nif AS customer_nif, c.rc AS customer_rc, c.ai AS customer_ai,
              s.name AS company_name, s."companyAddress" AS company_address,
              s.nif AS company_nif, s.rc AS company_rc, s.ai AS company_ai,
              s.logo AS company_logo
       FROM sales_invoices si
       JOIN customers c ON c.id = si."customerId"
       LEFT JOIN settings s ON s."tenantId" = si."tenantId"
       WHERE si.id = $1 AND si."tenantId" = $2 AND si."deletedAt" IS NULL`,
      [invoiceId, tenantId],
    );
    if (!rows.length) throw new NotFoundException('invoice_not_found');

    const inv = rows[0];
    const items = await this.ds.query(
      `SELECT * FROM sales_invoice_items WHERE "salesInvoiceId" = $1`,
      [invoiceId],
    );

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">${this.baseStyles()}</head><body>
      <div class="page">
        <div class="header">
          <div style="display:flex; align-items:flex-start; gap:12px;">
            ${inv.company_logo ? `<img src="${inv.company_logo}" style="max-height:60px; max-width:140px; object-fit:contain;" alt="logo"/>` : ''}
            <div>
              <div class="company-name">${inv.company_name ?? 'Mon Entreprise'}</div>
              <div class="company-info">${inv.company_address ?? ''}</div>
              <div class="company-info">NIF: ${inv.company_nif ?? ''} | RC: ${inv.company_rc ?? ''}</div>
            </div>
          </div>
          <div class="doc-title">
            <div class="doc-number">FACTURE N° ${inv.invoiceNumber}</div>
            <div class="doc-date">Date : ${this.formatDate(inv.invoiceDate)}</div>
            ${inv.dueDate ? `<div class="doc-date">Échéance : ${this.formatDate(inv.dueDate)}</div>` : ''}
          </div>
        </div>

        <div class="parties">
          ${this.renderParty('Émetteur', inv.company_name ?? '', inv.company_address, inv.company_nif, inv.company_rc, inv.company_ai)}
          ${this.renderParty('Destinataire', inv.customer_name, inv.customer_address, inv.customer_nif, inv.customer_rc, inv.customer_ai)}
        </div>

        <table>
          <thead>
            <tr>
              <th style="width:45%">Description</th>
              <th class="text-right" style="width:10%">Qté</th>
              <th class="text-right" style="width:15%">P.U. HT</th>
              <th class="text-right" style="width:10%">TVA</th>
              <th class="text-right" style="width:20%">Total TTC</th>
            </tr>
          </thead>
          <tbody>
            ${items.map((item: any) => `
              <tr>
                <td>${item.description ?? item.finishedProductId ?? ''}</td>
                <td class="text-right">${Number(item.quantity).toFixed(2)} ${item.unit ?? ''}</td>
                <td class="text-right">${this.formatCurrency(item.unitPrice)}</td>
                <td class="text-right">${item.taxRate1 ? Number(item.taxRate1).toFixed(0) + '%' : '—'}</td>
                <td class="text-right">${this.formatCurrency(item.lineTotal)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="totals">
          <div class="totals-box">
            <div class="total-row"><span>Sous-total HT</span><span>${this.formatCurrency(inv.subtotal)}</span></div>
            <div class="total-row"><span>TVA</span><span>${this.formatCurrency(inv.taxAmount)}</span></div>
            <div class="total-row"><span>TOTAL TTC</span><span>${this.formatCurrency(inv.totalAmount)}</span></div>
          </div>
        </div>

        ${inv.amountPaid > 0 ? `
          <div class="totals">
            <div class="totals-box">
              <div class="total-row"><span>Montant payé</span><span>${this.formatCurrency(inv.amountPaid)}</span></div>
              <div class="total-row"><span>Solde dû</span><span>${this.formatCurrency(inv.amountDue)}</span></div>
            </div>
          </div>
        ` : ''}

        ${inv.notes ? `<div class="notes"><strong>Notes :</strong> ${inv.notes}</div>` : ''}
        <div class="footer">Document généré électroniquement — Echango Invoice</div>
      </div>
    </body></html>`;

    const { buffer } = await this.pdfService.generateAndArchive({
      type: 'FACTURES',
      filename: inv.invoiceNumber,
      html,
    });
    return { buffer, filename: `${inv.invoiceNumber}.pdf` };
  }

  async generateDeliveryNotePdf(dnId: string, tenantId: string): Promise<{ buffer: Buffer; filename: string }> {
    const rows = await this.ds.query(
      `SELECT dn.*, c.name AS customer_name, c.address AS customer_address,
              c.nif AS customer_nif, c.rc AS customer_rc,
              s.name AS company_name, s."companyAddress" AS company_address,
              s.nif AS company_nif, s.rc AS company_rc,
              s.logo AS company_logo
       FROM delivery_notes dn
       JOIN customers c ON c.id = dn."customerId"
       LEFT JOIN settings s ON s."tenantId" = dn."tenantId"
       WHERE dn.id = $1 AND dn."tenantId" = $2 AND dn."deletedAt" IS NULL`,
      [dnId, tenantId],
    );
    if (!rows.length) throw new NotFoundException('delivery_note_not_found');

    const dn = rows[0];
    const items = await this.ds.query(
      `SELECT dni.*, fp.name AS product_name FROM delivery_note_items dni
       LEFT JOIN finished_products fp ON fp.id = dni."finishedProductId"
       WHERE dni."deliveryNoteId" = $1`,
      [dnId],
    );

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">${this.baseStyles()}</head><body>
      <div class="page">
        <div class="header">
          <div style="display:flex; align-items:flex-start; gap:12px;">
            ${dn.company_logo ? `<img src="${dn.company_logo}" style="max-height:60px; max-width:140px; object-fit:contain;" alt="logo"/>` : ''}
            <div>
              <div class="company-name">${dn.company_name ?? 'Mon Entreprise'}</div>
              <div class="company-info">${dn.company_address ?? ''}</div>
              <div class="company-info">NIF: ${dn.company_nif ?? ''} | RC: ${dn.company_rc ?? ''}</div>
            </div>
          </div>
          <div class="doc-title">
            <div class="doc-number">BON DE LIVRAISON N° ${dn.blNumber}</div>
            <div class="doc-date">Date : ${this.formatDate(dn.deliveryDate)}</div>
          </div>
        </div>

        <div class="parties">
          ${this.renderParty('Expéditeur', dn.company_name ?? '', dn.company_address, dn.company_nif, dn.company_rc, null)}
          ${this.renderParty('Destinataire', dn.customer_name, dn.customer_address, dn.customer_nif, dn.customer_rc, null)}
        </div>

        <table>
          <thead>
            <tr>
              <th style="width:50%">Produit</th>
              <th class="text-right" style="width:15%">Quantité</th>
              <th class="text-right" style="width:15%">P.U. HT</th>
              <th class="text-right" style="width:20%">Total TTC</th>
            </tr>
          </thead>
          <tbody>
            ${items.map((item: any) => `
              <tr>
                <td>${item.product_name ?? item.finishedProductId}</td>
                <td class="text-right">${Number(item.quantity).toFixed(2)} ${item.unit ?? ''}</td>
                <td class="text-right">${this.formatCurrency(item.unitPrice)}</td>
                <td class="text-right">${this.formatCurrency(item.lineTotal)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="totals">
          <div class="totals-box">
            <div class="total-row"><span>Sous-total HT</span><span>${this.formatCurrency(dn.subtotal)}</span></div>
            <div class="total-row"><span>TVA</span><span>${this.formatCurrency(dn.taxAmount)}</span></div>
            <div class="total-row"><span>TOTAL TTC</span><span>${this.formatCurrency(dn.total)}</span></div>
          </div>
        </div>

        ${dn.notes ? `<div class="notes"><strong>Notes :</strong> ${dn.notes}</div>` : ''}

        <div style="display:flex; justify-content:space-between; margin-top:30px;">
          <div style="text-align:center; width:200px;">
            <div style="border-top:1px solid #333; padding-top:4px; font-size:10px;">Signature expéditeur</div>
          </div>
          <div style="text-align:center; width:200px;">
            <div style="border-top:1px solid #333; padding-top:4px; font-size:10px;">Signature destinataire</div>
          </div>
        </div>

        <div class="footer">Document généré électroniquement — Echango Invoice</div>
      </div>
    </body></html>`;

    const { buffer } = await this.pdfService.generateAndArchive({
      type: 'BL',
      filename: dn.blNumber,
      html,
    });
    return { buffer, filename: `${dn.blNumber}.pdf` };
  }

  async sendInvoiceEmail(invoiceId: string, tenantId: string): Promise<void> {
    const rows = await this.ds.query(
      `SELECT si.*, c.name AS customer_name, c.email AS customer_email,
              s.name AS company_name
       FROM sales_invoices si
       JOIN customers c ON c.id = si."customerId"
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
        totalAmount: this.formatCurrency(inv.totalAmount),
        dueDate: this.formatDate(inv.dueDate),
      }),
      attachments: [{ filename, content: buffer, contentType: 'application/pdf' }],
    });
  }

  async sendDeliveryNoteEmail(dnId: string, tenantId: string): Promise<void> {
    const rows = await this.ds.query(
      `SELECT dn.*, c.name AS customer_name, c.email AS customer_email,
              s.name AS company_name
       FROM delivery_notes dn
       JOIN customers c ON c.id = dn."customerId"
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
        deliveryDate: this.formatDate(dn.deliveryDate),
      }),
      attachments: [{ filename, content: buffer, contentType: 'application/pdf' }],
    });
  }

  async generateQuotePdf(quoteId: string, tenantId: string): Promise<{ buffer: Buffer; filename: string }> {
    const rows = await this.ds.query(
      `SELECT q.*, c.name AS customer_name, c.address AS customer_address,
              c.nif AS customer_nif, c.rc AS customer_rc, c.ai AS customer_ai,
              s.name AS company_name, s."companyAddress" AS company_address,
              s.nif AS company_nif, s.rc AS company_rc, s.ai AS company_ai,
              s.logo AS company_logo
       FROM quotes q
       JOIN customers c ON c.id = q."customerId"
       LEFT JOIN settings s ON s."tenantId" = q."tenantId"
       WHERE q.id = $1 AND q."tenantId" = $2 AND q."deletedAt" IS NULL`,
      [quoteId, tenantId],
    );
    if (!rows.length) throw new NotFoundException('quote_not_found');

    const q = rows[0];
    const items = await this.ds.query(
      `SELECT qi.*, fp.name AS product_name FROM quote_items qi
       LEFT JOIN finished_products fp ON fp.id = qi."finishedProductId"
       WHERE qi."quoteId" = $1`,
      [quoteId],
    );

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">${this.baseStyles()}</head><body>
      <div class="page">
        <div class="header">
          <div style="display:flex; align-items:flex-start; gap:12px;">
            ${q.company_logo ? `<img src="${q.company_logo}" style="max-height:60px; max-width:140px; object-fit:contain;" alt="logo"/>` : ''}
            <div>
              <div class="company-name">${q.company_name ?? 'Mon Entreprise'}</div>
              <div class="company-info">${q.company_address ?? ''}</div>
              <div class="company-info">NIF: ${q.company_nif ?? ''} | RC: ${q.company_rc ?? ''}</div>
            </div>
          </div>
          <div class="doc-title">
            <div class="doc-number">DEVIS N° ${q.quoteNumber}</div>
            <div class="doc-date">Date : ${this.formatDate(q.quoteDate)}</div>
            ${q.expiryDate ? `<div class="doc-date">Valide jusqu'au : ${this.formatDate(q.expiryDate)}</div>` : ''}
          </div>
        </div>

        <div class="parties">
          ${this.renderParty('Émetteur', q.company_name ?? '', q.company_address, q.company_nif, q.company_rc, q.company_ai)}
          ${this.renderParty('Destinataire', q.customer_name, q.customer_address, q.customer_nif, q.customer_rc, q.customer_ai)}
        </div>

        <table>
          <thead>
            <tr>
              <th style="width:45%">Produit / Description</th>
              <th class="text-right" style="width:10%">Qté</th>
              <th class="text-right" style="width:15%">P.U. HT</th>
              <th class="text-right" style="width:10%">TVA</th>
              <th class="text-right" style="width:20%">Total TTC</th>
            </tr>
          </thead>
          <tbody>
            ${items.map((item: any) => `
              <tr>
                <td>${item.product_name ?? item.finishedProductId ?? ''}</td>
                <td class="text-right">${Number(item.quantity).toFixed(2)} ${item.unit ?? ''}</td>
                <td class="text-right">${this.formatCurrency(item.unitPrice)}</td>
                <td class="text-right">${item.taxRate1 ? Number(item.taxRate1).toFixed(0) + '%' : '—'}</td>
                <td class="text-right">${this.formatCurrency(item.lineTotal)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="totals">
          <div class="totals-box">
            <div class="total-row"><span>Sous-total HT</span><span>${this.formatCurrency(q.subtotal)}</span></div>
            <div class="total-row"><span>TVA</span><span>${this.formatCurrency(q.taxAmount)}</span></div>
            <div class="total-row"><span>TOTAL TTC</span><span>${this.formatCurrency(q.totalAmount)}</span></div>
          </div>
        </div>

        ${q.notes ? `<div class="notes"><strong>Notes :</strong> ${q.notes}</div>` : ''}

        <div style="display:flex; justify-content:space-between; margin-top:30px;">
          <div style="text-align:center; width:200px;">
            <div style="border-top:1px solid #333; padding-top:4px; font-size:10px;">Signature émetteur</div>
          </div>
          <div style="text-align:center; width:200px;">
            <div style="border-top:1px solid #333; padding-top:4px; font-size:10px;">Bon pour accord</div>
          </div>
        </div>

        <div class="footer">Ce devis est valable 30 jours — Echango Invoice</div>
      </div>
    </body></html>`;

    const { buffer } = await this.pdfService.generateAndArchive({
      type: 'DEVIS' as any,
      filename: q.quoteNumber,
      html,
    });
    return { buffer, filename: `${q.quoteNumber}.pdf` };
  }
}
