import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { ProductionDashboardService } from './production-dashboard.service';
import { JwtGuard } from '../common/guards/jwt.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { ProductionModuleGuard } from './production-module.guard';

@ApiTags('Production — Dashboard')
@ApiBearerAuth()
@UseGuards(JwtGuard, RolesGuard, ProductionModuleGuard)
@Controller('production/dashboard')
export class ProductionDashboardController {
  constructor(private readonly service: ProductionDashboardService) {}

  @Get()
  @Roles('owner', 'manager')
  @ApiOperation({ summary: 'Dashboard production : KPIs, stock critique, production/jour' })
  @ApiResponse({ status: 200 })
  getDashboard(@CurrentUser() user: JwtPayload) {
    return this.service.getDashboard(user.tenantId);
  }
}
