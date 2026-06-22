import { PartialType } from '@nestjs/swagger';
import { CreateNomenclatureDto } from './create-nomenclature.dto';

export class UpdateNomenclatureDto extends PartialType(CreateNomenclatureDto) {}
