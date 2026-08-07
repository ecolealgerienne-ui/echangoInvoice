import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { PRIX_MAX, QUANTITE_MAX } from '../../common/limits';

/**
 * Un `<select>` non renseigné envoie `''`, pas `undefined` — or `@IsOptional()`
 * ne saute la validation que sur `undefined` et `null`. Sans cette conversion,
 * créer un article sans choisir de fournisseur rend
 * « 400 supplierId must be a UUID », que l'utilisateur ne peut pas comprendre.
 */
const chaineVideVersUndefined = () =>
  Transform(({ value }) => (value === '' ? undefined : value));

export class CreateProductDto {
  @ApiPropertyOptional({ enum: ['product', 'material', 'both'], default: 'product' })
  @IsOptional() @IsEnum(['product', 'material', 'both'])
  type?: 'product' | 'material' | 'both';

  @ApiProperty()
  @IsString() @MinLength(2) @MaxLength(255)
  name: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(100)
  code?: string;

  @ApiProperty({ example: 'kg' })
  @IsString() @MaxLength(50)
  unit: string;

  @ApiPropertyOptional()
  @IsOptional() @Type(() => Number) @IsNumber() @Max(PRIX_MAX) @Min(0)
  defaultSalesPrice?: number;

  @ApiPropertyOptional()
  @IsOptional() @Type(() => Number) @IsNumber() @Max(PRIX_MAX) @Min(0)
  lastCostPerUnit?: number;

  @ApiPropertyOptional()
  @IsOptional() @Type(() => Number) @IsNumber() @Max(QUANTITE_MAX) @Min(0)
  alertThreshold?: number;

  @ApiPropertyOptional()
  @chaineVideVersUndefined() @IsOptional() @IsUUID()
  supplierId?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  description?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional() @IsBoolean()
  isActive?: boolean;
}
