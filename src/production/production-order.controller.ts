import {
  Controller, Get, Post, Patch, Body, Param, Query, ParseUUIDPipe, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { ProductionOrderService } from './production-order.service';
import { ProductionMovementService } from './production-movement.service';
import { CreateProductionOrderDto } from './dto/create-production-order.dto';
import { CompleteProductionOrderDto } from './dto/complete-production-order.dto';
import { CancelProductionOrderDto } from './dto/cancel-production-order.dto';
import { CreateProductionMovementDto } from './dto/create-production-movement.dto';
import { ListProductionOrdersDto } from './dto/list-production-orders.dto';
import { JwtGuard } from '../common/guards/jwt.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { ProductionModuleGuard } from './production-module.guard';

@ApiTags('Production — Ordres')
@ApiBearerAuth()
@UseGuards(JwtGuard, RolesGuard, ProductionModuleGuard)
@Controller('production/orders')
export class ProductionOrderController {
  constructor(
    private readonly orderService: ProductionOrderService,
    private readonly movementService: ProductionMovementService,
  ) {}

  @Get()
  @Roles('owner', 'manager', 'agent')
  @ApiOperation({ summary: 'Liste des ordres de production' })
  @ApiResponse({ status: 200 })
  findAll(@Query() query: ListProductionOrdersDto, @CurrentUser() user: JwtPayload) {
    return this.orderService.findAll(query, user.tenantId);
  }

  @Get(':id')
  @Roles('owner', 'manager', 'agent')
  @ApiOperation({ summary: 'Détail d\'un ordre de production' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404, description: 'production_order_not_found' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.orderService.findOne(id, user.tenantId);
  }

  @Post()
  @Roles('owner', 'manager')
  @ApiOperation({ summary: 'Créer un ordre de production' })
  @ApiResponse({ status: 201 })
  create(@Body() dto: CreateProductionOrderDto, @CurrentUser() user: JwtPayload) {
    return this.orderService.create(dto, user.tenantId, user.sub);
  }

  @Patch(':id/start')
  @Roles('owner', 'manager')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Démarrer un ordre (planned → in_progress, réserve MP)' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 400, description: 'production_order_not_planned' })
  start(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.orderService.start(id, user.tenantId, user.sub);
  }

  @Patch(':id/complete')
  @Roles('owner', 'manager')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Clôturer un ordre (in_progress → completed)' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 400, description: 'production_order_not_in_progress' })
  complete(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CompleteProductionOrderDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.orderService.complete(id, dto, user.tenantId, user.sub);
  }

  @Patch(':id/cancel')
  @Roles('owner', 'manager')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Annuler un ordre (libère les réservations si in_progress)' })
  @ApiResponse({ status: 200 })
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelProductionOrderDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.orderService.cancel(id, user.tenantId, user.sub, dto.reason);
  }

  // ── Movements ──────────────────────────────────────────────────────────────

  @Get(':id/movements')
  @Roles('owner', 'manager', 'agent')
  @ApiOperation({ summary: 'Journal des mouvements d\'un ordre' })
  @ApiResponse({ status: 200 })
  getMovements(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
    @Query('type') type?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.movementService.findByOrder(id, user.tenantId, type, from, to);
  }

  @Post(':id/movements')
  @Roles('owner', 'manager', 'agent')
  @ApiOperation({ summary: 'Loguer un mouvement de production' })
  @ApiResponse({ status: 201 })
  @ApiResponse({ status: 400, description: 'production_order_not_in_progress' })
  addMovement(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateProductionMovementDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.movementService.create(id, dto, user.tenantId, user.sub);
  }
}
