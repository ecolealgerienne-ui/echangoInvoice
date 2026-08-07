import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsDateString, IsNumber, IsOptional, IsString, IsUUID, Max, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { PRIX_MAX, QUANTITE_MAX } from '../../common/limits';

export class ReceptionItemDto {
  @ApiProperty()
  @IsUUID()
  rawMaterialId: string;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber() @Max(QUANTITE_MAX) @Min(0.01)
  quantityReceived: number;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber() @Max(PRIX_MAX) @Min(0)
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
