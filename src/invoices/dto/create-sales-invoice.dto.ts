import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Max, Min, ValidateNested } from 'class-validator';
import { PRIX_MAX, QUANTITE_MAX, TAUX_MAX } from '../../common/limits';

export class CreateSalesInvoiceItemDto {
  @ApiProperty() @IsUUID() finishedProductId: string;
  @ApiProperty() @IsNumber() @Max(QUANTITE_MAX) @Min(0.01) quantity: number;
  @ApiProperty() @IsString() @IsNotEmpty() unit: string;
  @ApiProperty() @IsNumber() @Max(PRIX_MAX) @Min(0) unitPrice: number;

  @ApiPropertyOptional() @IsOptional() @IsString() taxName1?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Max(TAUX_MAX) @Min(0) taxRate1?: number;

  @ApiPropertyOptional() @IsOptional() @IsString() taxName2?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Max(TAUX_MAX) @Min(0) taxRate2?: number;
}

export const MODES_REGLEMENT = ['cash', 'bank_transfer', 'cheque', 'other'] as const;

export class CreateSalesInvoiceDto {
  /**
   * Mode de règlement prévu. Seules les espèces déclenchent le droit de timbre ;
   * le montant, lui, est calculé côté serveur (R008).
   */
  @ApiPropertyOptional({ enum: MODES_REGLEMENT, default: 'other' })
  @IsOptional() @IsIn(MODES_REGLEMENT as unknown as string[])
  paymentMode?: string;

  @ApiProperty() @IsUUID() customerId: string;
  @ApiProperty() @IsDateString() invoiceDate: string;

  @ApiPropertyOptional() @IsOptional() @IsDateString() dueDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;

  // Mode BL : items copiés depuis le BL
  @ApiPropertyOptional() @IsOptional() @IsUUID() deliveryNoteId?: string;

  // Mode devis : items copiés depuis le devis
  @ApiPropertyOptional() @IsOptional() @IsUUID() quoteId?: string;

  // Mode standalone : items fournis manuellement
  @ApiPropertyOptional({ type: [CreateSalesInvoiceItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSalesInvoiceItemDto)
  items?: CreateSalesInvoiceItemDto[];
}
