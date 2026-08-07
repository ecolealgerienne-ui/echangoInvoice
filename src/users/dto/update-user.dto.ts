import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateUserDto {
  // `superadmin` est volontairement absent : ce rôle relève de la console
  // d'administration, il ne se distribue pas depuis l'espace d'un client.
  @ApiPropertyOptional({ enum: ['owner', 'manager', 'agent'] })
  @IsOptional()
  @IsEnum(['owner', 'manager', 'agent'])
  role?: 'owner' | 'manager' | 'agent';

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name?: string;
}
