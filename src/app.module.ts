import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { getDatabaseConfig } from './config/database.config';
import { HealthModule } from './common/health.module';
import { AuthModule } from './auth/auth.module';
import { TenantsModule } from './tenants/tenants.module';
import { UsersModule } from './users/users.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { CustomersModule } from './customers/customers.module';
import { ProductsModule } from './products/products.module';
import { PriceListsModule } from './price-lists/price-lists.module';
import { PurchasesModule } from './purchases/purchases.module';
import { QuotesModule } from './quotes/quotes.module';
import { DeliveriesModule } from './deliveries/deliveries.module';
import { InvoicesModule } from './invoices/invoices.module';
import { ExpensesModule } from './expenses/expenses.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { StockModule } from './stock/stock.module';
import { ReportsModule } from './reports/reports.module';
import { SettingsModule } from './settings/settings.module';
import { ProductionModule } from './production/production.module';
import { AdminModule } from './admin/admin.module';

@Module({
  imports: [
    TypeOrmModule.forRoot(getDatabaseConfig()),
    // 100/min était le réglage d'origine, mais il n'avait jamais été appliqué
    // (aucun garde monté) — donc jamais éprouvé. Le seau est PAR IP : dans un
    // bureau derrière une seule IP publique, tous les postes le partagent, et
    // une campagne e2e l'a saturé dès le premier essai. 600/min laisse
    // respirer un usage normal tout en gardant un plafond. Les routes d'auth
    // conservent leurs limites strictes via @Throttle (R017, R023).
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 600 }]),
    ScheduleModule.forRoot(),
    HealthModule,
    AuthModule,
    AdminModule,
    TenantsModule,
    UsersModule,
    SuppliersModule,
    CustomersModule,
    ProductsModule,
    PriceListsModule,
    PurchasesModule,
    QuotesModule,
    DeliveriesModule,
    InvoicesModule,
    ExpensesModule,
    DashboardModule,
    StockModule,
    ReportsModule,
    SettingsModule,
    ProductionModule,
  ],
  providers: [
    // R017 — sans ce fournisseur, ThrottlerModule est enregistré mais aucun
    // garde ne s'exécute : les @Throttle des routes d'auth étaient inertes et
    // le login restait brute-forçable sans limite (constaté le 2026-08-08 :
    // 20 tentatives consécutives, aucun 429).
    //
    // Garde GLOBAL et non par contrôleur : la route qu'on oublie doit être
    // protégée par défaut, pas ouverte (R023). Les exceptions se déclarent
    // explicitement avec @SkipThrottle — c'est le cas de /health, dont un
    // rate-limit ferait croire au mobile qu'il est hors ligne.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
