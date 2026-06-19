import {
  Body, Controller, Delete, Get, HttpCode, Param,
  ParseUUIDPipe, Patch, Post, Put, Query, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SalesInvoicesService } from './sales-invoices.service';
import { CreateSalesInvoiceDto } from './dto/create-sales-invoice.dto';
import { UpdateInvoiceStatusDto } from './dto/update-invoice-status.dto';
import { ListInvoicesDto } from './dto/list-invoices.dto';
import { JwtGuard } from '../common/guards/jwt.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Invoices')
@ApiBearerAuth()
@UseGuards(JwtGuard, RolesGuard)
@Controller('invoices/sales-invoices')
export class InvoicesController {
  constructor(private readonly service: SalesInvoicesService) {}

  @Post()
  @Roles('owner', 'manager', 'agent')
  @ApiOperation({ summary: 'Créer une facture (standalone, depuis BL, ou depuis devis)' })
  create(@Body() dto: CreateSalesInvoiceDto, @CurrentUser() user: any) {
    return this.service.create(dto, user.tenantId, user.id);
  }

  @Get()
  @Roles('owner', 'manager', 'agent')
  @ApiOperation({ summary: 'Lister les factures' })
  findAll(@Query() query: ListInvoicesDto, @CurrentUser() user: any) {
    return this.service.findAll(query, user.tenantId);
  }

  @Get(':id')
  @Roles('owner', 'manager', 'agent')
  @ApiOperation({ summary: 'Détail d\'une facture' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.service.findOne(id, user.tenantId);
  }

  @Put(':id')
  @Roles('owner', 'manager', 'agent')
  @ApiOperation({ summary: 'Modifier une facture (draft uniquement)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateSalesInvoiceDto,
    @CurrentUser() user: any,
  ) {
    return this.service.update(id, dto, user.tenantId, user.id);
  }

  @Patch(':id/status')
  @Roles('owner', 'manager')
  @ApiOperation({ summary: 'Changer le statut (draft→sent, *→cancelled)' })
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateInvoiceStatusDto,
    @CurrentUser() user: any,
  ) {
    return this.service.updateStatus(id, dto, user.tenantId, user.id);
  }

  @Delete(':id')
  @Roles('owner')
  @HttpCode(204)
  @ApiOperation({ summary: 'Supprimer une facture (draft uniquement)' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.service.remove(id, user.tenantId, user.id);
  }
}
