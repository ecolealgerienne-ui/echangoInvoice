import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Quote } from './entities/quote.entity';
import { QuoteItem } from './entities/quote-item.entity';
import { QuotesService } from './quotes.service';
import { QuotesController } from './quotes.controller';
import { InvoicesModule } from '../invoices/invoices.module';
import { DeliveriesModule } from '../deliveries/deliveries.module';

@Module({
  imports: [TypeOrmModule.forFeature([Quote, QuoteItem]), InvoicesModule, DeliveriesModule],
  controllers: [QuotesController],
  providers: [QuotesService],
  exports: [QuotesService],
})
export class QuotesModule {}
