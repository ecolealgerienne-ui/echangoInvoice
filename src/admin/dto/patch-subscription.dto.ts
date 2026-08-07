import { IsDateString, IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { PRIX_MAX } from '../../common/limits';

export class PatchSubscriptionDto {
  @IsOptional()
  @IsString()
  planSlug?: string;

  @IsOptional()
  @IsNumber() @Max(PRIX_MAX)
  @Type(() => Number)
  customPricePerMonth?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  invoiceLimit?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  usersLimit?: number | null;

  @IsOptional()
  @IsDateString()
  currentPeriodEnd?: string;
}
