import { MigrationInterface, QueryRunner } from 'typeorm';

export class BackfillStockEntryFinishedProductId1709982000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    // stock_entries créées par les réceptions BL avant la migration vers finished_products
    // avaient rawMaterialId renseigné mais finishedProductId à NULL.
    // Depuis la migration raw_materials→finished_products les IDs sont conservés,
    // donc on peut simplement copier rawMaterialId dans finishedProductId.
    await queryRunner.query(`
      UPDATE stock_entries
      SET "finishedProductId" = "rawMaterialId"
      WHERE "finishedProductId" IS NULL
        AND "rawMaterialId" IS NOT NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Réversible uniquement si rawMaterialId est encore présent
    await queryRunner.query(`
      UPDATE stock_entries
      SET "finishedProductId" = NULL
      WHERE "rawMaterialId" IS NOT NULL
        AND "finishedProductId" = "rawMaterialId"
    `);
  }
}
