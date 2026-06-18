import { ApiProperty } from '@nestjs/swagger';
import {
  IsUUID, IsDateString, IsOptional, IsString,
  IsArray, ValidateNested, IsNumber, Min, MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreatePurchaseOrderItemDto {
  @ApiProperty()
  @IsUUID()
  rawMaterialId: string;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber() @Min(0.01)
  quantity: number;

  @ApiProperty({ example: 'kg' })
  @IsString() @MaxLength(50)
  unit: string;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber() @Min(0)
  unitPrice: number;
}

export class CreatePurchaseOrderDto {
  @ApiProperty()
  @IsUUID()
  supplierId: string;

  @ApiProperty({ example: '2026-06-18' })
  @IsDateString()
  orderDate: string;

  @ApiProperty({ required: false })
  @IsOptional() @IsDateString()
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
