import {
  Body, Controller, Get, Param, ParseUUIDPipe,
  Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { StockService } from './stock.service';
import { ListInventoryDto } from './dto/list-inventory.dto';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { SetThresholdDto } from './dto/set-threshold.dto';
import { JwtGuard } from '../common/guards/jwt.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Stock')
@ApiBearerAuth()
@UseGuards(JwtGuard, TenantGuard, RolesGuard)
@Controller('stock')
export class StockController {
  constructor(private readonly service: StockService) {}

  @Get('inventory')
  @Roles('owner', 'manager', 'agent', 'accountant')
  @ApiOperation({ summary: 'Inventaire courant par matière première' })
  getInventory(@Query() query: ListInventoryDto, @CurrentUser() user: any) {
    return this.service.getInventory(user.tenantId!, query);
  }

  @Get('alerts')
  @Roles('owner', 'manager', 'agent', 'accountant')
  @ApiOperation({ summary: 'Alertes stock (expiration et seuil bas)' })
  getAlerts(@CurrentUser() user: any) {
    return this.service.getAlerts(user.tenantId!);
  }

  @Post('adjust')
  @Roles('owner', 'manager')
  @ApiOperation({ summary: 'Ajustement manuel du stock' })
  adjust(@Body() dto: AdjustStockDto, @CurrentUser() user: any) {
    return this.service.adjust(user.tenantId!, dto, user.id);
  }

  @Patch('inventory/:rawMaterialId/threshold')
  @Roles('owner', 'manager')
  @ApiOperation({ summary: 'Définir le seuil d\'alerte d\'une matière' })
  setThreshold(
    @Param('rawMaterialId', ParseUUIDPipe) rawMaterialId: string,
    @Body() dto: SetThresholdDto,
    @CurrentUser() user: any,
  ) {
    return this.service.setThreshold(user.tenantId!, rawMaterialId, dto);
  }

  @Get('entries/:rawMaterialId')
  @Roles('owner', 'manager', 'agent', 'accountant')
  @ApiOperation({ summary: 'Lots de stock pour une matière première' })
  listEntries(
    @Param('rawMaterialId', ParseUUIDPipe) rawMaterialId: string,
    @Query('page') page: string,
    @Query('limit') limit: string,
    @CurrentUser() user: any,
  ) {
    return this.service.listEntries(user.tenantId!, rawMaterialId, parseInt(page) || 1, parseInt(limit) || 20);
  }
}
