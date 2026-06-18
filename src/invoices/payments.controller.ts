import {
  Body, Controller, Delete, Get, HttpCode,
  Param, ParseUUIDPipe, Post, Query, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { ListPaymentsDto } from './dto/list-payments.dto';
import { JwtGuard } from '../common/guards/jwt.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Payments')
@ApiBearerAuth()
@UseGuards(JwtGuard, RolesGuard)
@Controller('invoices/payments')
export class PaymentsController {
  constructor(private readonly service: PaymentsService) {}

  @Post()
  @Roles('owner', 'manager')
  @ApiOperation({ summary: 'Enregistrer un paiement (met à jour amountPaid/Due + status)' })
  create(@Body() dto: CreatePaymentDto, @CurrentUser() user: any) {
    return this.service.create(dto, user.tenantId, user.id);
  }

  @Get()
  @Roles('owner', 'manager', 'agent')
  @ApiOperation({ summary: 'Lister les paiements' })
  findAll(@Query() query: ListPaymentsDto, @CurrentUser() user: any) {
    return this.service.findAll(query, user.tenantId);
  }

  @Get(':id')
  @Roles('owner', 'manager', 'agent')
  @ApiOperation({ summary: 'Détail d\'un paiement' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.service.findOne(id, user.tenantId);
  }

  @Delete(':id')
  @Roles('owner', 'manager')
  @HttpCode(204)
  @ApiOperation({ summary: 'Annuler un paiement (inverse les effets sur stock + facture)' })
  cancel(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.service.cancel(id, user.tenantId, user.id);
  }
}
