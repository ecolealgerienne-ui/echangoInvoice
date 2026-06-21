import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID } from 'class-validator';

export class AdjustStockDto {
  @ApiProperty() @IsUUID() rawMaterialId: string;

  @ApiProperty({ description: 'Nouvelle quantité absolue (inventaire physique)' })
  @IsNumber()
  newQuantity: number;

  @ApiProperty({ enum: ['loss', 'breakage', 'physical_count', 'correction', 'other'] })
  @IsEnum(['loss', 'breakage', 'physical_count', 'correction', 'other'])
  reason: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() notes?: string;
}
