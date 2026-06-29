import { WebhooksService } from './webhooks.service';

describe('WebhooksService', () => {
  let service: WebhooksService;
  const prisma = {
    event: { findUnique: jest.fn(), create: jest.fn() },
    repository: { findUnique: jest.fn() },
  };
  const queue = { enqueueEvent: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new WebhooksService(prisma as never, queue as never);
  });

  const input = (deliveryId: string) => ({
    deliveryId,
    eventType: 'issues',
    payload: {
      action: 'opened',
      repository: { id: 555 },
      issue: {
        number: 1,
        title: 'bug here',
        user: { login: 'octo' },
        html_url: 'http://x/1',
      },
    },
  });

  it('processes a new delivery once and enqueues it', async () => {
    prisma.event.findUnique.mockResolvedValue(null);
    prisma.repository.findUnique.mockResolvedValue({ id: 'repo1' });
    prisma.event.create.mockResolvedValue({ id: 'e1' });

    const res = await service.ingest(input('d1'));

    expect(res).toEqual({ accepted: true, duplicate: false });
    expect(prisma.event.create).toHaveBeenCalledTimes(1);
    expect(queue.enqueueEvent).toHaveBeenCalledWith('e1', 'd1');
  });

  it('does not enqueue a duplicate delivery', async () => {
    prisma.event.findUnique.mockResolvedValue({ id: 'e1', deliveryId: 'd1' });

    const res = await service.ingest(input('d1'));

    expect(res.duplicate).toBe(true);
    expect(prisma.event.create).not.toHaveBeenCalled();
    expect(queue.enqueueEvent).not.toHaveBeenCalled();
  });
});
