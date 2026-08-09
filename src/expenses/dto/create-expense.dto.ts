import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean, IsDateString, IsEnum, IsIn, IsNotEmpty, IsNumber,
  IsOptional, IsString, IsUUID, Max, MaxLength, Min,
} from 'class-validator';
import { MONTANT_MAX, TAUX_MAX } from '../../common/limits';

const CATEGORIES = ['loyer', 'utilities', 'transport', 'rh', 'maintenance', 'other'] as const;

export class CreateExpenseDto {
  @ApiProperty() @IsDateString() expenseDate: string;
  @ApiProperty() @IsString() @IsNotEmpty() description: string;
  @ApiProperty({ enum: CATEGORIES }) @IsEnum(CATEGORIES) category: string;
  @ApiProperty() @IsNumber() @Max(MONTANT_MAX) @Min(0.01) amount: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) notes?: string;

  /** Fournisseur, quand la dépense vient d'une facture. */
  @ApiPropertyOptional() @IsOptional() @IsUUID()
  supplierId?: string;

  @ApiPropertyOptional({ enum: ['cash', 'bank_transfer', 'cheque', 'other'] })
  @IsOptional() @IsIn(['cash', 'bank_transfer', 'cheque', 'other'])
  paymentMethod?: string;

  /**
   * TVA récupérable. Le taux sert à la calculer quand le montant n'est pas
   * fourni : sur un justificatif algérien, c'est souvent le taux qu'on lit et
   * le TTC qu'on saisit.
   */
  @ApiPropertyOptional({ example: 19 })
  @IsOptional() @IsNumber() @Min(0) @Max(TAUX_MAX)
  vatRate?: number;

  @ApiPropertyOptional({ description: 'Montant de TVA récupérable ; déduit du taux si absent' })
  @IsOptional() @IsNumber() @Min(0) @Max(MONTANT_MAX)
  vatAmount?: number;

  @ApiPropertyOptional({ description: 'Loyer, salaires — signalé pour être repéré' })
  @IsOptional() @IsBoolean()
  isRecurring?: boolean;
}
