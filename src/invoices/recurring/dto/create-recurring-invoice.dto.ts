import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsDateString, IsIn, IsInt, IsNotEmpty,
  IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateNested,
} from 'class-validator';
import { PRIX_MAX, QUANTITE_MAX, TAUX_MAX } from '../../../common/limits';
import { FREQUENCES } from '../echeance';

export class RecurringItemDto {
  @ApiProperty() @IsUUID() finishedProductId: string;
  @ApiProperty() @IsNumber() @Min(0.01) @Max(QUANTITE_MAX) quantity: number;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(50) unit: string;
  @ApiProperty() @IsNumber() @Min(0) @Max(PRIX_MAX) unitPrice: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) @Max(TAUX_MAX) taxRate1?: number;
}

export class CreateRecurringInvoiceDto {
  @ApiProperty({ example: 'Abonnement mensuel — Épicerie Centrale' })
  @IsString() @IsNotEmpty() @MaxLength(120)
  label: string;

  @ApiProperty() @IsUUID() customerId: string;

  @ApiProperty({ enum: FREQUENCES })
  @IsIn(FREQUENCES as unknown as string[])
  frequency: string;

  /** Le jour de cette date sert d'ancrage : un abonnement au 31 revient au 31. */
  @ApiProperty({ example: '2026-09-01' })
  @IsDateString()
  startDate: string;

  @ApiPropertyOptional({ description: 'Dernière échéance incluse' })
  @IsOptional() @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ default: 30 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(365)
  paymentTermsDays?: number;

  @ApiPropertyOptional({ enum: ['cash', 'bank_transfer', 'cheque', 'other'], default: 'other' })
  @IsOptional() @IsIn(['cash', 'bank_transfer', 'cheque', 'other'])
  paymentMode?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(2000)
  notes?: string;

  // R021 — une borne haute sur le tableau : sans elle, un envoi de dix mille
  // lignes est accepté puis répété à chaque échéance.
  @ApiProperty({ type: [RecurringItemDto] })
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200)
  @ValidateNested({ each: true }) @Type(() => RecurringItemDto)
  items: RecurringItemDto[];
}
