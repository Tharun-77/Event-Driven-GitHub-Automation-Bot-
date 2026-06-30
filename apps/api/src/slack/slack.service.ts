import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface SlackMessage {
  text: string;
  blocks?: unknown[];
}

@Injectable()
export class SlackService {
  private readonly logger = new Logger(SlackService.name);

  constructor(private readonly config: ConfigService) {}

  /**
   * Posts a message to the configured Slack Incoming Webhook. Throws on a
   * non-2xx response so the worker retries; if no webhook is configured it logs
   * and no-ops (so local/dev runs don't fail).
   */
  async notify(message: SlackMessage): Promise<void> {
    const url = this.config.get<string>('SLACK_WEBHOOK_URL');
    if (!url) {
      this.logger.warn(
        'SLACK_WEBHOOK_URL not set; skipping Slack notification',
      );
      return;
    }
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    });
    if (!res.ok) {
      throw new Error(`Slack notification failed with status ${res.status}`);
    }
  }
}
