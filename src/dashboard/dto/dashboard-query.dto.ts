import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, Matches } from 'class-validator';

export class DashboardQueryDto {
  /**
   * R021 — `month` alimente un calcul de dates. Sans borne de format,
   * `?month=abc` produit des bornes `NaN-NaN-01` que Postgres refuse : un 500
   * là où un 400 était dû.
   */
  @ApiPropertyOptional({ example: '2026-08', description: 'Mois au format AAAA-MM' })
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'errors.invalid_month_format' })
  month?: string;
}
