#!/usr/bin/env node
/**
 * Apply, revert or list database migrations, using exactly the same connection
 * settings as the API (.env, DB_SECRET_ARN, DB_SSL...).
 *
 *   npm run build
 *   npm run migration:run       # apply pending migrations
 *   npm run migration:show      # list applied / pending
 *   npm run migration:revert    # undo the most recent migration
 *
 * In production the API also applies pending migrations at startup
 * (DB_MIGRATIONS_RUN, default on when NODE_ENV=production).
 */
require('reflect-metadata');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const { ConfigService } = require('@nestjs/config');
const { DataSource } = require('typeorm');
const { buildTypeOrmOptions } = require('../dist/config/database.config');

async function main() {
  const command = process.argv[2];
  if (!['run', 'revert', 'show'].includes(command)) {
    console.error('Usage: node scripts/migrate.js <run|revert|show>');
    process.exit(2);
  }
  const options = await buildTypeOrmOptions(new ConfigService(process.env));
  const ds = new DataSource({ ...options, synchronize: false, migrationsRun: false });
  await ds.initialize();
  try {
    if (command === 'run') {
      const applied = await ds.runMigrations({ transaction: 'each' });
      console.log(applied.length ? `Applied: ${applied.map((m) => m.name).join(', ')}` : 'Database is up to date.');
    } else if (command === 'revert') {
      await ds.undoLastMigration({ transaction: 'each' });
      console.log('Reverted the most recent migration.');
    } else {
      const pending = await ds.showMigrations();
      const applied = await ds.query(`SELECT name, timestamp FROM schema_migrations ORDER BY timestamp`).catch(() => []);
      console.log('Applied:', applied.length ? applied.map((m) => m.name).join(', ') : '(none)');
      console.log(pending ? 'Pending migrations exist - run: npm run migration:run' : 'No pending migrations.');
    }
  } finally {
    await ds.destroy();
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
