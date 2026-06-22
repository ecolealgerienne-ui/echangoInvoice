import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID,
  Min, ValidateNested,
} from 'class-validator';

class BomLineDto {
  @ApiProperty() @IsUUID() rawMaterialId: string;
  @ApiProperty() @Type(() => Number) @IsNumber() @Min(0.01) quantity: number;
  @ApiProperty() @IsString() @IsNotEmpty() unit: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class CreateNomenclatureDto {
  @ApiProperty() @IsUUID() finishedProductId: string;
  @ApiProperty() @IsString() @IsNotEmpty() name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiProperty({ type: [BomLineDto] })
  @IsArray() @ValidateNested({ each: true }) @Type(() => BomLineDto)
  bomLines: BomLineDto[];
}
