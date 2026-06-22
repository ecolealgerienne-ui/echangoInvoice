import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Min,
} from 'class-validator';

export class CreateProductionMovementDto {
  @ApiProperty({ enum: ['raw_material_consumption', 'finished_product_output', 'scrap', 'adjustment'] })
  @IsIn(['raw_material_consumption', 'finished_product_output', 'scrap', 'adjustment'])
  type: string;

  @ApiPropertyOptional() @IsOptional() @IsUUID() rawMaterialId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() finishedProductId?: string;

  @ApiProperty() @Type(() => Number) @IsNumber() @Min(0.01) quantity: number;

  @ApiProperty() @IsString() @IsNotEmpty() unit: string;

  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}
