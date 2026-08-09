import {
  Controller, Get, Post, Patch, Delete, Put, Res,
  Body, Param, Query, HttpCode, HttpStatus, UseGuards, ParseUUIDPipe,
} from '@nestjs/common';
import { FastifyReply } from 'fastify';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { PurchasesService } from './purchases.service';
import { PurchasePdfService } from './purchase-pdf.service';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { ListPurchaseOrdersDto } from './dto/list-purchase-orders.dto';
import { PatchPoStatusDto } from './dto/patch-po-status.dto';
import { CreateReceptionBlDto } from './dto/create-reception-bl.dto';
import { ListReceptionBlsDto } from './dto/list-reception-bls.dto';
import { UpdatePurchaseOrderDto } from './dto/update-purchase-order.dto';
import { CreateVendorBillDto } from './dto/create-vendor-bill.dto';
import { ListVendorBillsDto } from './dto/list-vendor-bills.dto';
import { PatchVendorBillStatusDto } from './dto/patch-vendor-bill-status.dto';
import { RecordVendorPaymentDto } from './dto/record-vendor-payment.dto';
import { JwtGuard } from '../common/guards/jwt.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

@ApiTags('purchases')
@ApiBearerAuth()
@UseGuards(JwtGuard, TenantGuard, RolesGuard)
@Controller('purchases')
export class PurchasesController {
  constructor(
    private readonly service: PurchasesService,
    private readonly pdfService: PurchasePdfService,
  ) {}

  // ── Purchase Orders ─────────────────────────────────────────────────────────

  @Post('purchase-orders')
  @Roles('owner', 'manager')
  @ApiOperation({ summary: 'Create a purchase order with items' })
  @ApiResponse({ status: 201 })
  createPo(@Body() dto: CreatePurchaseOrderDto, @CurrentUser() user: JwtPayload) {
    return this.service.createPurchaseOrder(dto, user.tenantId!, user.sub);
  }

  @Get('purchase-orders')
  @Roles('owner', 'manager', 'agent', 'accountant')
  @ApiOperation({ summary: 'List purchase orders (paginated + filters)' })
  findAllPos(@Query() query: ListPurchaseOrdersDto, @CurrentUser() user: JwtPayload) {
    return this.service.findAllPurchaseOrders(query, user.tenantId!);
  }

  @Get('purchase-orders/:id')
  @Roles('owner', 'manager', 'agent', 'accountant')
  @ApiOperation({ summary: 'Get purchase order with items and receptions' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404 })
  findOnePo(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.findOnePurchaseOrder(id, user.tenantId!);
  }

  @Patch('purchase-orders/:id')
  @Roles('owner', 'manager')
  @ApiOperation({ summary: 'Update draft purchase order (supplier, dates, items)' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 422, description: 'Not draft' })
  updatePo(
    @Param('id') id: string,
    @Body() dto: UpdatePurchaseOrderDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.updatePurchaseOrder(id, dto, user.tenantId!, user.sub);
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
    return this.service.patchPoStatus(id, dto, user.tenantId!, user.sub);
  }

  @Delete('purchase-orders/:id')
  @Roles('owner')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft delete purchase order (draft or cancelled only)' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 422 })
  removePo(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.removePurchaseOrder(id, user.tenantId!);
  }

  // ── Reception BLs ───────────────────────────────────────────────────────────

  @Post('reception-bls')
  @Roles('owner', 'manager')
  @ApiOperation({ summary: 'Create reception BL — creates StockEntries + updates InventorySummary' })
  @ApiResponse({ status: 201 })
  createReceptionBl(@Body() dto: CreateReceptionBlDto, @CurrentUser() user: JwtPayload) {
    return this.service.createReceptionBl(dto, user.tenantId!, user.sub);
  }

  @Get('reception-bls')
  @Roles('owner', 'manager', 'agent', 'accountant')
  @ApiOperation({ summary: 'List reception BLs (paginated)' })
  findAllBls(@Query() query: ListReceptionBlsDto, @CurrentUser() user: JwtPayload) {
    return this.service.findAllReceptionBls(query, user.tenantId!);
  }

  @Get('reception-bls/:id')
  @Roles('owner', 'manager', 'agent', 'accountant')
  @ApiOperation({ summary: 'Get reception BL with stock entries' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404 })
  findOneBl(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.findOneReceptionBl(id, user.tenantId!);
  }

  // ── Vendor Bills ─────────────────────────────────────────────────────────────

  @Post('vendor-bills')
  @Roles('owner', 'manager')
  @ApiOperation({ summary: 'Create a vendor bill' })
  createVendorBill(@Body() dto: CreateVendorBillDto, @CurrentUser() user: JwtPayload) {
    return this.service.createVendorBill(dto, user.tenantId!, user.sub);
  }

  @Get('vendor-bills')
  @Roles('owner', 'manager', 'agent', 'accountant')
  @ApiOperation({ summary: 'List vendor bills (paginated + filters)' })
  findAllVendorBills(@Query() query: ListVendorBillsDto, @CurrentUser() user: JwtPayload) {
    return this.service.findAllVendorBills(query, user.tenantId!);
  }

  @Get('vendor-bills/:id')
  @Roles('owner', 'manager', 'agent', 'accountant')
  @ApiOperation({ summary: 'Get vendor bill with items and payments' })
  findOneVendorBill(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.service.findOneVendorBill(id, user.tenantId!);
  }

  @Put('vendor-bills/:id')
  @Roles('owner', 'manager')
  @ApiOperation({ summary: 'Update draft vendor bill' })
  updateVendorBill(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateVendorBillDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.updateVendorBill(id, dto, user.tenantId!, user.sub);
  }

  @Patch('vendor-bills/:id/status')
  @Roles('owner', 'manager')
  @ApiOperation({ summary: 'Validate or cancel a vendor bill' })
  patchVendorBillStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PatchVendorBillStatusDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.patchVendorBillStatus(id, dto.status, user.tenantId!, user.sub);
  }

  @Delete('vendor-bills/:id')
  @Roles('owner')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete draft or cancelled vendor bill' })
  removeVendorBill(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.service.removeVendorBill(id, user.tenantId!);
  }

  @Post('vendor-bills/:id/payments')
  @Roles('owner', 'manager')
  @ApiOperation({ summary: 'Record a payment on a vendor bill' })
  recordVendorPayment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RecordVendorPaymentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.recordVendorPayment(id, dto, user.tenantId!, user.sub);
  }

  /**
   * PDF du bon de commande — le document que le fournisseur recoit.
   *
   * En lecture seule pour le comptable comme pour l'agent : sortir un PDF ne
   * modifie rien, et refuser l'impression a qui peut deja lire le bon a
   * l'ecran n'aurait protege aucune donnee.
   */
  @Get('purchase-orders/:id/pdf')
  @Roles('owner', 'manager', 'agent', 'accountant')
  @ApiOperation({ summary: 'Purchase order PDF' })
  async purchaseOrderPdf(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
    @Res() reply: FastifyReply,
  ) {
    const { buffer, filename } = await this.pdfService.generatePurchaseOrderPdf(id, user.tenantId!);
    return reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `inline; filename="${filename}"`)
      .send(buffer);
  }

  @Get('reception-bls/:id/pdf')
  @Roles('owner', 'manager', 'agent', 'accountant')
  @ApiOperation({ summary: 'Goods receipt PDF' })
  async receptionBlPdf(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
    @Res() reply: FastifyReply,
  ) {
    const { buffer, filename } = await this.pdfService.generateReceptionBlPdf(id, user.tenantId!);
    return reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `inline; filename="${filename}"`)
      .send(buffer);
  }

  /** Copie interne : l'original du fournisseur reste la piece comptable. */
  @Get('vendor-bills/:id/pdf')
  @Roles('owner', 'manager', 'agent', 'accountant')
  @ApiOperation({ summary: 'Vendor bill internal copy PDF' })
  async vendorBillPdf(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
    @Res() reply: FastifyReply,
  ) {
    const { buffer, filename } = await this.pdfService.generateVendorBillPdf(id, user.tenantId!);
    return reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `inline; filename="${filename}"`)
      .send(buffer);
  }
}
