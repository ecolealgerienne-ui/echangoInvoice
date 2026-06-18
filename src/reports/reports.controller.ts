import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { ReportQueryDto, ExpenseReportQueryDto } from './dto/report-query.dto';
import { JwtGuard } from '../common/guards/jwt.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Reports')
@ApiBearerAuth()
@UseGuards(JwtGuard, RolesGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly service: ReportsService) {}

  @Get('sales')
  @Roles('owner', 'manager')
  @ApiOperation({ summary: 'Rapport des ventes sur une période' })
  getSales(@Query() query: ReportQueryDto, @CurrentUser() user: any) {
    return this.service.getSalesReport(user.tenantId, query);
  }

  @Get('purchases')
  @Roles('owner', 'manager')
  @ApiOperation({ summary: 'Rapport des achats sur une période' })
  getPurchases(@Query() query: ReportQueryDto, @CurrentUser() user: any) {
    return this.service.getPurchasesReport(user.tenantId, query);
  }

  @Get('expenses')
  @Roles('owner', 'manager')
  @ApiOperation({ summary: 'Rapport des dépenses sur une période' })
  getExpenses(@Query() query: ExpenseReportQueryDto, @CurrentUser() user: any) {
    return this.service.getExpensesReport(user.tenantId, query);
  }

  @Get('stock')
  @Roles('owner', 'manager')
  @ApiOperation({ summary: 'État courant du stock' })
  getStock(@CurrentUser() user: any) {
    return this.service.getStockReport(user.tenantId);
  }
}
