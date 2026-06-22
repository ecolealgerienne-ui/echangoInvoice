import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID,
  Min, ValidateNested,
} from 'class-validator';

class BomLineDto {
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(1) order?: number;
  @ApiProperty() @IsUUID() rawMaterialId: string;
  @ApiProperty() @Type(() => Number) @IsNumber() @Min(0.01) quantityPerUnit: number;
  @ApiProperty() @IsString() @IsNotEmpty() unit: string;
}

export class CreateNomenclatureDto {
  @ApiPropertyOptional() @IsOptional() @IsString() code?: string;
  @ApiProperty() @IsString() @IsNotEmpty() name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiProperty() @IsUUID() finishedProductId: string;
  @ApiProperty() @Type(() => Number) @IsNumber() @Min(0.01) outputQuantity: number;
  @ApiProperty({ type: [BomLineDto] })
  @IsArray() @ValidateNested({ each: true }) @Type(() => BomLineDto)
  lines: BomLineDto[];
}
