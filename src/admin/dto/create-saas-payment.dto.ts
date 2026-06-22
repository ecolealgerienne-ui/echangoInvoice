import { IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateSaasPaymentDto {
  @IsUUID()
  tenantId: string;

  @Type(() => Number)
  amount: number;

  @IsEnum(['bank_transfer', 'cash', 'check', 'ccp'])
  method: 'bank_transfer' | 'cash' | 'check' | 'ccp';

  @IsOptional()
  @IsString()
  reference?: string;

  @IsDateString()
  paidAt: string;

  @IsInt()
  @Min(1)
  @Type(() => Number)
  monthsCovered: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
