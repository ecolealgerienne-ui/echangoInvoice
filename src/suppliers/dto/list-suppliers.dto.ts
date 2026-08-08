import { ApiProperty } from '@nestjs/swagger';
import { ListQueryDto } from '../../common/dto/list-query.dto';
import { IsOptional, IsString, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class ListSuppliersDto extends ListQueryDto {

}
