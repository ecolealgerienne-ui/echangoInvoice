import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtGuard } from '../../common/guards/jwt.guard';
import { AdminGuard } from '../guards/admin.guard';
import { AdminStatsService } from './admin-stats.service';

@ApiTags('admin')
@Controller('admin/stats')
@UseGuards(JwtGuard, AdminGuard)
export class AdminStatsController {
  constructor(private readonly service: AdminStatsService) {}

  @Get()
  @ApiOperation({ summary: 'Global admin stats (MRR, ARR, tenants)' })
  getStats() {
    return this.service.getStats();
  }
}
