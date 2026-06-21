import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ListVendorBillsDto {
  @ApiProperty({ required: false, default: 1 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page: number = 1;

  @ApiProperty({ required: false, default: 20 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  limit: number = 20;

  @ApiProperty({ required: false })
  @IsOptional() @IsString()
  status?: string;

  @ApiProperty({ required: false })
  @IsOptional() @IsUUID()
  supplierId?: string;

  @ApiProperty({ required: false })
  @IsOptional() @IsString()
  dateFrom?: string;

  @ApiProperty({ required: false })
  @IsOptional() @IsString()
  dateTo?: string;
}
