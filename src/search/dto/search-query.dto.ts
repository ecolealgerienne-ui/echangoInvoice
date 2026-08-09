import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class SearchQueryDto {
  /**
   * R021 — le terme part dans un `ILIKE` sur neuf tables. Le plafond évite
   * qu'une chaîne de plusieurs kilo-octets fasse le tour du schéma.
   */
  @ApiProperty({ example: 'FAC-26' })
  @IsString() @MinLength(2) @MaxLength(120)
  q: string;
}
