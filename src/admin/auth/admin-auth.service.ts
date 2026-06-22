import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, IsNull } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { User } from '../../users/entities/user.entity';
import { RefreshToken } from '../../auth/entities/refresh-token.entity';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { requireEnv } from '../../config/env.config';

const SALT_ROUNDS = 12;

@Injectable()
export class AdminAuthService {
  private readonly logger = new Logger(AdminAuthService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly jwtService: JwtService,
  ) {}

  async login(email: string, password: string) {
    const user = await this.dataSource.manager.findOne(User, {
      where: { email, deletedAt: IsNull(), isActive: true },
    });
    if (!user || user.role !== 'superadmin') {
      throw new UnauthorizedException('errors.invalid_credentials');
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('errors.invalid_credentials');

    const tokens = await this.generateTokens(user);
    this.logger.log(`Superadmin login: ${user.email}`);
    return this.authResponse(tokens, user);
  }

  async refresh(rawToken: string) {
    const candidates = await this.dataSource.manager.find(RefreshToken, {
      where: { revoked: false },
    });

    let found: RefreshToken | null = null;
    for (const t of candidates) {
      if (await bcrypt.compare(rawToken, t.tokenHash)) {
        found = t;
        break;
      }
    }

    if (!found || new Date() > found.expiresAt) {
      throw new UnauthorizedException('errors.invalid_refresh_token');
    }

    found.revoked = true;
    await this.dataSource.manager.save(RefreshToken, found);

    const user = await this.dataSource.manager.findOne(User, {
      where: { id: found.userId, deletedAt: IsNull(), isActive: true },
    });
    if (!user || user.role !== 'superadmin') {
      throw new UnauthorizedException('errors.user_not_found');
    }

    const tokens = await this.generateTokens(user);
    return this.authResponse(tokens, user);
  }

  private async generateTokens(user: User) {
    const payload: Omit<JwtPayload, 'iat' | 'exp'> = {
      sub: user.id,
      tenantId: user.tenantId ?? null,
      role: user.role as JwtPayload['role'],
      email: user.email,
    };

    const accessToken = this.jwtService.sign(payload);

    const rawRefresh = this.jwtService.sign(
      { sub: user.id, type: 'refresh' },
      { expiresIn: parseInt(requireEnv('REFRESH_TOKEN_EXPIRY'), 10) },
    );

    const tokenHash = await bcrypt.hash(rawRefresh, SALT_ROUNDS);
    const expiresAt = new Date(
      Date.now() + parseInt(requireEnv('REFRESH_TOKEN_EXPIRY'), 10) * 1000,
    );

    const rt = this.dataSource.manager.create(RefreshToken, {
      userId: user.id,
      tenantId: user.tenantId ?? null,
      tokenHash,
      revoked: false,
      expiresAt,
    });
    await this.dataSource.manager.save(RefreshToken, rt);

    return { accessToken, refreshToken: rawRefresh };
  }

  private authResponse(tokens: { accessToken: string; refreshToken: string }, user: User) {
    return {
      data: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: parseInt(requireEnv('JWT_EXPIRY'), 10),
        user: {
          id: user.id,
          tenantId: user.tenantId ?? null,
          email: user.email,
          name: user.name,
          role: user.role,
        },
      },
    };
  }
}
