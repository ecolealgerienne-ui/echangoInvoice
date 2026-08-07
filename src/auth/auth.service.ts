import { ConflictException, Injectable, NotFoundException, UnauthorizedException, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, IsNull, EntityManager } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { InviteDto, AcceptInviteDto } from './dto/invite.dto';
import { Tenant } from '../tenants/entities/tenant.entity';
import { Subscription } from '../tenants/entities/subscription.entity';
import { User } from '../users/entities/user.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { Plan } from '../admin/entities/plan.entity';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { requireEnv } from '../config/env.config';
import { EmailService } from '../common/email.service';
import { UsersService } from '../users/users.service';

const SALT_ROUNDS = 12;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly jwtService: JwtService,
    private readonly emailService: EmailService,
    private readonly usersService: UsersService,
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

      const starterPlan = await qr.manager.findOne(Plan, { where: { slug: 'starter' } });
      const subscription = qr.manager.create(Subscription, {
        tenantId: tenant.id,
        plan: 'starter',
        planId: starterPlan?.id,
        status: 'active',
        invoicesThisMonth: 0,
        invoiceLimit: starterPlan?.invoiceLimit ?? 30,
        usersCount: 1,
        usersLimit: starterPlan?.usersLimit ?? 3,
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
    let jti: string;
    try {
      const decoded = this.jwtService.decode(rawToken) as { jti?: string };
      if (!decoded?.jti) throw new Error();
      jti = decoded.jti;
    } catch {
      throw new UnauthorizedException('errors.invalid_refresh_token');
    }

    const found = await this.dataSource.manager.findOne(RefreshToken, {
      where: { jti, revoked: false },
    });

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
    let jti: string | undefined;
    try {
      const decoded = this.jwtService.decode(rawToken) as { jti?: string };
      jti = decoded?.jti;
    } catch {
      return;
    }
    if (!jti) return;

    await this.dataSource.manager.update(RefreshToken, { jti, revoked: false }, { revoked: true });
  }

  private async generateTokens(user: User, manager: EntityManager) {
    const payload: Omit<JwtPayload, 'iat' | 'exp'> = {
      sub: user.id,
      tenantId: user.tenantId,
      role: user.role,
      email: user.email,
    };

    const accessToken = this.jwtService.sign(payload);

    const jti = crypto.randomUUID();
    const rawRefresh = this.jwtService.sign(
      { sub: user.id, jti, type: 'refresh' },
      { expiresIn: parseInt(requireEnv('REFRESH_TOKEN_EXPIRY'), 10) },
    );

    const tokenHash = await bcrypt.hash(rawRefresh, SALT_ROUNDS);
    const expiresAt = new Date(
      Date.now() + parseInt(requireEnv('REFRESH_TOKEN_EXPIRY'), 10) * 1000,
    );

    const rt = manager.create(RefreshToken, {
      userId: user.id,
      tenantId: user.tenantId,
      jti,
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

  async invite(
    dto: InviteDto,
    tenantId: string,
    invitedBy: string,
  ): Promise<{ inviteUrl: string; emailSent: boolean }> {
    // UQ_users_email est GLOBAL, pas par tenant. Ne chercher que dans le tenant
    // courant laissait passer une adresse déjà employée ailleurs : l'INSERT
    // partait alors en violation de contrainte, donc en 500, au lieu d'un
    // conflit explicite.
    const existing = await this.dataSource.manager.findOne(User, {
      where: { email: dto.email, deletedAt: IsNull() },
    });
    if (existing) throw new ConflictException('errors.user_already_exists');

    const enAttente = await this.dataSource.query(
      `SELECT 1 FROM invitations
       WHERE "tenantId" = $1 AND email = $2 AND "acceptedAt" IS NULL AND "expiresAt" > NOW()`,
      [tenantId, dto.email],
    );
    if (enAttente.length) throw new ConflictException('errors.invite_already_pending');

    // Le plan vend un nombre de postes ; jusqu'ici rien ne l'appliquait.
    await this.usersService.assertPlaceDisponible(tenantId);

    const token = crypto.randomBytes(48).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 jours

    await this.dataSource.query(
      `INSERT INTO invitations ("tenantId", email, role, token, "expiresAt", "createdBy")
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (token) DO NOTHING`,
      [tenantId, dto.email, dto.role ?? 'agent', token, expiresAt, invitedBy],
    );

    const inviteUrl = `${process.env.APP_URL ?? 'http://localhost:5173'}/accept-invite?token=${token}`;
    let emailSent = false;

    try {
      await this.emailService.send({
        to: dto.email,
        subject: 'Invitation à rejoindre Echango Invoice',
        html: `
          <body style="font-family:Arial,sans-serif;font-size:14px;color:#333;max-width:600px;margin:0 auto;padding:20px">
            <h2 style="color:#1e3a5f">Invitation à rejoindre Echango Invoice</h2>
            <p>Vous avez été invité(e) à rejoindre l'équipe en tant que <strong>${dto.role ?? 'agent'}</strong>.</p>
            <p>Cliquez sur le lien ci-dessous pour créer votre compte (valable 7 jours) :</p>
            <p><a href="${inviteUrl}" style="background:#1e3a5f;color:white;padding:10px 20px;border-radius:4px;text-decoration:none;display:inline-block">Accepter l'invitation</a></p>
            <p style="font-size:11px;color:#999;margin-top:20px">Ou copiez ce lien : ${inviteUrl}</p>
          </body>
        `,
      });
      emailSent = true;
    } catch (emailErr) {
      this.logger.error('Invite email failed', (emailErr as Error).message);
    }

    // Le lien est renvoyé à l'appelant, et pas seulement expédié par e-mail.
    // L'ancienne version répondait « Invitation envoyée » même quand l'envoi
    // avait échoué : le message mentait, et le jeton n'existait alors nulle
    // part d'accessible — l'invitation était irrécupérable. Sans SMTP
    // configuré, c'était systématique.
    return { inviteUrl, emailSent };
  }

  async acceptInvite(dto: AcceptInviteDto): Promise<ReturnType<AuthService['authResponse']>> {
    const invitations = await this.dataSource.query(
      `SELECT * FROM invitations WHERE token = $1 AND "acceptedAt" IS NULL AND "expiresAt" > NOW()`,
      [dto.token],
    );
    if (!invitations.length) throw new NotFoundException('errors.invite_invalid_or_expired');

    const invitation = invitations[0];

    // Recherche globale, comme UQ_users_email : filtrer sur le tenant laissait
    // l'INSERT échouer en violation de contrainte si l'adresse servait déjà
    // ailleurs — 500 au lieu d'un conflit lisible.
    const existing = await this.dataSource.manager.findOne(User, {
      where: { email: invitation.email, deletedAt: IsNull() },
    });
    if (existing) throw new ConflictException('errors.user_already_exists');

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const user = qr.manager.create(User, {
        tenantId: invitation.tenantId,
        email: invitation.email,
        passwordHash,
        name: dto.name,
        role: invitation.role,
        isActive: true,
        createdBy: invitation.createdBy,
      });
      await qr.manager.save(User, user);

      await qr.query(
        `UPDATE invitations SET "acceptedAt" = NOW() WHERE token = $1`,
        [dto.token],
      );

      const tokens = await this.generateTokens(user, qr.manager);
      await qr.commitTransaction();
      return this.authResponse(tokens, user);
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }
}
