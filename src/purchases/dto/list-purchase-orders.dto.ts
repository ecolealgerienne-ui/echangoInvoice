import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsInt, Min, Max, IsUUID, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';

export class ListPurchaseOrdersDto {
  @ApiProperty({ required: false, default: 1 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page: number = 1;

  @ApiProperty({ required: false, default: 20 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500)
  limit: number = 20;

  @ApiProperty({ required: false, enum: ['draft', 'sent', 'received', 'invoiced', 'cancelled'] })
  @IsOptional() @IsEnum(['draft', 'sent', 'received', 'invoiced', 'cancelled'])
  status?: string;

  @ApiProperty({ required: false, description: 'If true, exclude invoiced and cancelled POs' })
  @IsOptional()
  excludeInvoiced?: boolean;

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
