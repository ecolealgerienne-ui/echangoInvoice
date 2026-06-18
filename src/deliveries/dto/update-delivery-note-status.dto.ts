import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';

export class UpdateDeliveryNoteStatusDto {
  @ApiProperty({ enum: ['sent', 'signed', 'delivered'] })
  @IsEnum(['sent', 'signed', 'delivered'])
  status: 'sent' | 'signed' | 'delivered';
}
