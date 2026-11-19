import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { StorageService } from '../storage/storage.service';
import { Public } from '../auth/decorators';
import { SkipThrottle } from '@nestjs/throttler';

type Check = { status: 'up' | 'down' | 'disabled'; detail?: string };

@Controller('health')
export class HealthController {
  constructor(
    private readonly dataSource: DataSource,
    private readonly storage: StorageService,
  ) {}

  /** Liveness/readiness probe for load balancers and ECS health checks. */
  @Public()
  @SkipThrottle()
  @Get()
  async check() {
    const database: Check = await this.dataSource
      .query('SELECT 1')
      .then((): Check => ({ status: 'up' }))
      .catch((e: Error): Check => ({ status: 'down', detail: e.message }));

    const storage: Check = !this.storage.enabled
      ? { status: 'disabled', detail: 'S3_BUCKET_NAME not set' }
      : await this.storage
          .ping()
          .then((): Check => ({ status: 'up', detail: this.storage.bucket }))
          .catch((e: Error): Check => ({ status: 'down', detail: e.name || e.message }));

    const body = {
      status: database.status === 'up' && storage.status !== 'down' ? 'ok' : 'error',
      region: this.storage.region,
      checks: { database, storage },
    };
    if (body.status !== 'ok') {
      throw new ServiceUnavailableException(body);
    }
    return body;
  }
}
