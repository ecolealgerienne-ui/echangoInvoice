import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsEnum, IsInt, IsOptional, Min } from 'class-validator';

export class ListExpensesDto {
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Type(() => Number) page?: number = 1;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Type(() => Number) limit?: number = 20;

  @ApiPropertyOptional({ enum: ['loyer', 'utilities', 'transport', 'rh', 'maintenance', 'other'] })
  @IsOptional()
  @IsEnum(['loyer', 'utilities', 'transport', 'rh', 'maintenance', 'other'])
  category?: string;

  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  @Transform(({ value }) => value === 'true' ? true : value === 'false' ? false : value)
  isApproved?: boolean;

  @ApiPropertyOptional() @IsOptional() @IsDateString() dateFrom?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() dateTo?: string;
}
