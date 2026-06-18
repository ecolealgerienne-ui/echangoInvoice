import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional, IsUUID, Min } from 'class-validator';

export class ListInvoicesDto {
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Type(() => Number) page?: number = 1;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Type(() => Number) limit?: number = 20;

  @ApiPropertyOptional({ enum: ['draft', 'sent', 'partial', 'paid', 'overdue', 'cancelled'] })
  @IsOptional()
  @IsEnum(['draft', 'sent', 'partial', 'paid', 'overdue', 'cancelled'])
  status?: string;

  @ApiPropertyOptional() @IsOptional() @IsUUID() customerId?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() dateFrom?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() dateTo?: string;
}
