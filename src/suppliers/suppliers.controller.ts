import {
  Controller, Get, Post, Put, Delete,
  Body, Param, Query, HttpCode, HttpStatus,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags, ApiOperation, ApiResponse, ApiBearerAuth,
} from '@nestjs/swagger';
import { SuppliersService } from './suppliers.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { ListSuppliersDto } from './dto/list-suppliers.dto';
import { CreateCustomerContactDto } from '../customers/dto/create-customer-contact.dto';
import { JwtGuard } from '../common/guards/jwt.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

@ApiTags('suppliers')
@ApiBearerAuth()
@UseGuards(JwtGuard, RolesGuard)
@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly service: SuppliersService) {}

  @Post()
  @Roles('owner', 'manager')
  @ApiOperation({ summary: 'Create a supplier' })
  @ApiResponse({ status: 201 })
  create(@Body() dto: CreateSupplierDto, @CurrentUser() user: JwtPayload) {
    return this.service.create(dto, user.tenantId!, user.sub);
  }

  @Get()
  @Roles('owner', 'manager', 'agent')
  @ApiOperation({ summary: 'List suppliers (paginated)' })
  @ApiResponse({ status: 200 })
  findAll(@Query() query: ListSuppliersDto, @CurrentUser() user: JwtPayload) {
    return this.service.findAll(query, user.tenantId!);
  }

  @Get(':id')
  @Roles('owner', 'manager', 'agent')
  @ApiOperation({ summary: 'Get supplier with raw materials' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404 })
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.findOne(id, user.tenantId!);
  }

  @Put(':id')
  @Roles('owner', 'manager')
  @ApiOperation({ summary: 'Update supplier' })
  @ApiResponse({ status: 200 })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateSupplierDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.update(id, dto, user.tenantId!, user.sub);
  }

  @Delete(':id')
  @Roles('owner')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft delete supplier' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 422, description: 'Supplier has linked purchase orders' })
  remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.remove(id, user.tenantId!);
  }

  // ─── Contacts ─────────────────────────────────────────────────────────────

  @Get(':id/contacts')
  @Roles('owner', 'manager', 'agent')
  @ApiOperation({ summary: 'Lister les contacts d\'un fournisseur' })
  listContacts(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.listContacts(id, user.tenantId!);
  }

  @Post(':id/contacts')
  @Roles('owner', 'manager')
  @ApiOperation({ summary: 'Ajouter un contact à un fournisseur' })
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
