import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { RefreshToken } from './entities/refresh-token.entity';
import { Tenant } from '../tenants/entities/tenant.entity';
import { Subscription } from '../tenants/entities/subscription.entity';
import { User } from '../users/entities/user.entity';
import { getJwtConfig } from '../config/jwt.config';

@Module({
  imports: [
    PassportModule,
    JwtModule.register(getJwtConfig()),
    TypeOrmModule.forFeature([RefreshToken, Tenant, Subscription, User]),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
