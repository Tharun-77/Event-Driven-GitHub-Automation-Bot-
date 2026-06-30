import { EventProcessor } from './event.processor';

describe('EventProcessor', () => {
  let processor: EventProcessor;
  const prisma = {
    event: { findUnique: jest.fn(), update: jest.fn().mockResolvedValue({}) },
    rule: { findMany: jest.fn() },
    actionLog: { findMany: jest.fn(), create: jest.fn().mockResolvedValue({}) },
  };
  const writeback = { addLabel: jest.fn(), postComment: jest.fn() };
  const slack = { notify: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.event.update.mockResolvedValue({});
    prisma.actionLog.create.mockResolvedValue({});
    processor = new EventProcessor(
      prisma as never,
      writeback as never,
      slack as never,
    );
  });

  const event = {
    id: 'e1',
    eventType: 'issues',
    payload: {
      issue: {
        number: 7,
        title: 'login bug',
        body: '',
        user: { login: 'octo' },
        labels: [],
      },
    },
    repository: {
      id: 'repo1',
      fullName: 'octo/repo',
      installation: { githubInstallationId: BigInt(123) },
    },
  };
  const labelRule = {
    id: 'r1',
    name: 'bug rule',
    enabled: true,
    eventType: 'issues',
    matchField: 'title',
    matchOp: 'contains',
    matchValue: 'bug',
    actions: { addLabel: true, labelName: 'bug' },
  };

  it('adds a label for a matching rule and marks the event done', async () => {
    prisma.event.findUnique.mockResolvedValue(event);
    prisma.rule.findMany.mockResolvedValue([labelRule]);
    prisma.actionLog.findMany.mockResolvedValue([]);

    await processor.process('e1');

    expect(writeback.addLabel).toHaveBeenCalledTimes(1);
    expect(writeback.addLabel).toHaveBeenCalledWith(
      123,
      'octo',
      'repo',
      7,
      'bug',
    );
    expect(prisma.actionLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'label_added',
          status: 'success',
        }),
      }),
    );
    expect(prisma.event.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'done' }),
      }),
    );
  });

  it('does not re-add a label that already succeeded (idempotent retry)', async () => {
    prisma.event.findUnique.mockResolvedValue(event);
    prisma.rule.findMany.mockResolvedValue([labelRule]);
    prisma.actionLog.findMany.mockResolvedValue([
      { type: 'label_added', status: 'success', detail: { dedupeKey: 'bug' } },
    ]);

    await processor.process('e1');

    expect(writeback.addLabel).not.toHaveBeenCalled();
    expect(prisma.event.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'done' }),
      }),
    );
  });

  it('rethrows and does not mark done when write-back fails', async () => {
    prisma.event.findUnique.mockResolvedValue(event);
    prisma.rule.findMany.mockResolvedValue([labelRule]);
    prisma.actionLog.findMany.mockResolvedValue([]);
    writeback.addLabel.mockRejectedValue(new Error('GitHub 503'));

    await expect(processor.process('e1')).rejects.toThrow('GitHub 503');

    expect(prisma.event.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'done' }),
      }),
    );
    expect(prisma.event.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'failed' }),
      }),
    );
  });
});
