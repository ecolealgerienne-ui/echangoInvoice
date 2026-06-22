import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize, IsArray, IsIn, IsNotEmpty, IsNumber,
  IsOptional, IsString, IsUUID, Min, ValidateNested,
} from 'class-validator';

export class BatchMovementItemDto {
  @ApiProperty({ enum: ['mp_consumption', 'rejection', 'mp_loss'] })
  @IsIn(['mp_consumption', 'rejection', 'mp_loss'])
  type: string;

  @ApiPropertyOptional() @IsOptional() @IsUUID() rawMaterialId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() finishedProductId?: string;

  @ApiProperty() @Type(() => Number) @IsNumber() @Min(0.01) quantity: number;
  @ApiProperty() @IsString() @IsNotEmpty() unit: string;

  @ApiPropertyOptional() @IsOptional() @IsString() reason?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class BatchCreateMovementsDto {
  @ApiProperty({ type: [BatchMovementItemDto] })
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => BatchMovementItemDto)
  items: BatchMovementItemDto[];
}
