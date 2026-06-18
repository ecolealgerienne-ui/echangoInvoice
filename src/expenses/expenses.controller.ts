import {
  Body, Controller, Delete, Get, HttpCode,
  Param, ParseUUIDPipe, Patch, Post, Put, Query, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ExpensesService } from './expenses.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { ListExpensesDto } from './dto/list-expenses.dto';
import { JwtGuard } from '../common/guards/jwt.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Expenses')
@ApiBearerAuth()
@UseGuards(JwtGuard, RolesGuard)
@Controller('expenses')
export class ExpensesController {
  constructor(private readonly service: ExpensesService) {}

  @Post()
  @Roles('owner', 'manager', 'agent')
  @ApiOperation({ summary: 'Créer une dépense' })
  create(@Body() dto: CreateExpenseDto, @CurrentUser() user: any) {
    return this.service.create(dto, user.tenantId, user.id);
  }

  @Get('summary')
  @Roles('owner', 'manager')
  @ApiOperation({ summary: 'Résumé mensuel des dépenses' })
  @ApiQuery({ name: 'month', example: '2024-06' })
  getSummary(@Query('month') month: string, @CurrentUser() user: any) {
    const m = month ?? new Date().toISOString().slice(0, 7);
    return this.service.getSummary(user.tenantId, m);
  }

  @Get()
  @Roles('owner', 'manager', 'agent')
  @ApiOperation({ summary: 'Lister les dépenses' })
  findAll(@Query() query: ListExpensesDto, @CurrentUser() user: any) {
    return this.service.findAll(query, user.tenantId);
  }

  @Get(':id')
  @Roles('owner', 'manager', 'agent')
  @ApiOperation({ summary: 'Détail d\'une dépense' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.service.findOne(id, user.tenantId);
  }

  @Put(':id')
  @Roles('owner', 'manager', 'agent')
  @ApiOperation({ summary: 'Modifier une dépense (non approuvée uniquement)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateExpenseDto,
    @CurrentUser() user: any,
  ) {
    return this.service.update(id, dto, user.tenantId, user.id);
  }

  @Patch(':id/approve')
  @Roles('owner', 'manager')
  @ApiOperation({ summary: 'Approuver une dépense' })
  approve(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.service.approve(id, user.tenantId, user.id);
  }

  @Delete(':id')
  @Roles('owner', 'manager')
  @HttpCode(204)
  @ApiOperation({ summary: 'Supprimer une dépense (non approuvée uniquement)' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.service.remove(id, user.tenantId, user.id);
  }
}
