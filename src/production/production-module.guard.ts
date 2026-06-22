import {
  CanActivate, ExecutionContext, ForbiddenException, Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Setting } from '../settings/setting.entity';

@Injectable()
export class ProductionModuleGuard implements CanActivate {
  constructor(
    @InjectRepository(Setting) private readonly settingsRepo: Repository<Setting>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const tenantId = request.user?.tenantId;
    if (!tenantId) throw new ForbiddenException('production_module_no_tenant');

    const settings = await this.settingsRepo.findOne({ where: { tenantId } });
    if (!settings?.productionModuleEnabled) {
      throw new ForbiddenException('production_module_disabled');
    }
    return true;
  }
}
