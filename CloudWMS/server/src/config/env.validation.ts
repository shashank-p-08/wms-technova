import { plainToInstance, Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

export enum NodeEnv {
  development = 'development',
  test = 'test',
  production = 'production',
}

const toBool = ({ value }: { value: unknown }) =>
  value === undefined || value === '' ? undefined : String(value).toLowerCase() === 'true';
const toInt = ({ value }: { value: unknown }) =>
  value === undefined || value === '' ? undefined : Number(value);
const emptyToUndefined = ({ value }: { value: unknown }) => (value === '' ? undefined : value);

/** Every environment variable the API reads, with types and allowed values. */
class EnvironmentVariables {
  @IsEnum(NodeEnv)
  NODE_ENV: NodeEnv = NodeEnv.development;

  @Transform(toInt) @IsInt() @Min(1) @Max(65535)
  PORT = 3000;

  // ---- database ----
  @Transform(emptyToUndefined) @IsOptional() @IsString()
  DB_SECRET_ARN?: string;

  @Transform(emptyToUndefined) @IsOptional() @IsString()
  DB_HOST?: string;

  @Transform(toInt) @IsOptional() @IsInt() @Min(1) @Max(65535)
  DB_PORT?: number;

  @Transform(emptyToUndefined) @IsOptional() @IsString()
  DB_USERNAME?: string;

  @Transform(emptyToUndefined) @IsOptional() @IsString()
  DB_PASSWORD?: string;

  @Transform(emptyToUndefined) @IsOptional() @IsString()
  DB_NAME?: string;

  @Transform(toBool) @IsOptional() @IsBoolean()
  DB_SSL?: boolean;

  @Transform(emptyToUndefined) @IsOptional() @IsString()
  DB_SSL_CA_PATH?: string;

  /** Auto-create/alter tables from entities. Default: on in development only. */
  @Transform(toBool) @IsOptional() @IsBoolean()
  DB_SYNCHRONIZE?: boolean;

  /** Apply pending migrations at startup. Default: on in production. */
  @Transform(toBool) @IsOptional() @IsBoolean()
  DB_MIGRATIONS_RUN?: boolean;

  @Transform(toInt) @IsOptional() @IsInt() @Min(1) @Max(200)
  DB_POOL_SIZE?: number;

  @Transform(toBool) @IsOptional() @IsBoolean()
  DB_LOGGING?: boolean;

  // ---- auth ----
  @Transform(emptyToUndefined) @IsOptional() @IsString() @MinLength(32, { message: 'JWT_SECRET must be at least 32 characters' })
  JWT_SECRET?: string;

  @Transform(emptyToUndefined) @IsOptional() @IsString()
  JWT_SECRET_ARN?: string;

  @Transform(emptyToUndefined) @IsOptional() @Matches(/^\d+[smhd]$/, { message: 'JWT_EXPIRES_IN must look like 15m, 8h or 1d' })
  JWT_EXPIRES_IN?: string;

  // ---- http ----
  /** Comma-separated browser origins allowed to call the API */
  @Transform(emptyToUndefined) @IsOptional() @IsString()
  CORS_ORIGINS?: string;

  /** Set when running behind a load balancer so client IPs (rate limiting, logs) are correct */
  @Transform(toBool) @IsOptional() @IsBoolean()
  TRUST_PROXY?: boolean;

  /** Requests per minute per client IP for the whole API (default 300) */
  @Transform(toInt) @IsOptional() @IsInt() @Min(1)
  RATE_LIMIT_PER_MINUTE?: number;

  /** Sign-in attempts per minute per client IP (default 10) */
  @Transform(toInt) @IsOptional() @IsInt() @Min(1)
  LOGIN_RATE_LIMIT_PER_MINUTE?: number;

  // ---- aws ----
  @Transform(emptyToUndefined) @IsOptional() @IsString()
  AWS_REGION?: string;

  @Transform(emptyToUndefined) @IsOptional() @IsString()
  AWS_ENDPOINT_URL?: string;

  @Transform(emptyToUndefined) @IsOptional() @IsString()
  S3_BUCKET_NAME?: string;
}

/**
 * Runs once at startup (ConfigModule.validate). Fails fast with every problem listed,
 * instead of a cryptic error the first time a missing value is used.
 */
export function validateEnv(raw: Record<string, unknown>) {
  const env = plainToInstance(EnvironmentVariables, raw, { enableImplicitConversion: false });
  const errors = validateSync(env, { skipMissingProperties: false });
  const problems = errors.flatMap((e) => Object.values(e.constraints ?? {}));

  if (env.NODE_ENV === NodeEnv.production) {
    if (!env.JWT_SECRET_ARN && !env.JWT_SECRET) {
      problems.push('Production requires JWT_SECRET_ARN (preferred) or JWT_SECRET');
    }
    if (!env.DB_SECRET_ARN && !env.DB_PASSWORD) {
      problems.push('Production requires DB_SECRET_ARN (preferred) or DB_PASSWORD');
    }
    if (env.DB_SYNCHRONIZE) {
      problems.push('DB_SYNCHRONIZE must not be true in production - use migrations');
    }
    if (!env.CORS_ORIGINS) {
      problems.push('Production requires CORS_ORIGINS (the URL the frontend is served from)');
    }
  }

  if (problems.length) {
    throw new Error(`Invalid environment configuration:\n  - ${problems.join('\n  - ')}`);
  }
  // Return the raw values (ConfigService reads strings); validation only gates startup
  return raw;
}
