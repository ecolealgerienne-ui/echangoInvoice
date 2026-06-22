import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  mixin,
  Type,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

const planCache = new Map<string, { features: Record<string, boolean>; cachedAt: number }>();
const CACHE_TTL = 60_000;

export function PlanFeaturesGuard(feature: string): Type<CanActivate> {
  @Injectable()
  class PlanFeaturesGuardMixin implements CanActivate {
    constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
      const { user } = context.switchToHttp().getRequest();
      const tenantId: string = user?.tenantId;
      if (!tenantId) return true;

      const now = Date.now();
      const cached = planCache.get(tenantId);
      if (cached && now - cached.cachedAt < CACHE_TTL) {
        if (!cached.features[feature]) {
          throw new ForbiddenException('errors.plan_feature_disabled');
        }
        return true;
      }

      const row = await this.dataSource.query(
        `SELECT p.features FROM subscriptions s
         JOIN plans p ON p.id = s."planId"
         WHERE s."tenantId" = $1
         LIMIT 1`,
        [tenantId],
      );

      const features: Record<string, boolean> = row[0]?.features ?? {};
      planCache.set(tenantId, { features, cachedAt: now });

      if (!features[feature]) {
        throw new ForbiddenException('errors.plan_feature_disabled');
      }
      return true;
    }
  }

  return mixin(PlanFeaturesGuardMixin);
}
