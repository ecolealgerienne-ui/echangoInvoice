import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { QUANTITE_MAX } from '../../common/limits';

export class CreateProductionOrderDto {
  @ApiProperty() @IsUUID() nomenclatureId: string;

  @ApiProperty() @Type(() => Number) @IsNumber() @Max(QUANTITE_MAX) @Min(0.01) quantityToProduce: number;

  @ApiPropertyOptional({ enum: ['normal', 'urgent'] })
  @IsOptional() @IsIn(['normal', 'urgent'])
  priority?: 'normal' | 'urgent';

  @ApiPropertyOptional() @IsOptional() @IsUUID() responsibleUserId?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() plannedStartDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() plannedEndDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() notes?: string;
}
