import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID } from 'class-validator';

export class AdjustStockDto {
  @ApiProperty() @IsUUID() rawMaterialId: string;

  @ApiProperty({ description: 'Positif = ajout, négatif = retrait' })
  @IsNumber()
  quantityAdjustment: number;

  @ApiProperty({ enum: ['loss', 'breakage', 'physical_count', 'correction', 'other'] })
  @IsEnum(['loss', 'breakage', 'physical_count', 'correction', 'other'])
  reason: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() notes?: string;
}
