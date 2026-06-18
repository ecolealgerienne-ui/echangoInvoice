import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional, Min } from 'class-validator';

export class ReportQueryDto {
  @ApiProperty({ example: '2024-06-01' }) @IsDateString() dateFrom: string;
  @ApiProperty({ example: '2024-06-30' }) @IsDateString() dateTo: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Type(() => Number) page?: number = 1;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Type(() => Number) limit?: number = 20;
}

export class ExpenseReportQueryDto extends ReportQueryDto {
  @ApiPropertyOptional({ enum: ['loyer', 'utilities', 'transport', 'rh', 'maintenance', 'other'] })
  @IsOptional()
  @IsEnum(['loyer', 'utilities', 'transport', 'rh', 'maintenance', 'other'])
  category?: string;
}
