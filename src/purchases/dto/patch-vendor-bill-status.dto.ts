import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

export class PatchVendorBillStatusDto {
  @ApiProperty({ enum: ['validated', 'cancelled', 'draft'] })
  @IsIn(['validated', 'cancelled', 'draft'])
  status: string;
}
