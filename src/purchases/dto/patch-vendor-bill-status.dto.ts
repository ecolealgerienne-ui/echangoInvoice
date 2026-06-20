import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

export class PatchVendorBillStatusDto {
  @ApiProperty({ enum: ['validated', 'cancelled'] })
  @IsIn(['validated', 'cancelled'])
  status: string;
}
