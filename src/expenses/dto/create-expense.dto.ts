import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

const CATEGORIES = ['loyer', 'utilities', 'transport', 'rh', 'maintenance', 'other'] as const;

export class CreateExpenseDto {
  @ApiProperty() @IsDateString() expenseDate: string;
  @ApiProperty() @IsString() @IsNotEmpty() description: string;
  @ApiProperty({ enum: CATEGORIES }) @IsEnum(CATEGORIES) category: string;
  @ApiProperty() @IsNumber() @Min(0.01) amount: number;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}
