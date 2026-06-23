import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

/**
 * R020 exception: Admin routes intentionally query multiple tenants.
 * Protected by this guard which ensures only role='superadmin' with tenantId=null can access.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const { user } = context.switchToHttp().getRequest();
    if (user?.role !== 'superadmin' || user?.tenantId !== null) {
      throw new ForbiddenException('errors.admin_only');
    }
    return true;
  }
}
