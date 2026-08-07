import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class AdminStatsService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async getStats() {
    const now = new Date();
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [tenantCounts] = await this.dataSource.query(`
      SELECT
        COUNT(*) FILTER (WHERE "deletedAt" IS NULL) AS total,
        COUNT(*) FILTER (WHERE status = 'trial' AND "deletedAt" IS NULL) AS trial,
        COUNT(*) FILTER (WHERE status = 'active' AND "deletedAt" IS NULL) AS active,
        COUNT(*) FILTER (WHERE status = 'suspended' AND "deletedAt" IS NULL) AS suspended,
        COUNT(*) FILTER (WHERE "createdAt" >= $1 AND "deletedAt" IS NULL) AS "newThisMonth",
        COUNT(*) FILTER (WHERE "deletedAt" >= $1) AS "churnThisMonth"
      FROM tenants
    `, [firstOfMonth.toISOString()]);

    const byPlan = await this.dataSource.query(`
      SELECT p.slug, COUNT(s.id) AS count
      FROM subscriptions s
      JOIN plans p ON p.id = s."planId"
      JOIN tenants t ON t.id = s."tenantId"
      WHERE t."deletedAt" IS NULL AND t.status = 'active'
      GROUP BY p.slug
    `);

    const [mrrActualRow] = await this.dataSource.query(`
      SELECT COALESCE(SUM(amount), 0) AS mrr FROM saas_payments WHERE "paidAt" >= $1
    `, [firstOfMonth.toISOString()]);

    const [mrrContractualRow] = await this.dataSource.query(`
      SELECT COALESCE(SUM(
        COALESCE(s."customPricePerMonth", p."pricePerMonth")
      ), 0) AS mrr
      FROM subscriptions s
      JOIN plans p ON p.id = s."planId"
      JOIN tenants t ON t.id = s."tenantId"
      WHERE t.status = 'active' AND t."deletedAt" IS NULL
    `);

    const topTenants = await this.dataSource.query(`
      SELECT t.id AS "tenantId", t.name, s."invoicesThisMonth", p.slug AS plan
      FROM tenants t
      JOIN subscriptions s ON s."tenantId" = t.id
      LEFT JOIN plans p ON p.id = s."planId"
      WHERE t.status = 'active' AND t."deletedAt" IS NULL
      ORDER BY s."invoicesThisMonth" DESC
      LIMIT 5
    `);

    const mrrActual = parseFloat(mrrActualRow?.mrr ?? '0');
    const mrrContractual = parseFloat(mrrContractualRow?.mrr ?? '0');

    const byPlanMap: Record<string, number> = {};
    for (const row of byPlan) {
      byPlanMap[row.slug] = parseInt(row.count, 10);
    }

    return {
      data: {
        mrr: { actual: mrrActual, contractual: mrrContractual },
        arr: { actual: mrrActual * 12, contractual: mrrContractual * 12 },
        tenants: {
          total: parseInt(tenantCounts.total, 10),
          trial: parseInt(tenantCounts.trial, 10),
          active: parseInt(tenantCounts.active, 10),
          suspended: parseInt(tenantCounts.suspended, 10),
        },
        newThisMonth: parseInt(tenantCounts.newThisMonth, 10),
        churnThisMonth: parseInt(tenantCounts.churnThisMonth, 10),
        byPlan: byPlanMap,
        topTenantsByUsage: topTenants,
      },
    };
  }
}
