import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FinishedProduct } from './finished-product.entity';
import { ProductBarcode } from './product-barcode.entity';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { BarcodesService } from './barcodes.service';

@Module({
  imports: [TypeOrmModule.forFeature([FinishedProduct, ProductBarcode])],
  controllers: [ProductsController],
  providers: [ProductsService, BarcodesService],
  exports: [TypeOrmModule],
})
export class ProductsModule {}
