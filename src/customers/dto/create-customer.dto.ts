import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsEmail, IsBoolean, MinLength, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateCustomerDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name: string;

  @ApiProperty({ required: false })
  @IsOptional() @IsString() @MaxLength(255)
  contactPerson?: string;

  @ApiProperty({ required: false })
  @IsOptional() @Transform(({ value }) => value === '' ? undefined : value) @IsEmail()
  email?: string;

  @ApiProperty({ required: false })
  @IsOptional() @IsString() @MaxLength(50)
  phone?: string;

  @ApiProperty({ required: false, description: 'Numéro d\'Identification Fiscale' })
  @IsOptional() @IsString() @MaxLength(20)
  nif?: string;

  @ApiProperty({ required: false, description: 'Registre du Commerce' })
  @IsOptional() @IsString() @MaxLength(20)
  rc?: string;

  @ApiProperty({ required: false, description: 'Article d\'Imposition' })
  @IsOptional() @IsString() @MaxLength(20)
  ai?: string;

  @ApiProperty({ required: false, description: 'Numéro d\'Identification Statistique' })
  @IsOptional() @IsString() @MaxLength(20)
  nis?: string;

  @ApiProperty({ required: false })
  @IsOptional() @IsString()
  address?: string;

  @ApiProperty({ required: false })
  @IsOptional() @IsString() @MaxLength(100)
  city?: string;

  @ApiProperty({ required: false })
  @IsOptional() @IsString() @MaxLength(100)
  country?: string;

  @ApiProperty({ required: false })
  @IsOptional() @IsString()
  shippingAddress?: string;

  @ApiProperty({ required: false })
  @IsOptional() @IsString() @MaxLength(100)
  shippingCity?: string;

  @ApiProperty({ required: false })
  @IsOptional() @IsString()
  notes?: string;

  @ApiProperty({ required: false, default: true })
  @IsOptional() @IsBoolean()
  isActive?: boolean;

  @ApiProperty({ required: false, default: true })
  @IsOptional() @IsBoolean()
  isCustomer?: boolean;

  @ApiProperty({ required: false, default: false })
  @IsOptional() @IsBoolean()
  isSupplier?: boolean;
}
