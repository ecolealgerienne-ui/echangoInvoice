import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsIn, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { MONTANT_MAX } from '../../common/limits';

export class RecordVendorPaymentDto {
  @ApiProperty()
  @Type(() => Number)
  @IsNumber() @Max(MONTANT_MAX) @Min(0.01)
  amount: number;

  @ApiProperty()
  @IsDateString()
  paymentDate: string;

  @ApiProperty({ enum: ['bank_transfer', 'cheque', 'cash', 'other'] })
  @IsIn(['bank_transfer', 'cheque', 'cash', 'other'])
  method: string;

  @ApiProperty({ required: false })
  @IsOptional() @IsString() @MaxLength(255)
  reference?: string;
}
