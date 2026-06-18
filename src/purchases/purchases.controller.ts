import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, HttpCode, HttpStatus, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { PurchasesService } from './purchases.service';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { ListPurchaseOrdersDto } from './dto/list-purchase-orders.dto';
import { PatchPoStatusDto } from './dto/patch-po-status.dto';
import { CreateReceptionBlDto } from './dto/create-reception-bl.dto';
import { ListReceptionBlsDto } from './dto/list-reception-bls.dto';
import { JwtGuard } from '../common/guards/jwt.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

@ApiTags('purchases')
@ApiBearerAuth()
@UseGuards(JwtGuard, RolesGuard)
@Controller('purchases')
export class PurchasesController {
  constructor(private readonly service: PurchasesService) {}

  // ── Purchase Orders ─────────────────────────────────────────────────────────

  @Post('purchase-orders')
  @Roles('owner', 'manager')
  @ApiOperation({ summary: 'Create a purchase order with items' })
  @ApiResponse({ status: 201 })
  createPo(@Body() dto: CreatePurchaseOrderDto, @CurrentUser() user: JwtPayload) {
    return this.service.createPurchaseOrder(dto, user.tenantId, user.sub);
  }

  @Get('purchase-orders')
  @Roles('owner', 'manager', 'agent')
  @ApiOperation({ summary: 'List purchase orders (paginated + filters)' })
  findAllPos(@Query() query: ListPurchaseOrdersDto, @CurrentUser() user: JwtPayload) {
    return this.service.findAllPurchaseOrders(query, user.tenantId);
  }

  @Get('purchase-orders/:id')
  @Roles('owner', 'manager', 'agent')
  @ApiOperation({ summary: 'Get purchase order with items and receptions' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404 })
  findOnePo(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.findOnePurchaseOrder(id, user.tenantId);
  }

  @Patch('purchase-orders/:id/status')
  @Roles('owner', 'manager')
  @ApiOperation({ summary: 'Change purchase order status' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 422, description: 'Invalid transition or has reception' })
  patchPoStatus(
    @Param('id') id: string,
    @Body() dto: PatchPoStatusDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.patchPoStatus(id, dto, user.tenantId, user.sub);
  }

  @Delete('purchase-orders/:id')
  @Roles('owner')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft delete purchase order (draft or cancelled only)' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 422 })
  removePo(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.removePurchaseOrder(id, user.tenantId);
  }

  // ── Reception BLs ───────────────────────────────────────────────────────────

  @Post('reception-bls')
  @Roles('owner', 'manager')
  @ApiOperation({ summary: 'Create reception BL — creates StockEntries + updates InventorySummary' })
  @ApiResponse({ status: 201 })
  createReceptionBl(@Body() dto: CreateReceptionBlDto, @CurrentUser() user: JwtPayload) {
    return this.service.createReceptionBl(dto, user.tenantId, user.sub);
  }

  @Get('reception-bls')
  @Roles('owner', 'manager', 'agent')
  @ApiOperation({ summary: 'List reception BLs (paginated)' })
  findAllBls(@Query() query: ListReceptionBlsDto, @CurrentUser() user: JwtPayload) {
    return this.service.findAllReceptionBls(query, user.tenantId);
  }

  @Get('reception-bls/:id')
  @Roles('owner', 'manager', 'agent')
  @ApiOperation({ summary: 'Get reception BL with stock entries' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404 })
  findOneBl(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.findOneReceptionBl(id, user.tenantId);
  }
}
