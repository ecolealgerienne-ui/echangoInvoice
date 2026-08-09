import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsBoolean, IsNumber, IsOptional,
  IsString, IsUUID, Max, MaxLength, Min, MinLength, ValidateNested,
} from 'class-validator';
import { PRIX_MAX } from '../../common/limits';

export class CreatePriceListDto {
  @ApiProperty({ example: 'Grossistes' })
  @IsString() @MinLength(2) @MaxLength(120)
  name: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  description?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional() @IsBoolean()
  isActive?: boolean;
}

export class PriceListItemDto {
  @ApiProperty()
  @IsUUID()
  finishedProductId: string;

  // Borné comme partout ailleurs : ce que la base refuse, l'entrée doit le
  // refuser d'abord, sinon Postgres rend un 500 là où un 422 est dû (R021).
  @ApiProperty({ example: 1250.5 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(PRIX_MAX)
  @Type(() => Number)
  unitPrice: number;
}

export class SetPriceListItemsDto {
  @ApiProperty({ type: [PriceListItemDto] })
  @IsArray()
  // Le catalogue de démo compte 200 articles ; 2000 laisse de la marge sans
  // ouvrir la porte à une charge utile démesurée.
  @ArrayMaxSize(2000)
  @ValidateNested({ each: true })
  @Type(() => PriceListItemDto)
  items: PriceListItemDto[];
}
