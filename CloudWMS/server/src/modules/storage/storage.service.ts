import { randomUUID } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

export const ALLOWED_IMAGE_TYPES = Object.keys(EXTENSIONS);

/**
 * Amazon S3 access for product images and other assets.
 *
 * Credentials come from the standard AWS chain: the IAM role when running on
 * AWS (ECS task role / EC2 instance profile), or AWS_ACCESS_KEY_ID /
 * AWS_SECRET_ACCESS_KEY locally. AWS_ENDPOINT_URL switches to the Floci emulator.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly s3: S3Client;
  readonly bucket: string;
  readonly region: string;

  constructor(config: ConfigService) {
    this.region = config.get<string>('AWS_REGION', 'us-east-1');
    this.bucket = config.get<string>('S3_BUCKET_NAME', '');
    const endpoint = config.get<string>('AWS_ENDPOINT_URL');

    this.s3 = new S3Client({
      region: this.region,
      ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
    });

    if (!this.bucket) {
      this.logger.warn('S3_BUCKET_NAME is not set - image uploads are disabled');
    }
  }

  get enabled(): boolean {
    return Boolean(this.bucket);
  }

  /** Upload an object under a generated, collision-free key and return the key. */
  async uploadImage(prefix: string, body: Buffer, contentType: string): Promise<string> {
    const ext = EXTENSIONS[contentType] ?? 'bin';
    const key = `${prefix}/${randomUUID()}.${ext}`;
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        CacheControl: 'private, max-age=86400',
      }),
    );
    return key;
  }

  /** Short-lived pre-signed URL for direct browser/client upload (HTTP PUT). */
  async getPresignedUploadUrl(
    prefix: string,
    contentType: string,
    expiresInSeconds = 900,
  ): Promise<{ uploadUrl: string; key: string }> {
    const ext = EXTENSIONS[contentType] ?? 'bin';
    const key = `${prefix}/${randomUUID()}.${ext}`;
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    });
    const uploadUrl = await getSignedUrl(this.s3, command, {
      expiresIn: expiresInSeconds,
    });
    return { uploadUrl, key };
  }

  /** Short-lived URL the browser can load directly; the bucket itself stays private. */
  async signedReadUrl(key: string, expiresInSeconds = 3600): Promise<string> {
    return getSignedUrl(
      this.s3,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: expiresInSeconds },
    );
  }

  async delete(key: string): Promise<void> {
    try {
      await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch (err) {
      // An orphaned object is preferable to failing the user's request
      this.logger.warn(`Could not delete s3://${this.bucket}/${key}: ${(err as Error).message}`);
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.s3.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch {
      return false;
    }
  }

  async ping(): Promise<void> {
    await this.s3.send(new HeadBucketCommand({ Bucket: this.bucket }));
  }
}
