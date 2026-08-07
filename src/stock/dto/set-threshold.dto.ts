import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, Max, Min } from 'class-validator';
import { QUANTITE_MAX } from '../../common/limits';

export class SetThresholdDto {
  @ApiProperty() @IsNumber() @Max(QUANTITE_MAX) @Min(0) alertThreshold: number;
}
