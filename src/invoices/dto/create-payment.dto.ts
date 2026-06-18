import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CreatePaymentDto {
  @ApiProperty() @IsUUID() salesInvoiceId: string;
  @ApiProperty() @IsNumber() @Min(0.01) amount: number;
  @ApiProperty() @IsDateString() paymentDate: string;

  @ApiProperty({ enum: ['cash', 'bank_transfer', 'cheque', 'other'] })
  @IsEnum(['cash', 'bank_transfer', 'cheque', 'other'])
  paymentMethod: string;

  @ApiPropertyOptional() @IsOptional() @IsString() reference?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}
