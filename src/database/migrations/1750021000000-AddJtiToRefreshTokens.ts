import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddJtiToRefreshTokens1750021000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    // Revoke all existing tokens — they have no jti and can't be used after this migration
    await queryRunner.query(`UPDATE refresh_tokens SET revoked = true WHERE revoked = false`);

    await queryRunner.query(
      `ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS jti uuid`,
    );
    // Backfill with random UUIDs so NOT NULL constraint can be added
    await queryRunner.query(
      `UPDATE refresh_tokens SET jti = gen_random_uuid() WHERE jti IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE refresh_tokens ALTER COLUMN jti SET NOT NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_refresh_tokens_jti" ON refresh_tokens (jti)`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_refresh_tokens_jti"`);
    await queryRunner.query(`ALTER TABLE refresh_tokens DROP COLUMN IF EXISTS jti`);
  }
}
