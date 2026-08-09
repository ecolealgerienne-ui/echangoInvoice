import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('[FATAL] DATABASE_URL manquante');

const ds = new DataSource({
  type: 'postgres',
  url: DATABASE_URL,
  entities: [__dirname + '/../../**/*.entity{.ts,.js}'],
  synchronize: false,
  ssl: false,
});

async function seed() {
  await ds.initialize();
  const qr = ds.createQueryRunner();
  await qr.connect();
  await qr.startTransaction();

  try {
    const tenantId = crypto.randomUUID();
    const userId = crypto.randomUUID();
    const passwordHash = await bcrypt.hash('admin1234', 10);

    // Tenant
    await qr.query(
      `INSERT INTO tenants (id, name, slug, email, status, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, 'active', NOW(), NOW())
       ON CONFLICT (slug) DO NOTHING`,
      [tenantId, 'Chambre Froide Djelfa', 'chambre-froide-djelfa', 'admin@chambre-froide.dz'],
    );

    // Récupérer le tenantId réel (en cas de conflit slug)
    const [tenant] = await qr.query(
      `SELECT id FROM tenants WHERE slug = $1`,
      ['chambre-froide-djelfa'],
    );
    const realTenantId = tenant.id;

    // User owner
    await qr.query(
      `INSERT INTO users (id, "tenantId", email, "passwordHash", name, role, "isActive", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, 'owner', true, NOW(), NOW())
       ON CONFLICT (email) DO NOTHING`,
      [userId, realTenantId, 'admin@chambre-froide.dz', passwordHash, 'Administrateur'],
    );

    // Abonnement
    //
    // Sans cette ligne le tenant n'avait AUCUN abonnement, et toutes les
    // limites du plan devenaient inertes : checkFreemiumQuota sort dès que la
    // souscription est absente, et la limite de postes faisait de même. Un
    // espace créé par ce seed ignorait donc les quotas que register() applique
    // à tout compte créé normalement.
    //
    // Plan « pro » : le jeu de démo compte 1000 factures, la limite de 30 du
    // plan starter bloquerait la création dès la première facture saisie à la
    // main. Pour éprouver les quotas, poser DEMO_PLAN=starter.
    const planSlug = process.env.DEMO_PLAN ?? 'pro';
    const [plan] = await qr.query(`SELECT id, "invoiceLimit", "usersLimit" FROM plans WHERE slug = $1`, [planSlug]);

    await qr.query(
      `INSERT INTO subscriptions
         ("tenantId", plan, "planId", status, "invoicesThisMonth", "invoiceLimit",
          "usersCount", "usersLimit", "createdAt", "updatedAt")
       SELECT $1, $2, $3, 'active', 0, $4,
              (SELECT count(*) FROM users WHERE "tenantId" = $1 AND "isActive" = true),
              $5, NOW(), NOW()
       WHERE NOT EXISTS (SELECT 1 FROM subscriptions WHERE "tenantId" = $1)`,
      [realTenantId, planSlug, plan?.id ?? null, plan?.invoiceLimit ?? null, plan?.usersLimit ?? null],
    );

    await qr.commitTransaction();

    console.log(`\n✅ Seed terminé avec succès — plan ${planSlug}\n`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  Email    : admin@chambre-froide.dz');
    console.log('  Password : admin1234');
    console.log('  Role     : owner');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  } catch (err) {
    await qr.rollbackTransaction();
    console.error('❌ Seed échoué:', err);
    process.exit(1);
  } finally {
    await qr.release();
    await ds.destroy();
  }
}

seed();
