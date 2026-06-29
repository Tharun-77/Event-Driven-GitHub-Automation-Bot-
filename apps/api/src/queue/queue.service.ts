import { Inject, Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { EVENTS_QUEUE_TOKEN, EventJobData } from './queue.constants';

@Injectable()
export class QueueService {
  constructor(
    @Inject(EVENTS_QUEUE_TOKEN)
    private readonly queue: Queue<EventJobData>,
  ) {}

  /**
   * Enqueues an event for processing. `jobId = deliveryId` gives queue-level
   * idempotency: a redelivered webhook produces the same job id, so BullMQ will
   * not create a duplicate job. Retries with exponential backoff on failure.
   */
  async enqueueEvent(eventId: string, deliveryId: string): Promise<void> {
    await this.queue.add(
      'process',
      { eventId },
      {
        jobId: deliveryId,
        attempts: 5,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      },
    );
  }
}
