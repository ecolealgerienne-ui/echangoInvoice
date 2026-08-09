import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FinishedProduct } from './finished-product.entity';
import { ProductBarcode } from './product-barcode.entity';
import { ProductSupplier } from './product-supplier.entity';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { BarcodesService } from './barcodes.service';
import { ProductSuppliersService } from './product-suppliers.service';

@Module({
  imports: [TypeOrmModule.forFeature([FinishedProduct, ProductBarcode, ProductSupplier])],
  controllers: [ProductsController],
  providers: [ProductsService, BarcodesService, ProductSuppliersService],
  exports: [TypeOrmModule],
})
export class ProductsModule {}
