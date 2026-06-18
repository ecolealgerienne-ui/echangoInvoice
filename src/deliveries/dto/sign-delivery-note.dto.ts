import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class SignDeliveryNoteDto {
  @ApiProperty() @IsString() @IsNotEmpty() customerSignature: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() signedDate?: string;
}
