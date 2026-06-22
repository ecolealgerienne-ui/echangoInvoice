import { Body, Controller, Delete, Get, Param, Patch, Query, Request, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtGuard } from '../../common/guards/jwt.guard';
import { AdminGuard } from '../guards/admin.guard';
import { AdminTenantsService } from './admin-tenants.service';
import { ListTenantsDto } from '../dto/list-tenants.dto';
import { PatchTenantStatusDto } from '../dto/patch-tenant-status.dto';

@ApiTags('admin')
@Controller('admin/tenants')
@UseGuards(JwtGuard, AdminGuard)
export class AdminTenantsController {
  constructor(private readonly service: AdminTenantsService) {}

  @Get()
  @ApiOperation({ summary: 'List all tenants' })
  findAll(@Query() dto: ListTenantsDto) {
    return this.service.findAll(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get tenant detail' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Change tenant status' })
  patchStatus(@Param('id') id: string, @Body() dto: PatchTenantStatusDto, @Request() req: any) {
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() ?? req.ip ?? null;
    return this.service.patchStatus(id, dto, req.user.sub, req.user.email, ip);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft delete tenant' })
  remove(@Param('id') id: string, @Request() req: any) {
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() ?? req.ip ?? null;
    return this.service.remove(id, req.user.sub, req.user.email, ip);
  }
}
