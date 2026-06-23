import { Body, Controller, Get, Post, Query, Request, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtGuard } from '../../common/guards/jwt.guard';
import { AdminGuard } from '../guards/admin.guard';
import { AdminSaasPaymentsService } from './admin-saas-payments.service';
import { CreateSaasPaymentDto } from '../dto/create-saas-payment.dto';
import { ListSaasPaymentsDto } from '../dto/list-saas-payments.dto';

@ApiTags('admin')
@Controller('admin/saas-payments')
@UseGuards(JwtGuard, AdminGuard)
export class AdminSaasPaymentsController {
  constructor(private readonly service: AdminSaasPaymentsService) {}

  @Get()
  @ApiOperation({ summary: 'List all SaaS payments' })
  findAll(@Query() dto: ListSaasPaymentsDto) {
    return this.service.findAll(dto);
  }

  @Get('summary')
  @ApiOperation({ summary: 'MRR actual this month' })
  summary() {
    return this.service.summary();
  }

  @Post()
  @ApiOperation({ summary: 'Record a manual SaaS payment' })
  create(@Body() dto: CreateSaasPaymentDto, @Request() req: any) {
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() ?? req.ip ?? null;
    return this.service.create(dto, req.user.sub, req.user.email, ip);
  }
}
