/**
 * DataSource for the TypeORM CLI, used to GENERATE migrations on a developer machine:
 *
 *   npm run build
 *   npm run migration:generate -- src/database/migrations/AddSomething
 *
 * It reads plain DB_* settings from .env. Generate against a database whose schema
 * matches the previous migration (e.g. a scratch DB after `npm run migration:run`).
 * Running migrations in real environments goes through scripts/migrate.js, which
 * also supports DB_SECRET_ARN.
 */
import 'reflect-metadata';
import { join } from 'path';
import { config } from 'dotenv';
import { DataSource } from 'typeorm';
import { ENTITIES, MIGRATIONS } from '../config/database.config';

config({ path: join(__dirname, '..', '..', '.env'), quiet: true });

export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'technova_wms',
  entities: ENTITIES,
  migrations: MIGRATIONS,
  migrationsTableName: 'schema_migrations',
  synchronize: false,
});
