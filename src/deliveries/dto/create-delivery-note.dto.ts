import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Max, Min, ValidateNested } from 'class-validator';
import { PRIX_MAX, QUANTITE_MAX, TAUX_MAX } from '../../common/limits';

export class CreateDeliveryNoteItemDto {
  @ApiProperty() @IsUUID() finishedProductId: string;
  @ApiProperty() @IsNumber() @Max(QUANTITE_MAX) @Min(0.01) quantity: number;
  @ApiProperty() @IsString() @IsNotEmpty() unit: string;
  @ApiProperty() @IsNumber() @Max(PRIX_MAX) @Min(0) unitPrice: number;

  @ApiPropertyOptional() @IsOptional() @IsString() taxName1?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Max(TAUX_MAX) @Min(0) taxRate1?: number;

  @ApiPropertyOptional() @IsOptional() @IsString() taxName2?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Max(TAUX_MAX) @Min(0) taxRate2?: number;
}

export class CreateDeliveryNoteDto {
  @ApiProperty() @IsUUID() customerId: string;
  @ApiProperty() @IsDateString() deliveryDate: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;

  @ApiProperty({ type: [CreateDeliveryNoteItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateDeliveryNoteItemDto)
  items: CreateDeliveryNoteItemDto[];
}
