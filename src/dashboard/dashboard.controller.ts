import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { JwtGuard } from '../common/guards/jwt.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Dashboard')
@ApiBearerAuth()
@UseGuards(JwtGuard, RolesGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  @Get('stats')
  @Roles('owner', 'manager')
  @ApiOperation({ summary: 'Statistiques globales du mois' })
  @ApiQuery({ name: 'month', example: '2024-06' })
  getStats(@Query('month') month: string, @CurrentUser() user: any) {
    const m = month ?? new Date().toISOString().slice(0, 7);
    return this.service.getStats(user.tenantId!, m);
  }

  @Get('charts/sales')
  @Roles('owner', 'manager')
  @ApiOperation({ summary: 'Données graphiques des ventes' })
  @ApiQuery({ name: 'month', example: '2024-06' })
  getSalesChart(@Query('month') month: string, @CurrentUser() user: any) {
    const m = month ?? new Date().toISOString().slice(0, 7);
    return this.service.getSalesChart(user.tenantId!, m);
  }

  @Get('charts/stock')
  @Roles('owner', 'manager')
  @ApiOperation({ summary: 'Données graphiques du stock' })
  getStockChart(@CurrentUser() user: any) {
    return this.service.getStockChart(user.tenantId!);
  }
}
