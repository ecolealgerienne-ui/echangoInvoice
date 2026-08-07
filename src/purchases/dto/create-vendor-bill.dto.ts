import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsDateString, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { PRIX_MAX, QUANTITE_MAX, TAUX_MAX } from '../../common/limits';

export class CreateVendorBillItemDto {
  @ApiProperty({ required: false })
  @IsOptional() @IsUUID()
  finishedProductId?: string;

  @ApiProperty({ required: false })
  @IsOptional() @IsString() @MaxLength(500)
  description?: string;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber() @Max(QUANTITE_MAX) @Min(0.01)
  quantity: number;

  @ApiProperty()
  @IsString() @MaxLength(50)
  unit: string;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber() @Max(PRIX_MAX) @Min(0)
  unitPrice: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @Type(() => Number)
  @IsNumber() @Max(TAUX_MAX) @Min(0)
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
