import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { QUANTITE_MAX } from '../../common/limits';

export const TYPES_CODE_BARRES = ['EAN13', 'EAN8', 'UPCA', 'CODE128', 'INTERNE'] as const;

export class CreateBarcodeDto {
  @ApiProperty({ example: '3017620422003' })
  @IsString() @MaxLength(64)
  barcode: string;

  /** Omis, il est déduit de la forme du code (clé de contrôle comprise). */
  @ApiPropertyOptional({ enum: TYPES_CODE_BARRES })
  @IsOptional() @IsIn(TYPES_CODE_BARRES as unknown as string[])
  type?: 'EAN13' | 'EAN8' | 'UPCA' | 'CODE128' | 'INTERNE';

  /** Unités de stock que représente ce code : 12 pour un carton de douze. */
  @ApiPropertyOptional({ default: 1 })
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0.01) @Max(QUANTITE_MAX)
  packQuantity?: number;

  @ApiPropertyOptional({ description: "Le code proposé par défaut à l'étiquetage" })
  @IsOptional() @IsBoolean()
  isPrimary?: boolean;

  @ApiPropertyOptional({ example: 'Carton de 12' })
  @IsOptional() @IsString() @MaxLength(60)
  label?: string;
}
