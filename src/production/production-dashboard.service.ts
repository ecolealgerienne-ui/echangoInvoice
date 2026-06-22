import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class ProductionDashboardService {
  private readonly logger = new Logger(ProductionDashboardService.name);

  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async getDashboard(tenantId: string) {
    const [
      ordersInProgress,
      ordersCompletedThisWeek,
      yieldRow,
      costRows,
      criticalStock,
      productionByDay,
    ] = await Promise.all([
      // Orders in progress
      this.ds.query(
        `SELECT COUNT(*) as count FROM "production_orders"
         WHERE "tenantId" = $1 AND "status" = 'in_progress' AND "deletedAt" IS NULL`,
        [tenantId],
      ),

      // Orders completed this week
      this.ds.query(
        `SELECT COUNT(*) as count FROM "production_orders"
         WHERE "tenantId" = $1 AND "status" = 'completed'
           AND "actualEndDate" >= NOW() - INTERVAL '7 days'
           AND "deletedAt" IS NULL`,
        [tenantId],
      ),

      // Average yield (completed orders)
      this.ds.query(
        `SELECT AVG("yieldPercentage") as avg FROM "production_orders"
         WHERE "tenantId" = $1 AND "status" = 'completed' AND "deletedAt" IS NULL`,
        [tenantId],
      ),

      // Cost variance (completed last 30 days)
      this.ds.query(
        `SELECT
           SUM("actualCost") as totalActual,
           SUM("estimatedCost") as totalEstimated
         FROM "production_orders"
         WHERE "tenantId" = $1 AND "status" = 'completed'
           AND "actualEndDate" >= NOW() - INTERVAL '30 days'
           AND "deletedAt" IS NULL`,
        [tenantId],
      ),

      // Critical stock: raw materials with low available qty
      this.ds.query(
        `SELECT
           rm.id, rm.name, rm.unit,
           COALESCE(SUM(se.quantity), 0) AS "stockQuantity",
           rm."reservedQuantity",
           (COALESCE(SUM(se.quantity), 0) - rm."reservedQuantity") AS available
         FROM raw_materials rm
         LEFT JOIN stock_entries se
           ON se."rawMaterialId" = rm.id AND se.status = 'available' AND se."deletedAt" IS NULL
         WHERE rm."tenantId" = $1 AND rm."deletedAt" IS NULL
         GROUP BY rm.id, rm.name, rm.unit, rm."reservedQuantity"
         HAVING (COALESCE(SUM(se.quantity), 0) - rm."reservedQuantity") < 10
         ORDER BY available ASC
         LIMIT 10`,
        [tenantId],
      ),

      // Production by day (last 14 days)
      this.ds.query(
        `SELECT
           DATE("actualEndDate") as date,
           SUM("quantityProduced") as quantity
         FROM "production_orders"
         WHERE "tenantId" = $1 AND "status" = 'completed'
           AND "actualEndDate" >= NOW() - INTERVAL '14 days'
           AND "deletedAt" IS NULL
         GROUP BY DATE("actualEndDate")
         ORDER BY date ASC`,
        [tenantId],
      ),
    ]);

    const totalActual = Number(costRows[0]?.totalActual ?? 0);
    const totalEstimated = Number(costRows[0]?.totalEstimated ?? 0);
    const costVarianceAmount = totalActual - totalEstimated;
    const costVariancePct =
      totalEstimated > 0 ? Math.round((costVarianceAmount / totalEstimated) * 10000) / 100 : 0;

    return {
      data: {
        ordersInProgress: Number(ordersInProgress[0]?.count ?? 0),
        ordersCompletedThisWeek: Number(ordersCompletedThisWeek[0]?.count ?? 0),
        averageYield: Math.round(Number(yieldRow[0]?.avg ?? 0) * 100) / 100,
        costVariance: { amount: costVarianceAmount, pct: costVariancePct },
        criticalStock: criticalStock.map((r: any) => ({
          rawMaterial: { id: r.id, name: r.name, unit: r.unit },
          stockQuantity: Number(r.stockQuantity),
          reserved: Number(r.reservedQuantity),
          available: Number(r.available),
        })),
        productionByDay: productionByDay.map((r: any) => ({
          date: r.date,
          quantity: Number(r.quantity),
        })),
      },
    };
  }
}
