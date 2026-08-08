import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

export class InviteDto {
  @ApiProperty({ example: 'collaborateur@example.com' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({ enum: ['manager', 'agent', 'accountant'], default: 'agent' })
  @IsOptional()
  @IsEnum(['manager', 'agent', 'accountant'])
  role?: 'manager' | 'agent' | 'accountant';
}

export class AcceptInviteDto {
  @ApiProperty()
  @IsString()
  token: string;

  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  password: string;
}
