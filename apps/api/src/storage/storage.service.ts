import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import * as sharp from 'sharp';
import { randomUUID } from 'crypto';

@Injectable()
export class StorageService {
  private readonly s3: S3Client;
  private readonly bucket: string;
  private readonly endpoint: string;
  private readonly logger = new Logger(StorageService.name);

  constructor(private readonly cfg: ConfigService) {
    this.endpoint = cfg.getOrThrow('S3_ENDPOINT');
    this.bucket = cfg.get('S3_BUCKET', 'menuflow');

    this.s3 = new S3Client({
      endpoint: this.endpoint,
      region: cfg.get('S3_REGION', 'us-east-1'),
      credentials: {
        accessKeyId: cfg.getOrThrow('S3_ACCESS_KEY'),
        secretAccessKey: cfg.getOrThrow('S3_SECRET_KEY'),
      },
      forcePathStyle: true,
    });
  }

  async uploadImage(
    buffer: Buffer,
    folder: string,
    options: { width?: number; height?: number; quality?: number } = {},
  ): Promise<string> {
    const { width = 1200, height, quality = 85 } = options;

    const processed = await sharp(buffer)
      .resize(width, height, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality })
      .toBuffer();

    const key = `${folder}/${randomUUID()}.webp`;

    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: processed,
        ContentType: 'image/webp',
        CacheControl: 'public, max-age=31536000',
      }),
    );

    return `${this.endpoint}/${this.bucket}/${key}`;
  }

  async deleteFile(url: string) {
    try {
      const key = url.replace(`${this.endpoint}/${this.bucket}/`, '');
      await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch (err) {
      this.logger.warn(`Не удалось удалить файл: ${url}`, err);
    }
  }

  async getPresignedUrl(key: string, expiresIn = 3600): Promise<string> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return getSignedUrl(this.s3, command, { expiresIn });
  }
}
