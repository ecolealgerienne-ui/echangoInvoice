import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, ParseUUIDPipe, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { NomenclatureService } from './nomenclature.service';
import { CreateNomenclatureDto } from './dto/create-nomenclature.dto';
import { UpdateNomenclatureDto } from './dto/update-nomenclature.dto';
import { JwtGuard } from '../common/guards/jwt.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { ProductionModuleGuard } from './production-module.guard';

@ApiTags('Production — Nomenclatures')
@ApiBearerAuth()
@UseGuards(JwtGuard, RolesGuard, ProductionModuleGuard)
@Controller('production/nomenclatures')
export class NomenclatureController {
  constructor(private readonly service: NomenclatureService) {}

  @Get()
  @Roles('owner', 'manager', 'agent')
  @ApiOperation({ summary: 'Liste des nomenclatures (BOMs)' })
  @ApiResponse({ status: 200 })
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('finishedProductId') finishedProductId?: string,
  ) {
    return this.service.findAll(user.tenantId, page, limit, search, status, finishedProductId);
  }

  @Get(':id')
  @Roles('owner', 'manager', 'agent')
  @ApiOperation({ summary: 'Détail d\'une nomenclature' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404, description: 'nomenclature_not_found' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.service.findOne(id, user.tenantId);
  }

  @Post()
  @Roles('owner', 'manager')
  @ApiOperation({ summary: 'Créer une nomenclature' })
  @ApiResponse({ status: 201 })
  @ApiResponse({ status: 404, description: 'raw_material_not_found' })
  create(@Body() dto: CreateNomenclatureDto, @CurrentUser() user: JwtPayload) {
    return this.service.create(dto, user.tenantId, user.sub);
  }

  @Patch(':id')
  @Roles('owner', 'manager')
  @ApiOperation({ summary: 'Mettre à jour une nomenclature' })
  @ApiResponse({ status: 200 })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateNomenclatureDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.update(id, dto, user.tenantId, user.sub);
  }

  @Delete(':id')
  @Roles('owner', 'manager')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Supprimer une nomenclature (soft delete)' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 409, description: 'nomenclature_has_active_orders' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.service.remove(id, user.tenantId);
  }
}
