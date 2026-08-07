import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { QUANTITE_MAX } from '../../common/limits';

export class CompleteProductionOrderDto {
  @ApiProperty() @Type(() => Number) @IsNumber() @Max(QUANTITE_MAX) @Min(0.01) quantityProduced: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Max(QUANTITE_MAX) @Min(0) quantityRejected?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}
