import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Paramètres communs à toutes les listes paginées (R010).
 *
 * `sortBy` n'est pas contraint ici : les colonnes triables diffèrent d'un
 * module à l'autre, et la liste blanche appartient au service qui la connaît
 * (voir `common/tri.ts`). Ce DTO ne garantit que la forme.
 */
export class ListQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500)
  limit: number = 20;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(120)
  search?: string;

  @ApiPropertyOptional({ description: 'Colonne de tri — voir la liste blanche du module' })
  @IsOptional() @IsString() @MaxLength(40)
  sortBy?: string;

  @ApiPropertyOptional({ enum: ['ASC', 'DESC'], default: 'ASC' })
  @IsOptional() @IsIn(['ASC', 'DESC', 'asc', 'desc'])
  sortOrder?: string;
}
