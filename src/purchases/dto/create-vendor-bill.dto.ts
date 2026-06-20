import { ApiProperty } from '@nestjs/swagger';
import {
  IsUUID, IsDateString, IsOptional, IsString,
  IsArray, ValidateNested, IsNumber, Min, MaxLength,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class CreateVendorBillItemDto {
  @ApiProperty({ required: false })
  @IsOptional() @IsUUID()
  finishedProductId?: string;

  @ApiProperty({ required: false })
  @IsOptional() @IsString() @MaxLength(500)
  description?: string;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber() @Min(0.01)
  quantity: number;

  @ApiProperty()
  @IsString() @MaxLength(50)
  unit: string;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber() @Min(0)
  unitPrice: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @Type(() => Number)
  @IsNumber() @Min(0)
  taxRate?: number;
}

export class CreateVendorBillDto {
  @ApiProperty()
  @IsUUID()
  supplierId: string;

  @ApiProperty({ required: false })
  @IsOptional() @IsUUID()
  purchaseOrderId?: string;

  @ApiProperty({ required: false })
  @IsOptional() @IsUUID()
  receptionBlId?: string;

  @ApiProperty()
  @IsDateString()
  billDate: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @Transform(({ value }) => value === '' ? undefined : value)
  @IsDateString()
  dueDate?: string;

  @ApiProperty({ required: false })
  @IsOptional() @IsString()
  notes?: string;

  @ApiProperty({ type: [CreateVendorBillItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateVendorBillItemDto)
  items: CreateVendorBillItemDto[];
}
