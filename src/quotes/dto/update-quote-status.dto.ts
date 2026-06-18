import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';

export class UpdateQuoteStatusDto {
  @ApiProperty({ enum: ['sent', 'accepted', 'rejected'] })
  @IsEnum(['sent', 'accepted', 'rejected'])
  status: 'sent' | 'accepted' | 'rejected';
}
