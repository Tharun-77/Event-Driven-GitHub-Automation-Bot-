import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import IORedis, { Redis } from 'ioredis';
import {
  EVENTS_QUEUE,
  EVENTS_QUEUE_TOKEN,
  REDIS_CONNECTION_TOKEN,
} from './queue.constants';
import { QueueService } from './queue.service';

@Module({
  providers: [
    {
      provide: REDIS_CONNECTION_TOKEN,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Redis => {
        const url = config.get<string>('REDIS_URL') ?? 'redis://localhost:6379';
        // BullMQ requires maxRetriesPerRequest: null; lazyConnect avoids
        // connecting until first use (so the app boots without Redis configured).
        return new IORedis(url, {
          maxRetriesPerRequest: null,
          enableReadyCheck: false,
          lazyConnect: true,
        });
      },
    },
    {
      provide: EVENTS_QUEUE_TOKEN,
      inject: [REDIS_CONNECTION_TOKEN],
      useFactory: (connection: Redis): Queue =>
        new Queue(EVENTS_QUEUE, { connection }),
    },
    QueueService,
  ],
  exports: [QueueService, EVENTS_QUEUE_TOKEN, REDIS_CONNECTION_TOKEN],
})
export class QueueModule {}
