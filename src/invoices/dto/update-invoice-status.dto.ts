import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';

export class UpdateInvoiceStatusDto {
  @ApiProperty({ enum: ['sent', 'cancelled'] })
  @IsEnum(['sent', 'cancelled'])
  status: 'sent' | 'cancelled';
}
