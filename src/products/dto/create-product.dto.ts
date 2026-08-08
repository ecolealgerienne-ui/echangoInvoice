import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { PRIX_MAX, QUANTITE_MAX, TAUX_MAX } from '../../common/limits';

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

  /** Nul = on retombe sur le taux par défaut des réglages. */
  @ApiPropertyOptional({ description: "Taux de TVA propre à l'article (19 ou 9 en Algérie)" })
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(TAUX_MAX)
  taxRate?: number;

  @ApiPropertyOptional({ example: 'Produits laitiers' })
  @IsOptional() @IsString() @MaxLength(80)
  category?: string;

  // Mêmes contraintes que le logo : la valeur finit dans un attribut `src`.
  @ApiPropertyOptional({ description: "Data URL base64 de la photo" })
  @IsOptional() @IsString() @MaxLength(700_000)
  @Matches(/^data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+/]+={0,2}$/, {
    message: 'errors.image_invalid_format',
  })
  imageUrl?: string;

  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(QUANTITE_MAX)
  minStock?: number;

  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(QUANTITE_MAX)
  maxStock?: number;

  @ApiPropertyOptional({ description: "Unités de stock dans un conditionnement de vente" })
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0.01) @Max(QUANTITE_MAX)
  packQuantity?: number;

  @ApiPropertyOptional({ example: 'carton' })
  @IsOptional() @IsString() @MaxLength(50)
  packUnit?: string;

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
