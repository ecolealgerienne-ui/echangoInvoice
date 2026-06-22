import {
  Controller, Get, Post, Body, Param, Query, ParseUUIDPipe, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { ProductionOrderService } from './production-order.service';
import { CreateProductionOrderDto } from './dto/create-production-order.dto';
import { CompleteProductionOrderDto } from './dto/complete-production-order.dto';
import { CreateProductionMovementDto } from './dto/create-production-movement.dto';
import { ListProductionOrdersDto } from './dto/list-production-orders.dto';
import { JwtGuard } from '../common/guards/jwt.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { ProductionModuleGuard } from './production-module.guard';

@ApiTags('production/orders')
@ApiBearerAuth()
@UseGuards(JwtGuard, RolesGuard, ProductionModuleGuard)
@Controller('production/orders')
export class ProductionOrderController {
  constructor(private readonly service: ProductionOrderService) {}

  @Get()
  @Roles('owner', 'manager', 'agent')
  @ApiOperation({ summary: 'List production orders' })
  @ApiResponse({ status: 200 })
  findAll(@Query() query: ListProductionOrdersDto, @CurrentUser() user: JwtPayload) {
    return this.service.findAll(query, user.tenantId);
  }

  @Get(':id')
  @Roles('owner', 'manager', 'agent')
  @ApiOperation({ summary: 'Get a production order' })
  @ApiResponse({ status: 200 })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.service.findOne(id, user.tenantId);
  }

  @Post()
  @Roles('owner', 'manager')
  @ApiOperation({ summary: 'Create a production order' })
  @ApiResponse({ status: 201 })
  create(@Body() dto: CreateProductionOrderDto, @CurrentUser() user: JwtPayload) {
    return this.service.create(dto, user.tenantId, user.sub);
  }

  @Post(':id/start')
  @Roles('owner', 'manager')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Start a production order (reserve raw materials)' })
  @ApiResponse({ status: 200 })
  start(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.service.start(id, user.tenantId, user.sub);
  }

  @Post(':id/complete')
  @Roles('owner', 'manager')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Complete a production order (decrement stock, update finished product)' })
  @ApiResponse({ status: 200 })
  complete(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CompleteProductionOrderDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.complete(id, dto, user.tenantId, user.sub);
  }

  @Post(':id/cancel')
  @Roles('owner', 'manager')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel a production order' })
  @ApiResponse({ status: 200 })
  cancel(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.service.cancel(id, user.tenantId, user.sub);
  }

  @Post(':id/movements')
  @Roles('owner', 'manager', 'agent')
  @ApiOperation({ summary: 'Log a production movement' })
  @ApiResponse({ status: 201 })
  addMovement(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateProductionMovementDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.addMovement(id, dto, user.tenantId, user.sub);
  }
}
