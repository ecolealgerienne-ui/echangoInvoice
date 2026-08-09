import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsDateString, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { PRIX_MAX, QUANTITE_MAX, TAUX_MAX } from '../../common/limits';

export class CreatePurchaseOrderItemDto {
  @ApiProperty()
  @IsUUID()
  rawMaterialId: string;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber() @Max(QUANTITE_MAX) @Min(0.01)
  quantity: number;

  @ApiProperty({ example: 'kg' })
  @IsString() @MaxLength(50)
  unit: string;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber() @Max(PRIX_MAX) @Min(0)
  unitPrice: number;

  @ApiPropertyOptional({ example: 19 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber() @Max(TAUX_MAX) @Min(0)
  taxRate?: number;
}

export class CreatePurchaseOrderDto {
  @ApiProperty()
  @IsUUID()
  supplierId: string;

  @ApiProperty({ example: '2026-06-18' })
  @IsDateString()
  orderDate: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @Transform(({ value }) => value === '' ? undefined : value)
  @IsDateString()
  expectedDeliveryDate?: string;

  @ApiProperty({ required: false })
  @IsOptional() @IsString()
  notes?: string;

  @ApiProperty({ type: [CreatePurchaseOrderItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreatePurchaseOrderItemDto)
  items: CreatePurchaseOrderItemDto[];
}
