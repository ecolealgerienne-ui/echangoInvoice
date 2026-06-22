import { IsInt, IsNumber, IsObject, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdatePlanDto {
  @IsOptional()
  @IsNumber()
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
