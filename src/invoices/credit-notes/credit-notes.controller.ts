import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, Res, UseGuards } from '@nestjs/common';
import { FastifyReply } from 'fastify';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreditNotesService } from './credit-notes.service';
import { InvoicePdfService } from '../invoice-pdf.service';
import { CreateCreditNoteDto } from './dto/create-credit-note.dto';
import { JwtGuard } from '../../common/guards/jwt.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Credit Notes')
@ApiBearerAuth()
@UseGuards(JwtGuard, TenantGuard, RolesGuard)
@Controller('invoices/credit-notes')
export class CreditNotesController {
  constructor(
    private readonly service: CreditNotesService,
    private readonly pdfService: InvoicePdfService,
  ) {}

  @Get(':id/pdf')
  @Roles('owner', 'manager', 'agent')
  @ApiOperation({ summary: "Générer le PDF de l'avoir" })
  async pdf(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: any,
    @Res() reply: FastifyReply,
  ) {
    const { buffer, filename } = await this.pdfService.generateCreditNotePdf(id, user.tenantId!);
    void reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `attachment; filename="${filename}"`)
      .send(buffer);
  }

  @Post()
  @Roles('owner', 'manager')
  @ApiOperation({ summary: 'Créer un avoir (note de crédit)' })
  create(@Body() dto: CreateCreditNoteDto, @CurrentUser() user: any) {
    return this.service.create(dto, user.tenantId!, user.id);
  }

  @Get()
  @Roles('owner', 'manager', 'agent')
  @ApiOperation({ summary: 'Lister les avoirs' })
  findAll(
    @CurrentUser() user: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.findAll(user.tenantId!, page ? parseInt(page) : 1, limit ? parseInt(limit) : 20);
  }

  @Get(':id')
  @Roles('owner', 'manager', 'agent')
  @ApiOperation({ summary: 'Détail d\'un avoir' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.service.findOne(id, user.tenantId!);
  }

  @Patch(':id/issue')
  @Roles('owner', 'manager')
  @ApiOperation({ summary: 'Émettre un avoir (draft → issued)' })
  issue(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.service.issue(id, user.tenantId!, user.id);
  }

  @Patch(':id/cancel')
  @Roles('owner', 'manager')
  @ApiOperation({ summary: 'Annuler un avoir' })
  cancel(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.service.cancel(id, user.tenantId!, user.id);
  }

  @Delete(':id')
  @Roles('owner')
  @ApiOperation({ summary: 'Supprimer un avoir (draft uniquement)' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.service.remove(id, user.tenantId!, user.id);
  }
}
