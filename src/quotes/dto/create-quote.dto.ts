import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray, IsDateString, IsNotEmpty, IsNumber, IsOptional,
  IsString, IsUUID, Min, ValidateNested,
} from 'class-validator';

export class CreateQuoteItemDto {
  @ApiProperty() @IsUUID() finishedProductId: string;
  @ApiProperty() @IsNumber() @Min(0.01) quantity: number;
  @ApiProperty() @IsString() @IsNotEmpty() unit: string;
  @ApiProperty() @IsNumber() @Min(0) unitPrice: number;

  @ApiPropertyOptional() @IsOptional() @IsString() taxName1?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) taxRate1?: number;

  @ApiPropertyOptional() @IsOptional() @IsString() taxName2?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) taxRate2?: number;
}

export class CreateQuoteDto {
  @ApiProperty() @IsUUID() customerId: string;
  @ApiProperty() @IsDateString() quoteDate: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() expiryDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;

  @ApiProperty({ type: [CreateQuoteItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateQuoteItemDto)
  items: CreateQuoteItemDto[];
}
