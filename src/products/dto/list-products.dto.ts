import { ApiPropertyOptional } from '@nestjs/swagger';
import { ListQueryDto } from '../../common/dto/list-query.dto';
import { IsOptional, IsString, IsInt, Min, Max, IsBoolean, IsEnum } from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class ListProductsDto extends ListQueryDto {

  @ApiPropertyOptional({ enum: ['product', 'material', 'both'] })
  @IsOptional() @IsEnum(['product', 'material', 'both'])
  type?: 'product' | 'material' | 'both';

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  isActive?: boolean;
}
