import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { QueueService } from '../queue/queue.service';

/** The subset of GitHub webhook payload fields we read. */
interface GithubWebhookPayload {
  action?: string;
  repository?: { id?: number };
  issue?: IssueLike;
  pull_request?: IssueLike;
  ref?: string;
  commits?: unknown[];
  pusher?: { name?: string };
}

interface IssueLike {
  number?: number;
  title?: string;
  user?: { login?: string };
  html_url?: string;
}

export interface IngestInput {
  deliveryId: string;
  eventType: string;
  payload: GithubWebhookPayload;
}

export interface IngestResult {
  accepted: boolean;
  duplicate: boolean;
}

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
  ) {}

  async ingest(input: IngestInput): Promise<IngestResult> {
    const { deliveryId, eventType, payload } = input;

    // Idempotency: never process the same delivery twice.
    const existing = await this.prisma.event.findUnique({
      where: { deliveryId },
    });
    if (existing) {
      this.logger.debug(`Duplicate delivery ${deliveryId} ignored`);
      return { accepted: true, duplicate: true };
    }

    const repositoryId = await this.resolveRepositoryId(payload);
    const action = typeof payload.action === 'string' ? payload.action : null;

    let event: { id: string };
    try {
      event = await this.prisma.event.create({
        data: {
          deliveryId,
          eventType,
          action,
          repositoryId,
          payload: payload as unknown as Prisma.InputJsonValue,
          payloadSummary: this.summarize(eventType, payload),
          status: 'pending',
        },
        select: { id: true },
      });
    } catch (err) {
      // Unique violation on deliveryId from a concurrent delivery -> duplicate.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        return { accepted: true, duplicate: true };
      }
      throw err;
    }

    // Persisted before enqueue: even if the queue is briefly down, the event is
    // durable and can be re-enqueued.
    await this.queue.enqueueEvent(event.id, deliveryId);
    return { accepted: true, duplicate: false };
  }

  private async resolveRepositoryId(
    payload: GithubWebhookPayload,
  ): Promise<string | null> {
    const ghRepoId = payload.repository?.id;
    if (!ghRepoId) {
      return null;
    }
    const repo = await this.prisma.repository.findUnique({
      where: { githubRepoId: BigInt(ghRepoId) },
      select: { id: true },
    });
    return repo?.id ?? null;
  }

  /** Compact, non-sensitive summary used by the dashboard. */
  private summarize(
    eventType: string,
    payload: GithubWebhookPayload,
  ): Prisma.InputJsonValue {
    if (eventType === 'issues' && payload.issue) {
      return this.issueSummary(payload.issue);
    }
    if (eventType === 'pull_request' && payload.pull_request) {
      return this.issueSummary(payload.pull_request);
    }
    if (eventType === 'push') {
      return {
        ref: payload.ref ?? null,
        commits: Array.isArray(payload.commits) ? payload.commits.length : 0,
        pusher: payload.pusher?.name ?? null,
      };
    }
    return { action: payload.action ?? null };
  }

  private issueSummary(obj: IssueLike): Prisma.InputJsonValue {
    return {
      number: obj.number ?? null,
      title: obj.title ?? null,
      author: obj.user?.login ?? null,
      url: obj.html_url ?? null,
    };
  }
}
