import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray, IsBoolean, IsEmail, IsNumber, IsOptional, IsString,
  Matches, Max, Min, ValidateNested,
} from 'class-validator';

class TaxRateDto {
  @ApiPropertyOptional() @IsString() name: string;
  @ApiPropertyOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100) rate: number;
  @ApiPropertyOptional() @IsBoolean() isDefault: boolean;
}

export class UpdateSettingsDto {
  @ApiPropertyOptional() @IsOptional() @IsString() companyName?: string;

  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100) taxRate?: number;

  @ApiPropertyOptional() @IsOptional() @IsString() currency?: string;

  @ApiPropertyOptional({ description: 'Must contain ### or ####' })
  @IsOptional() @IsString()
  @Matches(/#{3,4}/, { message: 'blNumberFormat must contain ### or ####' })
  blNumberFormat?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  @Matches(/#{3,4}/, { message: 'invoiceNumberFormat must contain ### or ####' })
  invoiceNumberFormat?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  @Matches(/#{3,4}/, { message: 'quoteNumberFormat must contain ### or ####' })
  quoteNumberFormat?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  @Matches(/#{3,4}/, { message: 'poNumberFormat must contain ### or ####' })
  poNumberFormat?: string;

  @ApiPropertyOptional({ description: 'List of allowed measurement units' })
  @IsOptional() @IsArray() @IsString({ each: true })
  units?: string[];

  @ApiPropertyOptional() @IsOptional() @IsString() defaultUnit?: string;

  // Délai de paiement : borne de bon sens (un an), pas de colonne.
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(1) @Max(365) defaultPaymentTermsDays?: number;

  @ApiPropertyOptional({ description: 'Base64 data URL of the company logo' })
  @IsOptional() @IsString()
  logo?: string;

  @ApiPropertyOptional() @IsOptional() @IsEmail() email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() address?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() footerText?: string;

  @ApiPropertyOptional({ type: [TaxRateDto] })
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => TaxRateDto)
  taxRates?: TaxRateDto[];

  @ApiPropertyOptional({ description: 'Activer ou désactiver le module production' })
  @IsOptional() @IsBoolean()
  productionModuleEnabled?: boolean;
}
