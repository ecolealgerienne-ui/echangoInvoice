import { ApiProperty } from '@nestjs/swagger';
import { ListQueryDto } from '../../common/dto/list-query.dto';
import { IsOptional, IsString, IsBoolean, IsIn, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class ListCustomersDto extends ListQueryDto {

  @ApiProperty({ required: false })
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  isActive?: boolean;

  /**
   * Ville exacte, telle que rendue par `GET /customers/cities`. La liste
   * déroulante de l'écran est peuplée depuis cet inventaire : un filtre libre
   * n'aurait rien filtré du tout dès qu'une ville s'écrit « Sétif » d'un côté
   * et « Setif » de l'autre.
   */
  @ApiProperty({ required: false })
  @IsOptional() @IsString() @MaxLength(100)
  city?: string;

  /**
   * Nature du partenaire. La liste ne rend que des clients : la seule
   * distinction qui existe en base est donc « client seulement » contre
   * « client **et** fournisseur ». On ne propose pas d'autre valeur, faute de
   * champ qui la porterait.
   */
  @ApiProperty({ required: false, enum: ['customer', 'both'] })
  @IsOptional() @IsIn(['customer', 'both'])
  type?: 'customer' | 'both';
}
