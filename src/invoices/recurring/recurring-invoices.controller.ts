import {
  Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RecurringInvoicesService } from './recurring-invoices.service';
import { CreateRecurringInvoiceDto } from './dto/create-recurring-invoice.dto';
import { JwtGuard } from '../../common/guards/jwt.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';

@ApiTags('Facturation récurrente')
@ApiBearerAuth()
@UseGuards(JwtGuard, TenantGuard, RolesGuard)
@Controller('invoices/recurring')
export class RecurringInvoicesController {
  constructor(private readonly service: RecurringInvoicesService) {}

  @Get()
  @Roles('owner', 'manager', 'agent', 'accountant')
  @ApiOperation({ summary: 'Lister les abonnements de facturation' })
  lister(@CurrentUser() user: JwtPayload) {
    return this.service.lister(user.tenantId!);
  }

  @Post()
  @Roles('owner', 'manager')
  @ApiOperation({ summary: 'Créer un abonnement' })
  creer(@Body() dto: CreateRecurringInvoiceDto, @CurrentUser() user: JwtPayload) {
    return this.service.creer(dto, user.tenantId!, user.sub);
  }

  @Patch(':id/toggle')
  @Roles('owner', 'manager')
  @ApiOperation({ summary: 'Activer ou suspendre un abonnement' })
  basculer(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.service.basculerActivation(id, user.tenantId!, user.sub);
  }

  @Post(':id/generate')
  @Roles('owner', 'manager')
  @ApiOperation({ summary: 'Engendrer maintenant les factures dues de cet abonnement' })
  generer(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.service.genererPour(id, user.tenantId!, user.sub);
  }

  @Delete(':id')
  @Roles('owner')
  @ApiOperation({ summary: 'Supprimer un abonnement' })
  supprimer(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.service.supprimer(id, user.tenantId!);
  }
}
