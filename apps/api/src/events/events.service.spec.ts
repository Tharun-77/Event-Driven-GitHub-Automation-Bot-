import { EventsService } from './events.service';

describe('EventsService', () => {
  const findMany = jest.fn().mockResolvedValue([]);
  const service = new EventsService({ event: { findMany } } as never);

  beforeEach(() => jest.clearAllMocks());

  it('scopes the query to repositories owned by the user', async () => {
    await service.listForUser('user1');
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { repository: { userId: 'user1' } } }),
    );
  });

  it('also filters by repository id when provided', async () => {
    await service.listForUser('user1', 'repo1');
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { repository: { userId: 'user1', id: 'repo1' } },
      }),
    );
  });
});
