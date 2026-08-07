import { IsInt, IsNumber, IsObject, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { PRIX_MAX } from '../../common/limits';

export class UpdatePlanDto {
  @IsOptional()
  @IsNumber() @Max(PRIX_MAX)
  @Type(() => Number)
  pricePerMonth?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  invoiceLimit?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  usersLimit?: number | null;

  @IsOptional()
  @IsObject()
  features?: Record<string, boolean>;
}
