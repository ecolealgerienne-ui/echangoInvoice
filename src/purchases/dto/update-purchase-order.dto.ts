import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsDateString, IsNumber, IsOptional, IsString, IsUUID, Max, Min, ValidateNested } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { PRIX_MAX, QUANTITE_MAX, TAUX_MAX } from '../../common/limits';

export class UpdatePoItemDto {
  @ApiProperty()
  @IsUUID()
  rawMaterialId: string;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber() @Max(QUANTITE_MAX) @Min(0.01)
  quantity: number;

  @ApiProperty()
  @IsString()
  unit: string;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber() @Max(PRIX_MAX) @Min(0)
  unitPrice: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber() @Max(TAUX_MAX) @Min(0)
  taxRate?: number;
}

export class UpdatePurchaseOrderDto {
  @ApiProperty({ required: false })
  @IsOptional() @IsUUID()
  supplierId?: string;

  @ApiProperty({ required: false })
  @IsOptional() @IsDateString()
  orderDate?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @Transform(({ value }) => value === '' ? undefined : value)
  @IsDateString()
  expectedDeliveryDate?: string;

  @ApiProperty({ required: false })
  @IsOptional() @IsString()
  notes?: string;

  @ApiProperty({ type: [UpdatePoItemDto], required: false })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdatePoItemDto)
  items?: UpdatePoItemDto[];
}
