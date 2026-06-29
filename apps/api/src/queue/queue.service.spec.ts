import { QueueService } from './queue.service';

describe('QueueService', () => {
  it('enqueues with jobId=deliveryId and retry/backoff options', async () => {
    const add = jest.fn().mockResolvedValue(undefined);
    const service = new QueueService({ add } as never);

    await service.enqueueEvent('e1', 'delivery-1');

    expect(add).toHaveBeenCalledWith(
      'process',
      { eventId: 'e1' },
      expect.objectContaining({
        jobId: 'delivery-1',
        attempts: 5,
        backoff: { type: 'exponential', delay: 2000 },
      }),
    );
  });
});
