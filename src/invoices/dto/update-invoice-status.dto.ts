import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';

export class UpdateInvoiceStatusDto {
  @ApiProperty({ enum: ['sent', 'cancelled', 'draft'] })
  @IsEnum(['sent', 'cancelled', 'draft'])
  status: 'sent' | 'cancelled' | 'draft';
}
