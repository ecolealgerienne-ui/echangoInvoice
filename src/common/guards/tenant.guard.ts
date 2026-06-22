import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';

@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // A superadmin cannot access tenant routes
    if (user?.role === 'superadmin') {
      throw new ForbiddenException('errors.superadmin_cannot_access_tenant_routes');
    }

    if (!user?.tenantId) {
      throw new UnauthorizedException('Tenant context missing from token');
    }
    request.tenantId = user.tenantId;
    return true;
  }
}
