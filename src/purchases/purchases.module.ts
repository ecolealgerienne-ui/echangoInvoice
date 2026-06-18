import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PurchaseOrder } from './entities/purchase-order.entity';
import { PurchaseOrderItem } from './entities/purchase-order-item.entity';
import { ReceptionBL } from './entities/reception-bl.entity';
import { StockEntry } from '../stock/stock-entry.entity';
import { InventorySummary } from '../stock/inventory-summary.entity';
import { RawMaterial } from '../raw-materials/raw-material.entity';
import { PurchasesController } from './purchases.controller';
import { PurchasesService } from './purchases.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PurchaseOrder,
      PurchaseOrderItem,
      ReceptionBL,
      StockEntry,
      InventorySummary,
      RawMaterial,
    ]),
  ],
  controllers: [PurchasesController],
  providers: [PurchasesService],
  exports: [TypeOrmModule],
})
export class PurchasesModule {}
