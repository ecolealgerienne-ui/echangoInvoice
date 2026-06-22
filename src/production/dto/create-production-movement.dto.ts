import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Min,
} from 'class-validator';

export class CreateProductionMovementDto {
  @ApiProperty({ enum: ['mp_consumption', 'rejection', 'mp_loss'] })
  @IsIn(['mp_consumption', 'rejection', 'mp_loss'])
  type: string;

  @ApiPropertyOptional() @IsOptional() @IsUUID() rawMaterialId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() finishedProductId?: string;

  @ApiProperty() @Type(() => Number) @IsNumber() @Min(0.01) quantity: number;
  @ApiProperty() @IsString() @IsNotEmpty() unit: string;

  @ApiPropertyOptional() @IsOptional() @IsString() reason?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() location?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;

  @ApiPropertyOptional({ description: 'Moment réel du mouvement (défaut: now)' })
  @IsOptional() @IsDateString()
  movedAt?: string;
}
