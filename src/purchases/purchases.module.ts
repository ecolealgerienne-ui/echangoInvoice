import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PurchaseOrder } from './entities/purchase-order.entity';
import { PurchaseOrderItem } from './entities/purchase-order-item.entity';
import { ReceptionBL } from './entities/reception-bl.entity';
import { VendorBill } from './entities/vendor-bill.entity';
import { VendorBillItem } from './entities/vendor-bill-item.entity';
import { VendorPayment } from './entities/vendor-payment.entity';
import { StockEntry } from '../stock/stock-entry.entity';
import { FinishedProduct } from '../products/finished-product.entity';
import { PurchasesController } from './purchases.controller';
import { PurchasesService } from './purchases.service';
import { PurchasePdfService } from './purchase-pdf.service';
import { PdfService } from '../common/pdf.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PurchaseOrder,
      PurchaseOrderItem,
      ReceptionBL,
      VendorBill,
      VendorBillItem,
      VendorPayment,
      StockEntry,
      FinishedProduct,
    ]),
  ],
  controllers: [PurchasesController],
  providers: [PurchasesService, PurchasePdfService, PdfService],
  exports: [TypeOrmModule],
})
export class PurchasesModule {}
