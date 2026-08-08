import {
  Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtGuard } from '../common/guards/jwt.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtGuard, TenantGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly service: UsersService) {}

  @Get()
  @Roles('owner', 'manager')
  @ApiOperation({ summary: "Lister les membres de l'espace" })
  findAll(@CurrentUser() user: any) {
    return this.service.findAll(user.tenantId!);
  }

  @Get('quota')
  @Roles('owner', 'manager')
  @ApiOperation({ summary: 'Places occupées et limite du plan' })
  quota(@CurrentUser() user: any) {
    return this.service.quota(user.tenantId!);
  }

  @Get('invitations')
  @Roles('owner', 'manager')
  @ApiOperation({ summary: 'Invitations émises non encore acceptées' })
  listInvitations(@CurrentUser() user: any) {
    return this.service.listInvitations(user.tenantId!);
  }

  @Delete('invitations/:id')
  @Roles('owner', 'manager')
  @ApiOperation({ summary: 'Révoquer une invitation' })
  revokeInvitation(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.service.revokeInvitation(id, user.tenantId!);
  }

  // Réservé au propriétaire : distribuer des rôles ou couper un accès engage
  // tout l'espace, un manager ne doit pas pouvoir s'y substituer.
  @Patch(':id')
  @Roles('owner')
  @ApiOperation({ summary: "Modifier le rôle, le nom ou l'activation d'un membre" })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: any,
  ) {
    return this.service.update(id, dto, user.tenantId!, user.sub ?? user.id);
  }
}
