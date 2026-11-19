import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';

const DEV_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173'];

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // JSON bodies are small; image uploads go through multer with their own 5 MB limit
    bodyParser: true,
  });
  const config = app.get(ConfigService);

  app.setGlobalPrefix('api');
  app.useBodyParser('json', { limit: '100kb' });

  // Behind an ALB / reverse proxy: use X-Forwarded-For for the real client IP
  // (rate limiting and logs would otherwise see the load balancer's address)
  if (config.get<string>('TRUST_PROXY') === 'true') {
    app.set('trust proxy', 1);
  }

  // Security headers. The API serves JSON only, so a locked-down CSP is safe.
  app.use(
    helmet({
      contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );

  const origins = (config.get<string>('CORS_ORIGINS') ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({
    origin: origins.length ? origins : DEV_ORIGINS,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    allowedHeaders: ['Content-Type', 'Authorization'],
    // Tokens travel in the Authorization header, not cookies
    credentials: false,
    maxAge: 600,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
    }),
  );

  // Finish in-flight requests and close the DB pool on SIGTERM (ECS task stop / deploys)
  app.enableShutdownHooks();

  const port = Number(config.get<string>('PORT') ?? 3000);
  await app.listen(port, '0.0.0.0');
  logger.log(`🚀 TechNova WMS Backend running at: http://localhost:${port}/api`);
}
bootstrap();
