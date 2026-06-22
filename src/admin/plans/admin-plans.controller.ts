import { Body, Controller, Get, Param, Put, Request, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtGuard } from '../../common/guards/jwt.guard';
import { AdminGuard } from '../guards/admin.guard';
import { AdminPlansService } from './admin-plans.service';
import { UpdatePlanDto } from '../dto/update-plan.dto';

@ApiTags('admin')
@Controller('admin/plans')
@UseGuards(JwtGuard, AdminGuard)
export class AdminPlansController {
  constructor(private readonly service: AdminPlansService) {}

  @Get()
  @ApiOperation({ summary: 'List all plans' })
  findAll() {
    return this.service.findAll();
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a plan' })
  update(@Param('id') id: string, @Body() dto: UpdatePlanDto, @Request() req: any) {
    return this.service.update(id, dto, req.user.email);
  }
}
