import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsUUID, IsBoolean, MaxLength, MinLength } from 'class-validator';

export class CreateRawMaterialDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  code?: string;

  @ApiProperty({ example: 'kg' })
  @IsString()
  @MaxLength(50)
  unit: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ required: false, default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
