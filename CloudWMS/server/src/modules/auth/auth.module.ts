import { randomBytes } from 'crypto';
import { Global, Logger, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/entities/user.entity';
import { Warehouse } from '../warehouses/entities/warehouse.entity';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';

const logger = new Logger('Auth');

/**
 * Signing key resolution: JWT_SECRET_ARN (Secrets Manager, used on AWS) -> JWT_SECRET (.env)
 * -> random per-process key outside production.
 */
async function jwtSecret(config: ConfigService): Promise<string> {
  const arn = config.get<string>('JWT_SECRET_ARN');
  if (arn) {
    const client = new SecretsManagerClient({ region: config.get<string>('AWS_REGION', 'us-east-1') });
    const res = await client.send(new GetSecretValueCommand({ SecretId: arn }));
    if (!res.SecretString || res.SecretString.length < 32) {
      throw new Error(`JWT secret ${arn} is empty or shorter than 32 characters`);
    }
    logger.log('Loaded JWT signing key from Secrets Manager');
    return res.SecretString;
  }
  const secret = config.get<string>('JWT_SECRET');
  if (secret && secret.length >= 32) return secret;
  if (config.get<string>('NODE_ENV') === 'production') {
    throw new Error('JWT_SECRET must be set to at least 32 characters in production');
  }
  logger.warn(
    'JWT_SECRET is missing or shorter than 32 characters - using a random per-process secret. ' +
      'Everyone is signed out whenever the server restarts. Set JWT_SECRET in .env.',
  );
  return randomBytes(48).toString('base64');
}

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([User, Warehouse]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => ({
        secret: await jwtSecret(config),
        signOptions: {
          // A shift-length session; the guard still re-checks the user on every request
          expiresIn: config.get<string>('JWT_EXPIRES_IN', '8h') as `${number}h`,
          issuer: 'technova-wms',
        },
        verifyOptions: { issuer: 'technova-wms', algorithms: ['HS256'] },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, { provide: APP_GUARD, useClass: AuthGuard }],
  exports: [AuthService],
})
export class AuthModule {}
