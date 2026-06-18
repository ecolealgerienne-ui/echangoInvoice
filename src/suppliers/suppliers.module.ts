import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Supplier } from './supplier.entity';
import { RawMaterial } from '../raw-materials/raw-material.entity';
import { SuppliersController } from './suppliers.controller';
import { SuppliersService } from './suppliers.service';

@Module({
  imports: [TypeOrmModule.forFeature([Supplier, RawMaterial])],
  controllers: [SuppliersController],
  providers: [SuppliersService],
  exports: [TypeOrmModule],
})
export class SuppliersModule {}
