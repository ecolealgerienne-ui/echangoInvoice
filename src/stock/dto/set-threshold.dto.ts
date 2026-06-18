import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, Min } from 'class-validator';

export class SetThresholdDto {
  @ApiProperty() @IsNumber() @Min(0) alertThreshold: number;
}
