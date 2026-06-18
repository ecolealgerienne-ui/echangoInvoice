import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { getDatabaseConfig } from './config/database.config';
import { AuthModule } from './auth/auth.module';
import { TenantsModule } from './tenants/tenants.module';
import { UsersModule } from './users/users.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { RawMaterialsModule } from './raw-materials/raw-materials.module';

@Module({
  imports: [
    TypeOrmModule.forRoot(getDatabaseConfig()),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    AuthModule,
    TenantsModule,
    UsersModule,
    SuppliersModule,
    RawMaterialsModule,
  ],
})
export class AppModule {}
