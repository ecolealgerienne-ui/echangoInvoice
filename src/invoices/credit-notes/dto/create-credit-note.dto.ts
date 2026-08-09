import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsNumber, IsOptional, IsString, IsUUID, Max, Min, ValidateNested } from 'class-validator';
import { PRIX_MAX, QUANTITE_MAX, TAUX_MAX } from '../../../common/limits';

export class CreateCreditNoteItemDto {
  @ApiProperty() @IsString() description: string;
  @ApiProperty() @IsNumber() @Max(QUANTITE_MAX) @Min(0) @Type(() => Number) quantity: number;
  @ApiPropertyOptional() @IsOptional() @IsString() unit?: string;
  @ApiProperty() @IsNumber() @Max(PRIX_MAX) @Min(0) @Type(() => Number) unitPrice: number;
  @ApiPropertyOptional() @IsOptional() @IsString() taxName1?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Max(TAUX_MAX) @Type(() => Number) taxRate1?: number;
}

export class CreateCreditNoteDto {
  @ApiProperty() @IsUUID() customerId: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() salesInvoiceId?: string;
  @ApiProperty() @IsDateString() creditNoteDate: string;
  @ApiPropertyOptional() @IsOptional() @IsString() reason?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;

  @ApiProperty({ type: [CreateCreditNoteItemDto] })
  @IsArray() @ValidateNested({ each: true }) @Type(() => CreateCreditNoteItemDto)
  items: CreateCreditNoteItemDto[];
}
