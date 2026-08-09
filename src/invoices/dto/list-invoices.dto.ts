import { ApiPropertyOptional } from '@nestjs/swagger';
import { ListQueryDto } from '../../common/dto/list-query.dto';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class ListInvoicesDto extends ListQueryDto {

  @ApiPropertyOptional({ enum: ['draft', 'sent', 'partial', 'paid', 'overdue', 'cancelled'] })
  @IsOptional()
  @IsEnum(['draft', 'sent', 'partial', 'paid', 'overdue', 'cancelled'])
  status?: string;

  @ApiPropertyOptional() @IsOptional() @IsUUID() customerId?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() dateFrom?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() dateTo?: string;
}
