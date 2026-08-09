import { ApiPropertyOptional } from '@nestjs/swagger';
import { ListQueryDto } from '../../common/dto/list-query.dto';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class ListQuotesDto extends ListQueryDto {

  @ApiPropertyOptional({ enum: ['draft', 'sent', 'accepted', 'rejected', 'expired', 'converted'] })
  @IsOptional()
  @IsEnum(['draft', 'sent', 'accepted', 'rejected', 'expired', 'converted'])
  status?: string;

  @ApiPropertyOptional() @IsOptional() @IsUUID() customerId?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() dateFrom?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() dateTo?: string;
}
