import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Min,
} from 'class-validator';

export class CreateProductionOrderDto {
  @ApiProperty() @IsUUID() nomenclatureId: string;

  @ApiProperty() @Type(() => Number) @IsNumber() @Min(0.01) quantityOrdered: number;

  @ApiPropertyOptional({ enum: ['normal', 'urgent'] })
  @IsOptional() @IsIn(['normal', 'urgent'])
  priority?: 'normal' | 'urgent';

  @ApiPropertyOptional() @IsOptional() @IsDateString() scheduledStartDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() scheduledEndDate?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() notes?: string;
}
