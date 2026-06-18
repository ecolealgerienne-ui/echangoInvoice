import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';

export class PatchPoStatusDto {
  @ApiProperty({ enum: ['draft', 'sent', 'received', 'cancelled'] })
  @IsEnum(['draft', 'sent', 'received', 'cancelled'])
  status: 'draft' | 'sent' | 'received' | 'cancelled';
}
