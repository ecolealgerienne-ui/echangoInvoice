import {
  Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PriceListsService } from './price-lists.service';
import { CreatePriceListDto, SetPriceListItemsDto } from './dto/price-list.dto';
import { JwtGuard } from '../common/guards/jwt.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('PriceLists')
@ApiBearerAuth()
@UseGuards(JwtGuard, RolesGuard)
@Controller('price-lists')
export class PriceListsController {
  constructor(private readonly service: PriceListsService) {}

  @Get()
  @Roles('owner', 'manager', 'agent')
  @ApiOperation({ summary: 'Lister les grilles tarifaires' })
  findAll(@CurrentUser() user: any) {
    return this.service.findAll(user.tenantId!);
  }

  /**
   * Prix applicables à un client. Déclaré AVANT `:id` : sinon Nest ferait
   * correspondre « for-customer » au paramètre d'identifiant et ParseUUIDPipe
   * rejetterait la route.
   */
  @Get('for-customer/:customerId')
  @Roles('owner', 'manager', 'agent')
  @ApiOperation({ summary: "Prix de la grille d'un client (map article → prix)" })
  resolveForCustomer(
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @CurrentUser() user: any,
  ) {
    return this.service.resolveForCustomer(customerId, user.tenantId!);
  }

  @Get(':id')
  @Roles('owner', 'manager', 'agent')
  @ApiOperation({ summary: "Détail d'une grille avec ses prix" })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.service.findOne(id, user.tenantId!);
  }

  @Post()
  @Roles('owner', 'manager')
  @ApiOperation({ summary: 'Créer une grille tarifaire' })
  create(@Body() dto: CreatePriceListDto, @CurrentUser() user: any) {
    return this.service.create(dto, user.tenantId!, user.id);
  }

  @Put(':id')
  @Roles('owner', 'manager')
  @ApiOperation({ summary: 'Modifier une grille tarifaire' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreatePriceListDto,
    @CurrentUser() user: any,
  ) {
    return this.service.update(id, dto, user.tenantId!, user.id);
  }

  @Put(':id/items')
  @Roles('owner', 'manager')
  @ApiOperation({ summary: "Remplacer les prix d'une grille" })
  setItems(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetPriceListItemsDto,
    @CurrentUser() user: any,
  ) {
    return this.service.setItems(id, dto, user.tenantId!);
  }

  @Delete(':id')
  @Roles('owner', 'manager')
  @ApiOperation({ summary: 'Supprimer une grille (refusé si des clients y sont rattachés)' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.service.remove(id, user.tenantId!);
  }
}
