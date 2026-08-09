import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PriceList } from './entities/price-list.entity';
import { PriceListItem } from './entities/price-list-item.entity';
import { PriceListsService } from './price-lists.service';
import { PriceListsController } from './price-lists.controller';

@Module({
  imports: [TypeOrmModule.forFeature([PriceList, PriceListItem])],
  controllers: [PriceListsController],
  providers: [PriceListsService],
  exports: [PriceListsService],
})
export class PriceListsModule {}
