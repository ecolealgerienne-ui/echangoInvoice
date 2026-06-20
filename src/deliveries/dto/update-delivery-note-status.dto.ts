import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';

export class UpdateDeliveryNoteStatusDto {
  @ApiProperty({ enum: ['sent', 'delivered', 'cancelled'] })
  @IsEnum(['sent', 'delivered', 'cancelled'])
  status: 'sent' | 'delivered' | 'cancelled';
}
