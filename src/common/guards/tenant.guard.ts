import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';

/**
 * Garantit qu'une route locataire s'exécute avec un tenantId réel.
 *
 * Sans lui, `user.tenantId!` dans les contrôleurs est une promesse faite au
 * compilateur que rien ne tient à l'exécution : un `undefined` devient
 * `where: { tenantId: undefined }`, que TypeORM retire silencieusement de la
 * clause — la requête rend alors les lignes de TOUS les locataires. Le défaut
 * ne lève pas, il élargit.
 *
 * À monter sur tout contrôleur locataire, après JwtGuard et avant RolesGuard.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // Un superadmin n'a pas de tenantId : il n'a rien à faire sur ces routes.
    if (user?.role === 'superadmin') {
      throw new ForbiddenException('errors.superadmin_cannot_access_tenant_routes');
    }

    if (!user?.tenantId) {
      throw new UnauthorizedException('errors.tenant_context_missing');
    }
    request.tenantId = user.tenantId;
    return true;
  }
}
