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

    await qr.commitTransaction();

    console.log('\n✅ Seed terminé avec succès\n');
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
