import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';
import { Type } from 'class-transformer';
import { PRIX_MAX, QUANTITE_MAX } from '../../common/limits';

export class CreateProductDto {
  @ApiPropertyOptional({ enum: ['product', 'material', 'both'], default: 'product' })
  @IsOptional() @IsEnum(['product', 'material', 'both'])
  type?: 'product' | 'material' | 'both';

  @ApiProperty()
  @IsString() @MinLength(2) @MaxLength(255)
  name: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(100)
  code?: string;

  @ApiProperty({ example: 'kg' })
  @IsString() @MaxLength(50)
  unit: string;

  @ApiPropertyOptional()
  @IsOptional() @Type(() => Number) @IsNumber() @Max(PRIX_MAX) @Min(0)
  defaultSalesPrice?: number;

  @ApiPropertyOptional()
  @IsOptional() @Type(() => Number) @IsNumber() @Max(PRIX_MAX) @Min(0)
  lastCostPerUnit?: number;

  @ApiPropertyOptional()
  @IsOptional() @Type(() => Number) @IsNumber() @Max(QUANTITE_MAX) @Min(0)
  alertThreshold?: number;

  @ApiPropertyOptional()
  @IsOptional() @IsUUID()
  supplierId?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  description?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional() @IsBoolean()
  isActive?: boolean;
}
