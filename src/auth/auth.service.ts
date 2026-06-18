import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, IsNull, EntityManager } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { Tenant } from '../tenants/entities/tenant.entity';
import { Subscription } from '../tenants/entities/subscription.entity';
import { User } from '../users/entities/user.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { requireEnv } from '../config/env.config';

const SALT_ROUNDS = 12;
const FREEMIUM_INVOICE_LIMIT = 10;
const FREEMIUM_USER_LIMIT = 5;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const existing = await qr.manager.findOne(User, {
        where: { email: dto.email, deletedAt: IsNull() },
      });
      if (existing) {
        throw new ConflictException({
          message: 'errors.email_already_used',
          field: 'email',
        });
      }

      const baseSlug = dto.companyName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');

      const slug = await this.uniqueSlug(qr.manager, baseSlug);

      const tenant = qr.manager.create(Tenant, {
        name: dto.companyName,
        slug,
        email: dto.email,
        status: 'trial',
      });
      await qr.manager.save(Tenant, tenant);

      const subscription = qr.manager.create(Subscription, {
        tenantId: tenant.id,
        plan: 'freemium',
        status: 'active',
        invoicesThisMonth: 0,
        invoiceLimit: FREEMIUM_INVOICE_LIMIT,
        usersCount: 1,
        usersLimit: FREEMIUM_USER_LIMIT,
      });
      await qr.manager.save(Subscription, subscription);

      const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
      const user = qr.manager.create(User, {
        tenantId: tenant.id,
        email: dto.email,
        passwordHash,
        name: dto.companyName,
        role: 'owner',
        isActive: true,
      });
      await qr.manager.save(User, user);

      await qr.commitTransaction();

      this.logger.log(`New tenant registered: ${tenant.slug}`);
      const tokens = await this.generateTokens(user, this.dataSource.manager);
      return this.authResponse(tokens, user);
    } catch (error) {
      await qr.rollbackTransaction();
      throw error;
    } finally {
      await qr.release();
    }
  }

  async login(dto: LoginDto) {
    const user = await this.dataSource.manager.findOne(User, {
      where: { email: dto.email, deletedAt: IsNull(), isActive: true },
    });
    if (!user) throw new UnauthorizedException('errors.invalid_credentials');

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('errors.invalid_credentials');

    const tokens = await this.generateTokens(user, this.dataSource.manager);
    return this.authResponse(tokens, user);
  }

  async refresh(rawToken: string) {
    // Find matching non-revoked token by comparing hash
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
    if (!user) throw new UnauthorizedException('errors.user_not_found');

    const tokens = await this.generateTokens(user, this.dataSource.manager);
    return this.authResponse(tokens, user);
  }

  async logout(rawToken: string): Promise<void> {
    const candidates = await this.dataSource.manager.find(RefreshToken, {
      where: { revoked: false },
    });
    for (const t of candidates) {
      if (await bcrypt.compare(rawToken, t.tokenHash)) {
        t.revoked = true;
        await this.dataSource.manager.save(RefreshToken, t);
        break;
      }
    }
  }

  private async generateTokens(user: User, manager: EntityManager) {
    const payload: Omit<JwtPayload, 'iat' | 'exp'> = {
      sub: user.id,
      tenantId: user.tenantId,
      role: user.role,
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

    const rt = manager.create(RefreshToken, {
      userId: user.id,
      tenantId: user.tenantId,
      tokenHash,
      revoked: false,
      expiresAt,
    });
    await manager.save(RefreshToken, rt);

    return { accessToken, refreshToken: rawRefresh };
  }

  private authResponse(
    tokens: { accessToken: string; refreshToken: string },
    user: User,
  ) {
    return {
      data: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: parseInt(requireEnv('JWT_EXPIRY'), 10),
        user: {
          id: user.id,
          tenantId: user.tenantId,
          email: user.email,
          name: user.name,
          role: user.role,
        },
      },
    };
  }

  private async uniqueSlug(manager: EntityManager, base: string): Promise<string> {
    let slug = base;
    let i = 1;
    while (await manager.findOne(Tenant, { where: { slug } })) {
      slug = `${base}-${i++}`;
    }
    return slug;
  }
}
