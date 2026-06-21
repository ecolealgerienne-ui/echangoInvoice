import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Contact } from '../contacts/contact.entity';
import { ContactContact } from '../contacts/entities/contact-contact.entity';
import { RawMaterial } from '../raw-materials/raw-material.entity';
import { SuppliersController } from './suppliers.controller';
import { SuppliersService } from './suppliers.service';

@Module({
  imports: [TypeOrmModule.forFeature([Contact, ContactContact, RawMaterial])],
  controllers: [SuppliersController],
  providers: [SuppliersService],
  exports: [TypeOrmModule],
})
export class SuppliersModule {}
