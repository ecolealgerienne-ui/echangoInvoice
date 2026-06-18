import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SalesInvoice } from './entities/sales-invoice.entity';
import { SalesInvoiceItem } from './entities/sales-invoice-item.entity';
import { Payment } from './entities/payment.entity';
import { Subscription } from '../tenants/entities/subscription.entity';
import { SalesInvoicesService } from './sales-invoices.service';
import { PaymentsService } from './payments.service';
import { InvoicesController } from './invoices.controller';
import { PaymentsController } from './payments.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([SalesInvoice, SalesInvoiceItem, Payment, Subscription]),
  ],
  controllers: [InvoicesController, PaymentsController],
  providers: [SalesInvoicesService, PaymentsService],
  exports: [SalesInvoicesService],
})
export class InvoicesModule {}
