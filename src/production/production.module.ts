import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Nomenclature } from './nomenclature.entity';
import { BomLine } from './bom-line.entity';
import { ProductionOrder } from './production-order.entity';
import { ProductionMovement } from './production-movement.entity';
import { NomenclatureService } from './nomenclature.service';
import { ProductionOrderService } from './production-order.service';
import { ProductionMovementService } from './production-movement.service';
import { ProductionDashboardService } from './production-dashboard.service';
import { NomenclatureController } from './nomenclature.controller';
import { ProductionOrderController } from './production-order.controller';
import { ProductionDashboardController } from './production-dashboard.controller';
import { ProductionModuleGuard } from './production-module.guard';
import { RawMaterial } from '../raw-materials/raw-material.entity';
import { FinishedProduct } from '../products/finished-product.entity';
import { Setting } from '../settings/setting.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Nomenclature,
      BomLine,
      ProductionOrder,
      ProductionMovement,
      RawMaterial,
      FinishedProduct,
      Setting,
    ]),
  ],
  controllers: [
    NomenclatureController,
    ProductionOrderController,
    ProductionDashboardController,
  ],
  providers: [
    NomenclatureService,
    ProductionOrderService,
    ProductionMovementService,
    ProductionDashboardService,
    ProductionModuleGuard,
  ],
  exports: [NomenclatureService, ProductionOrderService, ProductionMovementService],
})
export class ProductionModule {}
