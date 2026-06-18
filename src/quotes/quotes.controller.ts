import {
  Body, Controller, Delete, Get, Param, ParseUUIDPipe,
  Patch, Post, Put, Query, UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth, ApiOperation, ApiResponse, ApiTags,
} from '@nestjs/swagger';
import { QuotesService } from './quotes.service';
import { CreateQuoteDto } from './dto/create-quote.dto';
import { UpdateQuoteDto } from './dto/update-quote.dto';
import { UpdateQuoteStatusDto } from './dto/update-quote-status.dto';
import { ListQuotesDto } from './dto/list-quotes.dto';
import { JwtGuard } from '../common/guards/jwt.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Quotes')
@ApiBearerAuth()
@UseGuards(JwtGuard, RolesGuard)
@Controller('quotes')
export class QuotesController {
  constructor(private readonly quotesService: QuotesService) {}

  @Post()
  @Roles('owner', 'manager', 'agent')
  @ApiOperation({ summary: 'Créer un devis' })
  @ApiResponse({ status: 201 })
  create(@Body() dto: CreateQuoteDto, @CurrentUser() user: any) {
    return this.quotesService.create(dto, user.tenantId, user.id);
  }

  @Get()
  @Roles('owner', 'manager', 'agent')
  @ApiOperation({ summary: 'Lister les devis' })
  findAll(@Query() query: ListQuotesDto, @CurrentUser() user: any) {
    return this.quotesService.findAll(query, user.tenantId);
  }

  @Get(':id')
  @Roles('owner', 'manager', 'agent')
  @ApiOperation({ summary: 'Détail d\'un devis' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.quotesService.findOne(id, user.tenantId);
  }

  @Put(':id')
  @Roles('owner', 'manager')
  @ApiOperation({ summary: 'Modifier un devis (status draft uniquement)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateQuoteDto,
    @CurrentUser() user: any,
  ) {
    return this.quotesService.update(id, dto, user.tenantId, user.id);
  }

  @Patch(':id/status')
  @Roles('owner', 'manager')
  @ApiOperation({ summary: 'Changer le statut d\'un devis' })
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateQuoteStatusDto,
    @CurrentUser() user: any,
  ) {
    return this.quotesService.updateStatus(id, dto, user.tenantId, user.id);
  }

  @Post(':id/convert')
  @Roles('owner', 'manager')
  @ApiOperation({ summary: 'Convertir un devis en facture' })
  @ApiResponse({ status: 201 })
  convert(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.quotesService.convertToInvoice(id, user.tenantId, user.id);
  }

  @Delete(':id')
  @Roles('owner')
  @ApiOperation({ summary: 'Supprimer un devis (draft ou rejected)' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.quotesService.remove(id, user.tenantId, user.id);
  }
}
