import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SettingsService } from './settings.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { JwtGuard } from '../common/guards/jwt.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Settings')
@ApiBearerAuth()
@UseGuards(JwtGuard, TenantGuard, RolesGuard)
@Controller('settings')
export class SettingsController {
  constructor(private readonly service: SettingsService) {}

  @Get()
  @Roles('owner', 'manager', 'agent', 'accountant')
  @ApiOperation({ summary: 'Paramètres du tenant courant' })
  get(@CurrentUser() user: any) {
    return this.service.get(user.tenantId!);
  }

  @Put()
  @Roles('owner')
  @ApiOperation({ summary: 'Mettre à jour les paramètres (OWNER uniquement)' })
  update(@Body() dto: UpdateSettingsDto, @CurrentUser() user: any) {
    return this.service.update(user.tenantId!, dto, user.id);
  }
}
