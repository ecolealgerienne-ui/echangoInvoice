import { ApiProperty } from '@nestjs/swagger';
import { ListQueryDto } from '../../common/dto/list-query.dto';
import { IsOptional, IsString, IsInt, Min, Max, IsBoolean } from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class ListCustomersDto extends ListQueryDto {

  @ApiProperty({ required: false })
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  isActive?: boolean;
}
