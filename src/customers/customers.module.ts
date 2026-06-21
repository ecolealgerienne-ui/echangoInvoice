import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Contact } from '../contacts/contact.entity';
import { ContactContact } from '../contacts/entities/contact-contact.entity';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';

@Module({
  imports: [TypeOrmModule.forFeature([Contact, ContactContact])],
  controllers: [CustomersController],
  providers: [CustomersService],
  exports: [TypeOrmModule],
})
export class CustomersModule {}
