import {
  Controller, Get, Post, Put, Delete,
  Body, Param, Query, HttpCode, HttpStatus, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { CustomersService } from './customers.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { ListCustomersDto } from './dto/list-customers.dto';
import { CreateCustomerContactDto } from './dto/create-customer-contact.dto';
import { JwtGuard } from '../common/guards/jwt.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

@ApiTags('customers')
@ApiBearerAuth()
@UseGuards(JwtGuard, TenantGuard, RolesGuard)
@Controller('customers')
export class CustomersController {
  constructor(private readonly service: CustomersService) {}

  @Post()
  @Roles('owner', 'manager')
  @ApiOperation({ summary: 'Create a customer' })
  @ApiResponse({ status: 201 })
  create(@Body() dto: CreateCustomerDto, @CurrentUser() user: JwtPayload) {
    return this.service.create(dto, user.tenantId!, user.sub);
  }

  @Get()
  @Roles('owner', 'manager', 'agent', 'accountant')
  @ApiOperation({ summary: 'List customers (paginated)' })
  findAll(@Query() query: ListCustomersDto, @CurrentUser() user: JwtPayload) {
    return this.service.findAll(query, user.tenantId!);
  }

  @Get(':id')
  @Roles('owner', 'manager', 'agent', 'accountant')
  @ApiOperation({ summary: 'Get customer with history' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404 })
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.findOne(id, user.tenantId!);
  }

  @Put(':id')
  @Roles('owner', 'manager')
  @ApiOperation({ summary: 'Update customer' })
  update(@Param('id') id: string, @Body() dto: UpdateCustomerDto, @CurrentUser() user: JwtPayload) {
    return this.service.update(id, dto, user.tenantId!, user.sub);
  }

  @Delete(':id')
  @Roles('owner')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft delete customer' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 422 })
  remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.remove(id, user.tenantId!);
  }

  // ─── Contacts ─────────────────────────────────────────────────────────────

  @Get(':id/contacts')
  @Roles('owner', 'manager', 'agent', 'accountant')
  @ApiOperation({ summary: 'Lister les contacts d\'un client' })
  listContacts(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.listContacts(id, user.tenantId!);
  }

  @Post(':id/contacts')
  @Roles('owner', 'manager')
  @ApiOperation({ summary: 'Ajouter un contact à un client' })
  createContact(
    @Param('id') id: string,
    @Body() dto: CreateCustomerContactDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.createContact(id, dto, user.tenantId!, user.sub);
  }

  @Put(':id/contacts/:contactId')
  @Roles('owner', 'manager')
  @ApiOperation({ summary: 'Modifier un contact' })
  updateContact(
    @Param('id') id: string,
    @Param('contactId') contactId: string,
    @Body() dto: CreateCustomerContactDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.updateContact(contactId, id, dto, user.tenantId!, user.sub);
  }

  @Delete(':id/contacts/:contactId')
  @Roles('owner', 'manager')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Supprimer un contact' })
  removeContact(
    @Param('id') id: string,
    @Param('contactId') contactId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.removeContact(contactId, id, user.tenantId!);
  }
}
