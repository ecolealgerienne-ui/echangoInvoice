import { ApiProperty } from '@nestjs/swagger';
import {
  IsUUID, IsDateString, IsOptional, IsString,
  IsArray, ValidateNested, IsNumber, Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ReceptionItemDto {
  @ApiProperty()
  @IsUUID()
  rawMaterialId: string;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber() @Min(0.01)
  quantityReceived: number;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber() @Min(0)
  costPerUnit: number;

  @ApiProperty({ required: false })
  @IsOptional() @IsString()
  batchNumber?: string;

  @ApiProperty({ required: false })
  @IsOptional() @IsDateString()
  expiresAt?: string;
}

export class CreateReceptionBlDto {
  @ApiProperty()
  @IsUUID()
  purchaseOrderId: string;

  @ApiProperty({ example: '2026-06-20' })
  @IsDateString()
  receptionDate: string;

  @ApiProperty({ required: false })
  @IsOptional() @IsString()
  notes?: string;

  @ApiProperty({ type: [ReceptionItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReceptionItemDto)
  items: ReceptionItemDto[];
}
