import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsUUID, Min } from 'class-validator';

export class ListPaymentsDto {
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Type(() => Number) page?: number = 1;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Type(() => Number) limit?: number = 20;
  @ApiPropertyOptional() @IsOptional() @IsUUID() salesInvoiceId?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() dateFrom?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() dateTo?: string;
}
