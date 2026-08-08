import { Module } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { BalanceAgeeService } from './balance-agee.service';
import { ReportsController } from './reports.controller';

@Module({
  controllers: [ReportsController],
  providers: [ReportsService, BalanceAgeeService],
})
export class ReportsModule {}
