import { ApiPropertyOptional } from '@nestjs/swagger';
import { ListQueryDto } from '../../common/dto/list-query.dto';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class ListDeliveryNotesDto extends ListQueryDto {

  @ApiPropertyOptional({ enum: ['draft', 'sent', 'signed', 'delivered'] })
  @IsOptional()
  @IsEnum(['draft', 'sent', 'signed', 'delivered'])
  status?: string;

  @ApiPropertyOptional() @IsOptional() @IsUUID() customerId?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() dateFrom?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() dateTo?: string;
}
