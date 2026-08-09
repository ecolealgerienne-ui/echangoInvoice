import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, Matches } from 'class-validator';

const JOUR = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export class DashboardQueryDto {
  /**
   * R021 — ces valeurs alimentent un calcul de dates. Sans borne de format,
   * `?month=abc` produit des bornes `NaN-NaN-01` que Postgres refuse : un 500
   * là où un 400 était dû.
   */
  @ApiPropertyOptional({ example: '2026-08', description: 'Mois AAAA-MM (raccourci)' })
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'errors.invalid_month_format' })
  month?: string;

  @ApiPropertyOptional({ example: '2026-08-01', description: 'Début de période (incluse)' })
  @IsOptional()
  @Matches(JOUR, { message: 'errors.invalid_date_format' })
  from?: string;

  @ApiPropertyOptional({ example: '2026-08-31', description: 'Fin de période (incluse)' })
  @IsOptional()
  @Matches(JOUR, { message: 'errors.invalid_date_format' })
  to?: string;
}
