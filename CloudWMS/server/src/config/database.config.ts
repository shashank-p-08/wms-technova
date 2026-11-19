import { readFileSync } from 'fs';
import { join } from 'path';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { User } from '../modules/users/entities/user.entity';
import { Product } from '../modules/products/entities/product.entity';
import { ProductCategory } from '../modules/products/entities/product-category.entity';
import { Inventory } from '../modules/inventory/entities/inventory.entity';
import { InventoryTransaction } from '../modules/inventory/entities/inventory-transaction.entity';
import { Company } from '../modules/company/entities/company.entity';
import { Warehouse } from '../modules/warehouses/entities/warehouse.entity';

const logger = new Logger('Database');

export const ENTITIES = [Company, Warehouse, User, Product, ProductCategory, Inventory, InventoryTransaction];
/** Compiled migrations (dist/database/migrations); .ts is picked up when running via ts-node */
export const MIGRATIONS = [join(__dirname, '..', 'database', 'migrations', '*.{js,ts}')];

const flag = (config: ConfigService, key: string): boolean | undefined => {
  const v = config.get<string>(key);
  return v === undefined || v === '' ? undefined : String(v).toLowerCase() === 'true';
};

interface RdsSecret {
  username: string;
  password: string;
  host?: string;
  port?: number;
  dbname?: string;
}

/**
 * Fetch RDS credentials from AWS Secrets Manager. The secret is created by the
 * foundation stack (infrastructure/cloudformation/starter.yaml) and contains
 * username, password, host, port and dbname.
 */
async function loadRdsSecret(secretId: string, region: string): Promise<RdsSecret> {
  const client = new SecretsManagerClient({ region });
  const res = await client.send(new GetSecretValueCommand({ SecretId: secretId }));
  if (!res.SecretString) {
    throw new Error(`Secret ${secretId} has no SecretString`);
  }
  const secret = JSON.parse(res.SecretString) as RdsSecret;
  if (!secret.username || !secret.password) {
    throw new Error(`Secret ${secretId} is missing username/password`);
  }
  return secret;
}

function sslOptions(config: ConfigService) {
  if (config.get<string>('DB_SSL', 'false').toLowerCase() !== 'true') {
    return false;
  }
  // RDS certificates are not in Node's default trust store, so the CA bundle must
  // be supplied (scripts/get-rds-ca.ps1 downloads it to certs/rds-global-bundle.pem).
  const caPath = config.get<string>('DB_SSL_CA_PATH');
  return {
    rejectUnauthorized: true,
    ...(caPath ? { ca: readFileSync(caPath, 'utf8') } : {}),
  };
}

/**
 * Connection resolution order:
 *  1. DB_SECRET_ARN set  -> credentials (and host/port/dbname) from Secrets Manager
 *  2. otherwise          -> DB_USERNAME / DB_PASSWORD from the environment
 * DB_HOST / DB_PORT / DB_NAME always win when set, e.g. to reach RDS through a
 * local tunnel while still using the managed credentials.
 */
export async function buildTypeOrmOptions(
  config: ConfigService,
): Promise<TypeOrmModuleOptions> {
  const secretArn = config.get<string>('DB_SECRET_ARN');
  const region = config.get<string>('AWS_REGION', 'us-east-1');

  let secret: RdsSecret | undefined;
  if (secretArn) {
    secret = await loadRdsSecret(secretArn, region);
    logger.log(`Loaded database credentials from Secrets Manager (${secretArn.split(':').pop()})`);
  }

  const host = config.get<string>('DB_HOST') || secret?.host || 'localhost';
  const port = Number(config.get<string>('DB_PORT') || secret?.port || 5432);
  const database = config.get<string>('DB_NAME') || secret?.dbname || 'technova_wms';
  const ssl = sslOptions(config);
  const env = config.get<string>('NODE_ENV', 'development');
  // Schema strategy: synchronize for quick local iteration, migrations everywhere else
  const synchronize = flag(config, 'DB_SYNCHRONIZE') ?? env === 'development';
  const migrationsRun = flag(config, 'DB_MIGRATIONS_RUN') ?? env === 'production';

  logger.log(
    `Connecting to PostgreSQL ${host}:${port}/${database} ` +
      `(ssl=${ssl ? 'on' : 'off'}, schema=${synchronize ? 'synchronize' : migrationsRun ? 'migrations' : 'unchanged'})`,
  );

  return {
    type: 'postgres',
    host,
    port,
    database,
    username: secret?.username ?? config.get<string>('DB_USERNAME', 'postgres'),
    password: secret?.password ?? config.get<string>('DB_PASSWORD', ''),
    ssl,
    entities: ENTITIES,
    migrations: MIGRATIONS,
    migrationsTableName: 'schema_migrations',
    synchronize,
    migrationsRun,
    // Every query only when asked for; errors, warnings and migrations always
    logging: flag(config, 'DB_LOGGING') ? 'all' : ['error', 'warn', 'migration'],
    // Pool sized for one API task; RDS db.t4g.micro allows ~80 connections in total
    extra: { max: Number(config.get<string>('DB_POOL_SIZE') || 10) },
    // Fail fast instead of hanging if the database is unreachable
    connectTimeoutMS: 10000,
    retryAttempts: 3,
    retryDelay: 2000,
  };
}
