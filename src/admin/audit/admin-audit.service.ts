import { Injectable } from '@nestjs/common';
import { QueryRunner } from 'typeorm';
import { AdminAuditLog } from '../entities/admin-audit-log.entity';

@Injectable()
export class AdminAuditService {
  async logAction(
    qr: QueryRunner,
    adminId: string,
    adminEmail: string,
    action: string,
    targetType: string,
    targetId: string,
    metadata: Record<string, unknown> | null,
    ipAddress: string | null,
  ): Promise<void> {
    const log = qr.manager.create(AdminAuditLog, {
      adminId,
      adminEmail,
      action,
      targetType,
      targetId,
      metadata: metadata as Record<string, unknown> | null,
      ipAddress,
    });
    await qr.manager.save(AdminAuditLog, log);
  }
}
