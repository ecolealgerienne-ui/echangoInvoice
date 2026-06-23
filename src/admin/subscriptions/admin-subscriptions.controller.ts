import { Body, Controller, Param, Patch, Request, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtGuard } from '../../common/guards/jwt.guard';
import { AdminGuard } from '../guards/admin.guard';
import { AdminSubscriptionsService } from './admin-subscriptions.service';
import { PatchSubscriptionDto } from '../dto/patch-subscription.dto';

@ApiTags('admin')
@Controller('admin/subscriptions')
@UseGuards(JwtGuard, AdminGuard)
export class AdminSubscriptionsController {
  constructor(private readonly service: AdminSubscriptionsService) {}

  @Patch(':id')
  @ApiOperation({ summary: 'Update subscription' })
  patch(@Param('id') id: string, @Body() dto: PatchSubscriptionDto, @Request() req: any) {
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() ?? req.ip ?? null;
    return this.service.patch(id, dto, req.user.sub, req.user.email, ip);
  }
}
