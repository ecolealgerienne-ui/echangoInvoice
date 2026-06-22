import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CompleteProductionOrderDto {
  @ApiProperty() @Type(() => Number) @IsNumber() @Min(0.01) quantityProduced: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) quantityRejected?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}
