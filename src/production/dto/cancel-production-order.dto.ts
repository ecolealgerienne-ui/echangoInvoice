import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class CancelProductionOrderDto {
  @ApiPropertyOptional({ description: 'Raison de l\'annulation' })
  @IsOptional() @IsString()
  reason?: string;
}
