import {
  ForbiddenException, Injectable, Logger,
  NotFoundException, UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Not, Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { UpdateUserDto } from './dto/update-user.dto';

/**
 * Gestion des membres d'un tenant.
 *
 * Le module Users n'avait aucun contrôleur : les comptes existaient en base
 * mais aucune route ne permettait de les lister, de changer un rôle ou de
 * désactiver quelqu'un. Combiné à l'absence d'écran d'invitation, un espace
 * client était figé à son unique compte d'origine.
 */
@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(User) private readonly repo: Repository<User>,
    private readonly dataSource: DataSource,
  ) {}

  /** Membres du tenant. Le hash de mot de passe n'est jamais exposé. */
  async findAll(tenantId: string) {
    const data = await this.repo.find({
      where: { tenantId, deletedAt: IsNull() },
      select: ['id', 'email', 'name', 'role', 'isActive', 'createdAt'],
      order: { createdAt: 'ASC' },
    });
    return { data };
  }

  /** Invitations émises et pas encore acceptées, expirées incluses. */
  async listInvitations(tenantId: string) {
    const data = await this.dataSource.query(
      `SELECT id, email, role, token, "expiresAt", "createdAt",
              ("expiresAt" <= NOW()) AS expired
       FROM invitations
       WHERE "tenantId" = $1 AND "acceptedAt" IS NULL
       ORDER BY "createdAt" DESC`,
      [tenantId],
    );
    return { data };
  }

  async revokeInvitation(id: string, tenantId: string) {
    const res = await this.dataSource.query(
      `DELETE FROM invitations WHERE id = $1 AND "tenantId" = $2 AND "acceptedAt" IS NULL`,
      [id, tenantId],
    );
    // node-postgres renvoie le nombre de lignes touchées en seconde position.
    if (!res || (Array.isArray(res) && res[1] === 0)) {
      throw new NotFoundException('invitation_not_found');
    }
    return { data: { revoked: true } };
  }

  async update(id: string, dto: UpdateUserDto, tenantId: string, currentUserId: string) {
    const user = await this.repo.findOne({ where: { id, tenantId, deletedAt: IsNull() } });
    if (!user) throw new NotFoundException('user_not_found');

    // Se retirer soi-même ses propres droits enferme le compte hors de
    // l'administration, sans personne pour l'en sortir.
    if (id === currentUserId) {
      if (dto.isActive === false) throw new UnprocessableEntityException('cannot_deactivate_self');
      if (dto.role && dto.role !== user.role) {
        throw new UnprocessableEntityException('cannot_change_own_role');
      }
    }

    // Un tenant sans owner actif n'a plus personne pour gérer ses utilisateurs,
    // ses paramètres ni son abonnement.
    const perdSonRoleOwner = user.role === 'owner'
      && ((dto.role && dto.role !== 'owner') || dto.isActive === false);
    if (perdSonRoleOwner) {
      const autresOwners = await this.repo.count({
        where: { tenantId, role: 'owner', isActive: true, deletedAt: IsNull(), id: Not(id) },
      });
      if (autresOwners === 0) throw new UnprocessableEntityException('last_owner');
    }

    if (dto.role) user.role = dto.role;
    if (dto.isActive !== undefined) user.isActive = dto.isActive;
    if (dto.name) user.name = dto.name;
    await this.repo.save(user);

    this.logger.log(`Utilisateur ${user.email} modifié par ${currentUserId}`);
    const { passwordHash, ...safe } = user as User & { passwordHash: string };
    void passwordHash;
    return { data: safe };
  }

  /**
   * Places occupées : membres actifs + invitations en attente non expirées.
   *
   * Compter les invitations évite d'en émettre plus que de places disponibles,
   * ce qui ferait échouer l'acceptation au lieu de l'invitation — un refus au
   * mauvais moment, pour la mauvaise personne.
   */
  async placesOccupees(tenantId: string): Promise<number> {
    const [row] = await this.dataSource.query(
      `SELECT (SELECT count(*) FROM users
               WHERE "tenantId" = $1 AND "isActive" = true AND "deletedAt" IS NULL)
            + (SELECT count(*) FROM invitations
               WHERE "tenantId" = $1 AND "acceptedAt" IS NULL AND "expiresAt" > NOW())
              AS total`,
      [tenantId],
    );
    return Number(row.total);
  }

  /** Quota du plan, ou null si illimité. */
  async limiteUtilisateurs(tenantId: string): Promise<number | null> {
    const [row] = await this.dataSource.query(
      `SELECT "usersLimit" FROM subscriptions WHERE "tenantId" = $1`,
      [tenantId],
    );
    return row?.usersLimit ?? null;
  }

  async assertPlaceDisponible(tenantId: string): Promise<void> {
    const limite = await this.limiteUtilisateurs(tenantId);
    if (limite == null) return;
    if ((await this.placesOccupees(tenantId)) >= limite) {
      throw new ForbiddenException('users_limit_reached');
    }
  }

  /** Consommation du quota, pour l'afficher dans l'écran Utilisateurs. */
  async quota(tenantId: string) {
    const [limite, occupees] = await Promise.all([
      this.limiteUtilisateurs(tenantId),
      this.placesOccupees(tenantId),
    ]);
    return { data: { limite, occupees } };
  }
}
