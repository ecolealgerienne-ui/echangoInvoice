import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray, IsBoolean, IsEmail, IsNumber, IsOptional, IsString,
  Matches, Max, MaxLength, Min, ValidateNested,
} from 'class-validator';

/**
 * Un format valide contient exactement UN groupe de 3 à 6 dièses.
 *
 * Le motif est ancré et interdit tout autre dièse. Une version non ancrée
 * — `/#{3,6}/` — acceptait « FAC-####### » : elle y trouvait six dièses et se
 * déclarait satisfaite, alors que le septième aurait élargi la séquence sans
 * que personne ne l'ait voulu. Deux groupes séparés sont refusés pour la même
 * raison : `appliquerFormat` les remplirait tous les deux avec la même
 * séquence, et le numéro contiendrait deux fois le même nombre.
 *
 * Sans dièse du tout, tous les documents porteraient le même numéro et
 * l'index unique refuserait le second.
 */
const FORMAT_NUMEROTATION = /^[^#]*#{3,6}[^#]*$/;

class TaxRateDto {
  @ApiPropertyOptional() @IsString() name: string;
  @ApiPropertyOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100) rate: number;
  @ApiPropertyOptional() @IsBoolean() isDefault: boolean;
}

export class UpdateSettingsDto {
  @ApiPropertyOptional() @IsOptional() @IsString() companyName?: string;

  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100) taxRate?: number;

  @ApiPropertyOptional() @IsOptional() @IsString() currency?: string;

  @ApiPropertyOptional({ description: 'Doit contenir de ### à ###### (largeur de la séquence).' })
  @IsOptional() @IsString()
  @Matches(FORMAT_NUMEROTATION, { message: 'format_sequence_required' })
  blNumberFormat?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  @Matches(FORMAT_NUMEROTATION, { message: 'format_sequence_required' })
  invoiceNumberFormat?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  @Matches(FORMAT_NUMEROTATION, { message: 'format_sequence_required' })
  quoteNumberFormat?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  @Matches(FORMAT_NUMEROTATION, { message: 'format_sequence_required' })
  poNumberFormat?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  @Matches(FORMAT_NUMEROTATION, { message: 'format_sequence_required' })
  receptionNumberFormat?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  @Matches(FORMAT_NUMEROTATION, { message: 'format_sequence_required' })
  vendorBillNumberFormat?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  @Matches(FORMAT_NUMEROTATION, { message: 'format_sequence_required' })
  creditNoteNumberFormat?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  @Matches(FORMAT_NUMEROTATION, { message: 'format_sequence_required' })
  productionOrderNumberFormat?: string;

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

  // Identifiants légaux de l'émetteur, imprimés sur chaque document.
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50) nif?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50) rc?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50) ai?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50) nis?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(60) rib?: string;

  // La couleur part dans une feuille de style : hors notation hexadécimale,
  // « red; } body { display:none » y entrerait tel quel.
  @ApiPropertyOptional({ example: '#1e3a5f' })
  @IsOptional() @IsString()
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'invalid_color' })
  pdfAccentColor?: string;

  @ApiPropertyOptional({ type: [TaxRateDto] })
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => TaxRateDto)
  taxRates?: TaxRateDto[];

  @ApiPropertyOptional({ description: 'Activer ou désactiver le module production' })
  @IsOptional() @IsBoolean()
  productionModuleEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Applique le droit de timbre aux règlements en espèces' })
  @IsOptional() @IsBoolean()
  stampDutyEnabled?: boolean;
}
