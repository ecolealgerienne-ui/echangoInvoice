import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsInt, Min, Max, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';

export class ListReceptionBlsDto {
  @ApiProperty({ required: false, default: 1 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page: number = 1;

  @ApiProperty({ required: false, default: 20 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500)
  limit: number = 20;

  @ApiProperty({ required: false, enum: ['pending', 'partial', 'completed'] })
  @IsOptional() @IsEnum(['pending', 'partial', 'completed'])
  status?: string;
}
