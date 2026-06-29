export const EVENTS_QUEUE = 'events';

/** DI token for the BullMQ events Queue instance. */
export const EVENTS_QUEUE_TOKEN = 'EVENTS_QUEUE_TOKEN';

/** DI token for the shared ioredis connection. */
export const REDIS_CONNECTION_TOKEN = 'REDIS_CONNECTION_TOKEN';

export interface EventJobData {
  eventId: string;
}
