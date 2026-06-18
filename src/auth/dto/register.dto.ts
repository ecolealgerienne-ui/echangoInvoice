import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength, MaxLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'Chambre Froide Djelfa' })
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  companyName: string;

  @ApiProperty({ example: 'contact@chambrefroide.dz' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'SecurePass123!', minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(100)
  password: string;
}
