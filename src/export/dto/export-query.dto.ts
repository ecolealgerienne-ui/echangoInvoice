import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsDateString, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';

/**
 * `@IsOptional` ne laisse passer que `undefined` et `null` : un `<select>`
 * vidé envoie une chaîne vide, qui échouerait sur `@IsUUID`. La conversion
 * est faite ici plutôt que sur chaque écran (même défaut déjà rencontré sur
 * supplierId puis priceListId).
 */
const videEnAbsent = () =>
  Transform(({ value }) => (value === '' || value === undefined ? undefined : value));

export class ExportQueryDto {
  @ApiPropertyOptional({
    enum: ['fr', 'intl'],
    default: 'fr',
    description: 'fr : point-virgule et décimale à virgule, pour Excel francophone.',
  })
  @IsOptional()
  @videEnAbsent()
  @IsEnum(['fr', 'intl'])
  dialect?: 'fr' | 'intl';

  @ApiPropertyOptional() @IsOptional() @videEnAbsent() @IsDateString() dateFrom?: string;
  @ApiPropertyOptional() @IsOptional() @videEnAbsent() @IsDateString() dateTo?: string;
  @ApiPropertyOptional() @IsOptional() @videEnAbsent() @IsString() status?: string;
  @ApiPropertyOptional() @IsOptional() @videEnAbsent() @IsUUID() customerId?: string;
  @ApiPropertyOptional() @IsOptional() @videEnAbsent() @IsUUID() supplierId?: string;

  @ApiPropertyOptional({ enum: ['product', 'material'] })
  @IsOptional()
  @videEnAbsent()
  @IsEnum(['product', 'material'])
  type?: string;

  @ApiPropertyOptional({ description: 'Catégorie de dépense.' })
  @IsOptional()
  @videEnAbsent()
  @IsString()
  category?: string;
}
