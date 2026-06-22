import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsDateString, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { JwtGuard } from '../common/guards/jwt.guard';
import { AdminGuard } from './guards/admin.guard';

class ListAuditLogsDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) limit?: number = 20;
  @IsOptional() @IsString() action?: string;
  @IsOptional() @IsString() targetType?: string;
  @IsOptional() @IsString() targetId?: string;
  @IsOptional() @IsDateString() dateFrom?: string;
  @IsOptional() @IsDateString() dateTo?: string;
}

@ApiTags('admin')
@Controller('admin/audit-logs')
@UseGuards(JwtGuard, AdminGuard)
export class AdminAuditLogsController {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  @Get()
  @ApiOperation({ summary: 'Admin audit logs' })
  async findAll(@Query() dto: ListAuditLogsDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const offset = (page - 1) * limit;

    let q = this.dataSource
      .createQueryBuilder()
      .select('*')
      .from('admin_audit_logs', 'al')
      .orderBy('al."createdAt"', 'DESC');

    if (dto.action) q = q.andWhere('al.action = :action', { action: dto.action });
    if (dto.targetType) q = q.andWhere('al."targetType" = :targetType', { targetType: dto.targetType });
    if (dto.targetId) q = q.andWhere('al."targetId" = :targetId', { targetId: dto.targetId });
    if (dto.dateFrom) q = q.andWhere('al."createdAt" >= :dateFrom', { dateFrom: dto.dateFrom });
    if (dto.dateTo) q = q.andWhere('al."createdAt" <= :dateTo', { dateTo: dto.dateTo });

    const [data, total] = await Promise.all([
      q.offset(offset).limit(limit).getRawMany(),
      q.getCount(),
    ]);

    return { data, pagination: { total, page, limit } };
  }
}
