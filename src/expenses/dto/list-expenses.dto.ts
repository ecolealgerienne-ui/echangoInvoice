import { ApiPropertyOptional } from '@nestjs/swagger';
import { ListQueryDto } from '../../common/dto/list-query.dto';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsEnum, IsInt, IsOptional, Min } from 'class-validator';

export class ListExpensesDto extends ListQueryDto {

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
