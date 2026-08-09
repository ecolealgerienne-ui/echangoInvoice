import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { PRIX_MAX, QUANTITE_MAX } from '../../common/limits';

export class CreateProductSupplierDto {
  @ApiProperty()
  @IsUUID()
  supplierId: string;

  @ApiPropertyOptional({ description: "Référence de l'article chez ce fournisseur" })
  @IsOptional() @IsString() @MaxLength(80)
  supplierRef?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(PRIX_MAX)
  purchasePrice?: number;

  @ApiPropertyOptional({ description: 'Délai annoncé, en jours' })
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(3650)
  leadTimeDays?: number;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0.01) @Max(QUANTITE_MAX)
  packQuantity?: number;

  @ApiPropertyOptional()
  @IsOptional() @IsBoolean()
  isPreferred?: boolean;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(500)
  notes?: string;
}
