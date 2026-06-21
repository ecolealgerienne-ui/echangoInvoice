import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsUUID, IsDateString, IsOptional, IsString,
  IsArray, ValidateNested, IsNumber, Min,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class UpdatePoItemDto {
  @ApiProperty()
  @IsUUID()
  rawMaterialId: string;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber() @Min(0.01)
  quantity: number;

  @ApiProperty()
  @IsString()
  unit: string;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber() @Min(0)
  unitPrice: number;
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

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber() @Min(0)
  taxRate?: number;
}
