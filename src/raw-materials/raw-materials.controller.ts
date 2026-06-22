import {
  Controller, Get, Post, Put, Delete,
  Body, Param, Query, HttpCode, HttpStatus, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { RawMaterialsService } from './raw-materials.service';
import { CreateRawMaterialDto } from './dto/create-raw-material.dto';
import { UpdateRawMaterialDto } from './dto/update-raw-material.dto';
import { ListRawMaterialsDto } from './dto/list-raw-materials.dto';
import { JwtGuard } from '../common/guards/jwt.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

@ApiTags('raw-materials')
@ApiBearerAuth()
@UseGuards(JwtGuard, RolesGuard)
@Controller('raw-materials')
export class RawMaterialsController {
  constructor(private readonly service: RawMaterialsService) {}

  @Post()
  @Roles('owner', 'manager')
  @ApiOperation({ summary: 'Create a raw material' })
  @ApiResponse({ status: 201 })
  create(@Body() dto: CreateRawMaterialDto, @CurrentUser() user: JwtPayload) {
    return this.service.create(dto, user.tenantId!, user.sub);
  }

  @Get()
  @Roles('owner', 'manager', 'agent')
  @ApiOperation({ summary: 'List raw materials (paginated)' })
  findAll(@Query() query: ListRawMaterialsDto, @CurrentUser() user: JwtPayload) {
    return this.service.findAll(query, user.tenantId!);
  }

  @Get(':id')
  @Roles('owner', 'manager', 'agent')
  @ApiOperation({ summary: 'Get a raw material' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404 })
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.findOne(id, user.tenantId!);
  }

  @Put(':id')
  @Roles('owner', 'manager')
  @ApiOperation({ summary: 'Update raw material' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateRawMaterialDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.update(id, dto, user.tenantId!, user.sub);
  }

  @Delete(':id')
  @Roles('owner')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft delete raw material' })
  @ApiResponse({ status: 204 })
  remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.remove(id, user.tenantId!);
  }
}
