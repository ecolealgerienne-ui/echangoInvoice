import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CompleteProductionOrderDto {
  @ApiProperty({ description: 'Quantité réellement produite' })
  @Type(() => Number) @IsNumber() @Min(0.01)
  quantityProduced: number;

  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}
