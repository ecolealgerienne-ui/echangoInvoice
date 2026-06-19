import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  attachments?: Array<{ filename: string; content: Buffer; contentType: string }>;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter | null = null;

  private getTransporter(): nodemailer.Transporter {
    if (!this.transporter) {
      const host = process.env.EMAIL_SMTP_HOST;
      const port = process.env.EMAIL_SMTP_PORT;
      const user = process.env.EMAIL_SMTP_USER;
      const pass = process.env.EMAIL_SMTP_PASSWORD;

      if (!host || !port || !user || !pass) {
        throw new Error('[EmailService] SMTP not configured — missing EMAIL_SMTP_* env vars');
      }

      this.transporter = nodemailer.createTransport({
        host,
        port: Number(port),
        secure: Number(port) === 465,
        auth: { user, pass },
      });
    }
    return this.transporter;
  }

  async send(options: SendEmailOptions): Promise<void> {
    const from = process.env.EMAIL_SMTP_USER ?? 'noreply@echango.dz';
    try {
      const transport = this.getTransporter();
      await transport.sendMail({
        from,
        to: options.to,
        subject: options.subject,
        html: options.html,
        attachments: options.attachments?.map(a => ({
          filename: a.filename,
          content: a.content,
          contentType: a.contentType,
        })),
      });
      this.logger.log(`Email envoyé à ${options.to} — ${options.subject}`);
    } catch (err) {
      this.logger.error(`Échec envoi email à ${options.to}`, (err as Error).stack);
      throw err;
    }
  }

  buildInvoiceEmail(params: {
    companyName: string;
    invoiceNumber: string;
    customerName: string;
    totalAmount: string;
    dueDate: string;
  }): string {
    return `
      <!DOCTYPE html><html><head><meta charset="utf-8"></head>
      <body style="font-family:Arial,sans-serif;font-size:14px;color:#333;max-width:600px;margin:0 auto;padding:20px">
        <div style="border-bottom:3px solid #1e3a5f;padding-bottom:16px;margin-bottom:24px">
          <h2 style="color:#1e3a5f;margin:0">${params.companyName}</h2>
        </div>
        <p>Bonjour ${params.customerName},</p>
        <p>Veuillez trouver ci-joint votre facture <strong>${params.invoiceNumber}</strong>.</p>
        <div style="background:#f8f9fb;border-radius:6px;padding:16px;margin:20px 0">
          <p style="margin:4px 0"><strong>Montant TTC :</strong> ${params.totalAmount}</p>
          <p style="margin:4px 0"><strong>Date d'échéance :</strong> ${params.dueDate}</p>
        </div>
        <p>Pour toute question, n'hésitez pas à nous contacter.</p>
        <p>Cordialement,<br><strong>${params.companyName}</strong></p>
        <div style="border-top:1px solid #eee;margin-top:24px;padding-top:12px;font-size:11px;color:#999">
          Document généré par Echango Invoice
        </div>
      </body></html>
    `;
  }

  buildDeliveryNoteEmail(params: {
    companyName: string;
    blNumber: string;
    customerName: string;
    deliveryDate: string;
  }): string {
    return `
      <!DOCTYPE html><html><head><meta charset="utf-8"></head>
      <body style="font-family:Arial,sans-serif;font-size:14px;color:#333;max-width:600px;margin:0 auto;padding:20px">
        <div style="border-bottom:3px solid #1e3a5f;padding-bottom:16px;margin-bottom:24px">
          <h2 style="color:#1e3a5f;margin:0">${params.companyName}</h2>
        </div>
        <p>Bonjour ${params.customerName},</p>
        <p>Veuillez trouver ci-joint le bon de livraison <strong>${params.blNumber}</strong> du ${params.deliveryDate}.</p>
        <p>Merci de nous retourner un exemplaire signé.</p>
        <p>Cordialement,<br><strong>${params.companyName}</strong></p>
        <div style="border-top:1px solid #eee;margin-top:24px;padding-top:12px;font-size:11px;color:#999">
          Document généré par Echango Invoice
        </div>
      </body></html>
    `;
  }

  buildReminderEmail(params: {
    companyName: string;
    invoiceNumber: string;
    customerName: string;
    totalAmount: string;
    amountDue: string;
    dueDate: string;
    daysOverdue: number;
  }): string {
    const urgency = params.daysOverdue >= 21
      ? 'URGENT — ' : params.daysOverdue >= 14
      ? 'Rappel — ' : 'Rappel — ';
    return `
      <!DOCTYPE html><html><head><meta charset="utf-8"></head>
      <body style="font-family:Arial,sans-serif;font-size:14px;color:#333;max-width:600px;margin:0 auto;padding:20px">
        <div style="border-bottom:3px solid #1e3a5f;padding-bottom:16px;margin-bottom:24px">
          <h2 style="color:#1e3a5f;margin:0">${params.companyName}</h2>
        </div>
        <p>Bonjour ${params.customerName},</p>
        <p>Sauf erreur de notre part, la facture <strong>${params.invoiceNumber}</strong> reste impayée.</p>
        <div style="background:#fef3c7;border-left:4px solid #f59e0b;border-radius:4px;padding:16px;margin:20px 0">
          <p style="margin:4px 0"><strong>Montant initial :</strong> ${params.totalAmount}</p>
          <p style="margin:4px 0"><strong>Solde dû :</strong> <span style="color:#dc2626;font-size:16px">${params.amountDue}</span></p>
          <p style="margin:4px 0"><strong>Échéance initiale :</strong> ${params.dueDate}</p>
          <p style="margin:4px 0;color:#dc2626"><strong>${urgency}${params.daysOverdue} jours de retard</strong></p>
        </div>
        <p>Nous vous remercions de bien vouloir régulariser cette situation dans les meilleurs délais.</p>
        <p>Cordialement,<br><strong>${params.companyName}</strong></p>
      </body></html>
    `;
  }
}
