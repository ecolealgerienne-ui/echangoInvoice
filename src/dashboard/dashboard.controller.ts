import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { DashboardQueryDto } from './dto/dashboard-query.dto';
import { JwtGuard } from '../common/guards/jwt.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Dashboard')
@ApiBearerAuth()
@UseGuards(JwtGuard, TenantGuard, RolesGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  @Get('stats')
  @Roles('owner', 'manager')
  @ApiOperation({ summary: 'Statistiques globales du mois' })
  getStats(@Query() query: DashboardQueryDto, @CurrentUser() user: any) {
    return this.service.getStats(user.tenantId!, query.month);
  }

  @Get('charts/sales')
  @Roles('owner', 'manager')
  @ApiOperation({ summary: 'Données graphiques des ventes' })
  getSalesChart(@Query() query: DashboardQueryDto, @CurrentUser() user: any) {
    return this.service.getSalesChart(user.tenantId!, query.month);
  }

  @Get('charts/stock')
  @Roles('owner', 'manager')
  @ApiOperation({ summary: 'Données graphiques du stock' })
  getStockChart(@CurrentUser() user: any) {
    return this.service.getStockChart(user.tenantId!);
  }
}
