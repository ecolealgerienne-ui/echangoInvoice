import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsBoolean, IsNumber, Min, MaxLength, MinLength, IsEnum, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';

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
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0)
  defaultSalesPrice?: number;

  @ApiPropertyOptional()
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0)
  lastCostPerUnit?: number;

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
