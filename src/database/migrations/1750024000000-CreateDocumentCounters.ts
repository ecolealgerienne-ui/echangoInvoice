import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Compteurs de documents, et les quatre formats de numérotation qui
 * manquaient.
 *
 * Jusqu'ici, le prochain numéro était déduit du plus grand numéro existant, en
 * découpant la chaîne sur les tirets. Cela marche tant que le format ne bouge
 * jamais — ce qui était le cas, puisque les huit compteurs étaient codés en
 * dur. Dès lors que l'utilisateur peut changer « FAC-YY-### » en autre chose,
 * relire la séquence dans une chaîne dont on ne connaît plus la forme devient
 * une source d'erreurs : un format modifié en cours d'année ferait repartir la
 * numérotation à 1, et l'index unique refuserait l'insertion.
 *
 * Un compteur explicite par locataire, type de document et année règle la
 * question : la séquence ne dépend plus de la façon dont on l'affiche.
 */
export class CreateDocumentCounters1750024000000 implements MigrationInterface {
  name = 'CreateDocumentCounters1750024000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "document_counters" (
        "id"        uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenantId"  uuid NOT NULL,
        "kind"      varchar(40) NOT NULL,
        "year"      integer NOT NULL,
        "lastValue" integer NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_document_counters" PRIMARY KEY ("id")
      )
    `);

    // L'unicité porte le sens de la table : un seul compteur par locataire,
    // type et année. C'est aussi ce qui permet l'écriture atomique
    // « INSERT … ON CONFLICT DO UPDATE » du service de numérotation.
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_document_counters_tenant_kind_year"
        ON "document_counters" ("tenantId", "kind", "year")
    `);

    const formats: [string, string][] = [
      ['receptionNumberFormat', 'BL-REC-YY-###'],
      ['vendorBillNumberFormat', 'FAC-ACH-YY-###'],
      ['creditNoteNumberFormat', 'AV-YY-###'],
      ['productionOrderNumberFormat', 'MO-YY-###'],
    ];
    for (const [colonne, defaut] of formats) {
      await queryRunner.query(
        `ALTER TABLE "settings"
         ADD COLUMN IF NOT EXISTS "${colonne}" varchar(30) NOT NULL DEFAULT '${defaut}'`,
      );
    }

    // Reprise de l'existant. Le format historique se termine toujours par
    // « -### » : la séquence est donc le dernier segment. Les numéros qui ne
    // finissent pas par des chiffres sont écartés plutôt que de faire échouer
    // la conversion — il n'en existe pas, mais une base malmenée à la main ne
    // doit pas bloquer la migration.
    const reprises: [string, string, string][] = [
      ['invoice', 'sales_invoices', 'invoiceNumber'],
      ['delivery_note', 'delivery_notes', 'blNumber'],
      ['quote', 'quotes', 'quoteNumber'],
      ['purchase_order', 'purchase_orders', 'poNumber'],
      ['reception', 'reception_bls', 'blNumber'],
      ['vendor_bill', 'vendor_bills', 'billNumber'],
      ['credit_note', 'credit_notes', 'creditNoteNumber'],
      ['production_order', 'production_orders', 'ref'],
    ];
    for (const [kind, table, colonne] of reprises) {
      await queryRunner.query(`
        INSERT INTO "document_counters" ("tenantId", "kind", "year", "lastValue")
        SELECT "tenantId", '${kind}', EXTRACT(YEAR FROM "createdAt")::int,
               MAX(regexp_replace("${colonne}", '^.*-', '')::int)
        FROM "${table}"
        WHERE "${colonne}" ~ '-[0-9]+$'
        GROUP BY "tenantId", EXTRACT(YEAR FROM "createdAt")
        ON CONFLICT ("tenantId", "kind", "year") DO UPDATE
          SET "lastValue" = GREATEST("document_counters"."lastValue", EXCLUDED."lastValue")
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "document_counters"`);
    for (const colonne of [
      'receptionNumberFormat', 'vendorBillNumberFormat',
      'creditNoteNumberFormat', 'productionOrderNumberFormat',
    ]) {
      await queryRunner.query(`ALTER TABLE "settings" DROP COLUMN IF EXISTS "${colonne}"`);
    }
  }
}
