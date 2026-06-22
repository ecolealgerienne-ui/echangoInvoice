import {
  Controller, Get, Post, Put, Delete,
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

@ApiTags('production/nomenclatures')
@ApiBearerAuth()
@UseGuards(JwtGuard, RolesGuard, ProductionModuleGuard)
@Controller('production/nomenclatures')
export class NomenclatureController {
  constructor(private readonly service: NomenclatureService) {}

  @Get()
  @Roles('owner', 'manager', 'agent')
  @ApiOperation({ summary: 'List nomenclatures (BOMs)' })
  @ApiResponse({ status: 200 })
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
  ) {
    return this.service.findAll(user.tenantId, page, limit, search);
  }

  @Get(':id')
  @Roles('owner', 'manager', 'agent')
  @ApiOperation({ summary: 'Get a nomenclature by id' })
  @ApiResponse({ status: 200 })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.service.findOne(id, user.tenantId);
  }

  @Post()
  @Roles('owner', 'manager')
  @ApiOperation({ summary: 'Create a nomenclature' })
  @ApiResponse({ status: 201 })
  create(@Body() dto: CreateNomenclatureDto, @CurrentUser() user: JwtPayload) {
    return this.service.create(dto, user.tenantId, user.sub);
  }

  @Put(':id')
  @Roles('owner', 'manager')
  @ApiOperation({ summary: 'Update a nomenclature' })
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
  @ApiOperation({ summary: 'Delete a nomenclature (soft)' })
  @ApiResponse({ status: 200 })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.service.remove(id, user.tenantId);
  }
}
