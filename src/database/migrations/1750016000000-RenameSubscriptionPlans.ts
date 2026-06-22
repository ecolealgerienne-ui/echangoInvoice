import { MigrationInterface, QueryRunner } from 'typeorm';

export class RenameSubscriptionPlans1750016000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE subscription_plan_enum_new AS ENUM ('starter', 'pro', 'enterprise')`);
    await queryRunner.query(`
      ALTER TABLE subscriptions
        ALTER COLUMN plan TYPE subscription_plan_enum_new
        USING (
          CASE plan::text
            WHEN 'freemium' THEN 'starter'
            ELSE plan::text
          END
        )::subscription_plan_enum_new
    `);
    await queryRunner.query(`DROP TYPE subscription_plan_enum`);
    await queryRunner.query(`ALTER TYPE subscription_plan_enum_new RENAME TO subscription_plan_enum`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE subscription_plan_enum_old AS ENUM ('freemium', 'pro')`);
    await queryRunner.query(`
      ALTER TABLE subscriptions
        ALTER COLUMN plan TYPE subscription_plan_enum_old
        USING (
          CASE plan::text
            WHEN 'starter' THEN 'freemium'
            ELSE plan::text
          END
        )::subscription_plan_enum_old
    `);
    await queryRunner.query(`DROP TYPE subscription_plan_enum`);
    await queryRunner.query(`ALTER TYPE subscription_plan_enum_old RENAME TO subscription_plan_enum`);
  }
}
