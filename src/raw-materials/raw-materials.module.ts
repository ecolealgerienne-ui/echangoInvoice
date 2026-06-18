import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RawMaterial } from './raw-material.entity';
import { RawMaterialsController } from './raw-materials.controller';
import { RawMaterialsService } from './raw-materials.service';

@Module({
  imports: [TypeOrmModule.forFeature([RawMaterial])],
  controllers: [RawMaterialsController],
  providers: [RawMaterialsService],
  exports: [TypeOrmModule],
})
export class RawMaterialsModule {}
