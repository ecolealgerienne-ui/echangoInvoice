import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SalesInvoice } from './entities/sales-invoice.entity';
import { SalesInvoiceItem } from './entities/sales-invoice-item.entity';
import { Payment } from './entities/payment.entity';
import { CreditNote } from './entities/credit-note.entity';
import { CreditNoteItem } from './entities/credit-note-item.entity';
import { Subscription } from '../tenants/entities/subscription.entity';
import { SalesInvoicesService } from './sales-invoices.service';
import { PaymentsService } from './payments.service';
import { CreditNotesService } from './credit-notes/credit-notes.service';
import { InvoicePdfService } from './invoice-pdf.service';
import { PdfService } from '../common/pdf.service';
import { EmailService } from '../common/email.service';
import { InvoicesController } from './invoices.controller';
import { PaymentsController } from './payments.controller';
import { CreditNotesController } from './credit-notes/credit-notes.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SalesInvoice, SalesInvoiceItem, Payment,
      CreditNote, CreditNoteItem, Subscription,
    ]),
  ],
  controllers: [InvoicesController, PaymentsController, CreditNotesController],
  providers: [SalesInvoicesService, PaymentsService, CreditNotesService, InvoicePdfService, PdfService, EmailService],
  exports: [SalesInvoicesService, InvoicePdfService, PdfService, EmailService],
})
export class InvoicesModule {}
