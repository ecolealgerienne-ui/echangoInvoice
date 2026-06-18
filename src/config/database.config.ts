import { DataSource, DataSourceOptions } from 'typeorm';
import { requireEnv } from './env.config';
import * as dotenv from 'dotenv';

dotenv.config();

export function getDatabaseConfig(): DataSourceOptions {
  return {
    type: 'postgres',
    url: requireEnv('DATABASE_URL'),
    entities: [__dirname + '/../**/*.entity{.ts,.js}'],
    migrations: [__dirname + '/../database/migrations/*{.ts,.js}'],
    synchronize: false,
    logging: process.env.NODE_ENV === 'development',
  };
}

// For CLI (migration:run, migration:generate)
export default new DataSource(getDatabaseConfig());
