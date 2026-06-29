import {
  Controller,
  Headers,
  HttpCode,
  Post,
  RawBodyRequest,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { IngestResult, WebhooksService } from './webhooks.service';
import { verifySignature } from './verify-signature';

@ApiTags('webhooks')
@Controller('webhooks')
export class WebhooksController {
  constructor(
    private readonly webhooks: WebhooksService,
    private readonly config: ConfigService,
  ) {}

  @Post('github')
  @HttpCode(200)
  async github(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-hub-signature-256') signature: string,
    @Headers('x-github-delivery') deliveryId: string,
    @Headers('x-github-event') eventType: string,
  ): Promise<IngestResult> {
    const secret = this.config.get<string>('GITHUB_WEBHOOK_SECRET') ?? '';
    const raw = req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}));

    if (!verifySignature(raw, signature, secret)) {
      throw new UnauthorizedException('Invalid signature');
    }
    if (!deliveryId || !eventType) {
      throw new UnauthorizedException('Missing delivery headers');
    }

    return this.webhooks.ingest({
      deliveryId,
      eventType,
      payload: req.body as Record<string, unknown>,
    });
  }
}
