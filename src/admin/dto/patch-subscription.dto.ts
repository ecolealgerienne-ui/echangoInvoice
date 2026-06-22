import { IsDateString, IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class PatchSubscriptionDto {
  @IsOptional()
  @IsString()
  planSlug?: string;

  @IsOptional()
  @IsNumber()
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
