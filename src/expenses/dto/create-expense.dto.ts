import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { MONTANT_MAX } from '../../common/limits';

const CATEGORIES = ['loyer', 'utilities', 'transport', 'rh', 'maintenance', 'other'] as const;

export class CreateExpenseDto {
  @ApiProperty() @IsDateString() expenseDate: string;
  @ApiProperty() @IsString() @IsNotEmpty() description: string;
  @ApiProperty({ enum: CATEGORIES }) @IsEnum(CATEGORIES) category: string;
  @ApiProperty() @IsNumber() @Max(MONTANT_MAX) @Min(0.01) amount: number;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}
