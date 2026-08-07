import { IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { MONTANT_MAX } from '../../common/limits';

export class CreateSaasPaymentDto {
  @IsUUID()
  tenantId: string;

  @IsNumber() @Max(MONTANT_MAX)
  @Min(0)
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
