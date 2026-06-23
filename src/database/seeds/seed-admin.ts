import * as bcrypt from 'bcrypt';
import { DataSource } from 'typeorm';

async function main() {
  const args = process.argv.slice(2);
  const emailArg = args.find(a => a.startsWith('--email='));
  const passwordArg = args.find(a => a.startsWith('--password='));

  if (!emailArg || !passwordArg) {
    process.stderr.write('Usage: ts-node seed-admin.ts --email=admin@echango.dz --password=<secret>\n');
    process.exit(1);
  }

  const email = emailArg.split('=')[1];
  const password = passwordArg.split('=')[1];

  const dataSource = new DataSource({
    type: 'postgres',
    url: process.env.DATABASE_URL,
    entities: [],
    synchronize: false,
  });

  await dataSource.initialize();

  try {
    const existing = await dataSource.query(
      `SELECT id FROM users WHERE role = 'superadmin' LIMIT 1`,
    );
    if (existing.length > 0) {
      process.stderr.write('A superadmin already exists. Aborting.\n');
      process.exit(1);
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await dataSource.query(
      `INSERT INTO users (email, "passwordHash", name, role, "isActive", "tenantId")
       VALUES ($1, $2, 'Superadmin', 'superadmin', true, NULL)`,
      [email, passwordHash],
    );

    process.stdout.write(`Superadmin created: ${email}\n`);
  } finally {
    await dataSource.destroy();
  }
}

main().catch(err => { process.stderr.write(String(err) + '\n'); process.exit(1); });
