import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { EventProcessor } from './event.processor';
import {
  EVENTS_QUEUE,
  EventJobData,
  REDIS_CONNECTION_TOKEN,
} from './queue.constants';

@Injectable()
export class EventWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventWorker.name);
  private worker?: Worker<EventJobData>;
  private workerConnection?: Redis;

  constructor(
    @Inject(REDIS_CONNECTION_TOKEN) private readonly connection: Redis,
    private readonly processor: EventProcessor,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    if (!this.config.get<string>('REDIS_URL')) {
      this.logger.warn('REDIS_URL not set; event worker not started');
      return;
    }

    // BullMQ workers need their own (blocking) connection, separate from the Queue.
    this.workerConnection = this.connection.duplicate();
    this.worker = new Worker<EventJobData>(
      EVENTS_QUEUE,
      async (job: Job<EventJobData>) => {
        await this.processor.process(job.data.eventId);
      },
      { connection: this.workerConnection },
    );

    this.worker.on('failed', (job, err) => {
      this.logger.error(`Job ${job?.id} failed: ${err.message}`);
      if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
        void this.markDeadLetter(job.data.eventId, err.message);
      }
    });

    this.logger.log('Event worker started');
  }

  private async markDeadLetter(
    eventId: string,
    message: string,
  ): Promise<void> {
    try {
      await this.prisma.event.update({
        where: { id: eventId },
        data: { status: 'dead_letter', error: message },
      });
    } catch (e) {
      this.logger.error(
        `Failed to mark event ${eventId} dead_letter: ${String(e)}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.workerConnection?.quit().catch(() => undefined);
  }
}
