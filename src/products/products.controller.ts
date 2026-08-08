import {
  Controller, Get, Post, Put, Delete,
  Body, Param, Query, HttpCode, HttpStatus, UseGuards, ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { ProductsService } from './products.service';
import { BarcodesService } from './barcodes.service';
import { CreateBarcodeDto } from './dto/create-barcode.dto';
import { ProductSuppliersService } from './product-suppliers.service';
import { CreateProductSupplierDto } from './dto/create-product-supplier.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ListProductsDto } from './dto/list-products.dto';
import { JwtGuard } from '../common/guards/jwt.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

@ApiTags('products')
@ApiBearerAuth()
@UseGuards(JwtGuard, TenantGuard, RolesGuard)
@Controller('products')
export class ProductsController {
  constructor(
    private readonly service: ProductsService,
    private readonly barcodes: BarcodesService,
    private readonly fournisseurs: ProductSuppliersService,
  ) {}

  @Get(':id/suppliers')
  @Roles('owner', 'manager', 'agent')
  @ApiOperation({ summary: "Fournisseurs d'un article, préféré puis moins cher" })
  listerFournisseurs(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.fournisseurs.lister(id, user.tenantId!);
  }

  @Post(':id/suppliers')
  @Roles('owner', 'manager')
  @ApiOperation({ summary: 'Associer un fournisseur à un article' })
  ajouterFournisseur(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateProductSupplierDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.fournisseurs.ajouter(id, dto, user.tenantId!, user.sub);
  }

  @Delete('suppliers/:linkId')
  @Roles('owner', 'manager')
  @ApiOperation({ summary: "Retirer un fournisseur d'un article" })
  retirerFournisseur(@Param('linkId', ParseUUIDPipe) linkId: string, @CurrentUser() user: JwtPayload) {
    return this.fournisseurs.retirer(linkId, user.tenantId!);
  }

  /**
   * Résolution d'un scan. Déclarée avant `:id` : « by-barcode » n'est pas un
   * UUID, mais l'ordre des routes se lit, il ne se devine pas.
   */
  @Get('by-barcode/:code')
  @Roles('owner', 'manager', 'agent')
  @ApiOperation({ summary: "Retrouver un article par son code-barres ou sa référence" })
  parCodeBarres(@Param('code') code: string, @CurrentUser() user: JwtPayload) {
    return this.barcodes.parCodeBarres(code, user.tenantId!);
  }

  @Get(':id/barcodes')
  @Roles('owner', 'manager', 'agent')
  @ApiOperation({ summary: "Codes-barres d'un article" })
  listerCodes(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.barcodes.lister(id, user.tenantId!);
  }

  @Post(':id/barcodes')
  @Roles('owner', 'manager')
  @ApiOperation({ summary: "Associer un code-barres à un article" })
  ajouterCode(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateBarcodeDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.barcodes.creer(id, dto, user.tenantId!, user.sub);
  }

  @Delete('barcodes/:barcodeId')
  @Roles('owner', 'manager')
  @ApiOperation({ summary: 'Retirer un code-barres' })
  retirerCode(@Param('barcodeId', ParseUUIDPipe) barcodeId: string, @CurrentUser() user: JwtPayload) {
    return this.barcodes.supprimer(barcodeId, user.tenantId!);
  }

  @Post()
  @Roles('owner', 'manager')
  @ApiOperation({ summary: 'Create a finished product' })
  @ApiResponse({ status: 201 })
  create(@Body() dto: CreateProductDto, @CurrentUser() user: JwtPayload) {
    return this.service.create(dto, user.tenantId!, user.sub);
  }

  @Get()
  @Roles('owner', 'manager', 'agent')
  @ApiOperation({ summary: 'List finished products (paginated)' })
  findAll(@Query() query: ListProductsDto, @CurrentUser() user: JwtPayload) {
    return this.service.findAll(query, user.tenantId!);
  }

  @Get(':id')
  @Roles('owner', 'manager', 'agent')
  @ApiOperation({ summary: 'Get a finished product' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404 })
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.findOne(id, user.tenantId!);
  }

  @Put(':id')
  @Roles('owner', 'manager')
  @ApiOperation({ summary: 'Update finished product' })
  update(@Param('id') id: string, @Body() dto: UpdateProductDto, @CurrentUser() user: JwtPayload) {
    return this.service.update(id, dto, user.tenantId!, user.sub);
  }

  @Delete(':id')
  @Roles('owner')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft delete product (blocked if used in BL or invoice)' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 422 })
  remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.remove(id, user.tenantId!);
  }
}
