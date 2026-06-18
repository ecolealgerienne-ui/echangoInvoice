import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { getDatabaseConfig } from './config/database.config';
import { AuthModule } from './auth/auth.module';
import { TenantsModule } from './tenants/tenants.module';
import { UsersModule } from './users/users.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { RawMaterialsModule } from './raw-materials/raw-materials.module';
import { CustomersModule } from './customers/customers.module';
import { ProductsModule } from './products/products.module';
import { PurchasesModule } from './purchases/purchases.module';
import { QuotesModule } from './quotes/quotes.module';
import { DeliveriesModule } from './deliveries/deliveries.module';
import { InvoicesModule } from './invoices/invoices.module';
import { ExpensesModule } from './expenses/expenses.module';
import { DashboardModule } from './dashboard/dashboard.module';

@Module({
  imports: [
    TypeOrmModule.forRoot(getDatabaseConfig()),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    ScheduleModule.forRoot(),
    AuthModule,
    TenantsModule,
    UsersModule,
    SuppliersModule,
    RawMaterialsModule,
    CustomersModule,
    ProductsModule,
    PurchasesModule,
    QuotesModule,
    DeliveriesModule,
    InvoicesModule,
    ExpensesModule,
    DashboardModule,
  ],
})
export class AppModule {}
