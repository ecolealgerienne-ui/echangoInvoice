import {
  Body, Controller, Delete, Get, Param, ParseUUIDPipe,
  Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DeliveriesService } from './deliveries.service';
import { CreateDeliveryNoteDto } from './dto/create-delivery-note.dto';
import { UpdateDeliveryNoteStatusDto } from './dto/update-delivery-note-status.dto';
import { SignDeliveryNoteDto } from './dto/sign-delivery-note.dto';
import { ListDeliveryNotesDto } from './dto/list-delivery-notes.dto';
import { JwtGuard } from '../common/guards/jwt.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Deliveries')
@ApiBearerAuth()
@UseGuards(JwtGuard, RolesGuard)
@Controller('deliveries/delivery-notes')
export class DeliveriesController {
  constructor(private readonly deliveriesService: DeliveriesService) {}

  @Post()
  @Roles('owner', 'manager', 'agent')
  @ApiOperation({ summary: 'Créer un bon de livraison (décrémente stock FIFO)' })
  create(@Body() dto: CreateDeliveryNoteDto, @CurrentUser() user: any) {
    return this.deliveriesService.create(dto, user.tenantId, user.id);
  }

  @Get()
  @Roles('owner', 'manager', 'agent')
  @ApiOperation({ summary: 'Lister les bons de livraison' })
  findAll(@Query() query: ListDeliveryNotesDto, @CurrentUser() user: any) {
    return this.deliveriesService.findAll(query, user.tenantId);
  }

  @Get(':id')
  @Roles('owner', 'manager', 'agent')
  @ApiOperation({ summary: 'Détail d\'un bon de livraison' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.deliveriesService.findOne(id, user.tenantId);
  }

  @Patch(':id/status')
  @Roles('owner', 'manager')
  @ApiOperation({ summary: 'Changer le statut (draft→sent→signed→delivered)' })
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDeliveryNoteStatusDto,
    @CurrentUser() user: any,
  ) {
    return this.deliveriesService.updateStatus(id, dto, user.tenantId, user.id);
  }

  @Patch(':id/signature')
  @Roles('owner', 'manager', 'agent')
  @ApiOperation({ summary: 'Enregistrer la signature client → status signed' })
  sign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SignDeliveryNoteDto,
    @CurrentUser() user: any,
  ) {
    return this.deliveriesService.sign(id, dto, user.tenantId, user.id);
  }

  @Delete(':id')
  @Roles('owner')
  @ApiOperation({ summary: 'Supprimer un BL (draft uniquement, libère stock)' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.deliveriesService.remove(id, user.tenantId, user.id);
  }
}
