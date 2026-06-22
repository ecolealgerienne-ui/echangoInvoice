import { IsEnum } from 'class-validator';

export class PatchTenantStatusDto {
  @IsEnum(['trial', 'active', 'suspended'])
  status: 'trial' | 'active' | 'suspended';
}
