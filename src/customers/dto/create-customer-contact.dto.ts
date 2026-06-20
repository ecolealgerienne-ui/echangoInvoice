import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateCustomerContactDto {
  @ApiProperty()
  @IsString() @MinLength(2) @MaxLength(255)
  name: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(100)
  role?: string;

  @ApiPropertyOptional()
  @Transform(({ value }) => value === '' ? undefined : value)
  @IsOptional() @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(50)
  phone?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional() @IsBoolean()
  isPrimary?: boolean;
}
