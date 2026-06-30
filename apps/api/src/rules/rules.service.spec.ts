import { RulesService } from './rules.service';
import { CreateRuleDto } from './dto/create-rule.dto';

const dto: CreateRuleDto = {
  name: 'Bug triage',
  eventType: 'issues',
  matchField: 'title',
  matchOp: 'contains',
  matchValue: 'bug',
  actions: { addLabel: true, labelName: 'bug', slackNotify: true },
};

describe('RulesService', () => {
  let service: RulesService;
  const prisma = {
    repository: { findUnique: jest.fn() },
    rule: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findMany: jest.fn(),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new RulesService(prisma as never);
  });

  it('creates a rule when the user owns the repository', async () => {
    prisma.repository.findUnique.mockResolvedValue({ userId: 'user1' });
    prisma.rule.create.mockResolvedValue({ id: 'r1' });

    await service.create('user1', 'repo1', dto);

    expect(prisma.rule.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          repositoryId: 'repo1',
          name: 'Bug triage',
        }),
      }),
    );
  });

  it('rejects creating a rule on a repository the user does not own', async () => {
    prisma.repository.findUnique.mockResolvedValue({ userId: 'someone-else' });

    await expect(service.create('user1', 'repo1', dto)).rejects.toThrow();
    expect(prisma.rule.create).not.toHaveBeenCalled();
  });

  it('rejects deleting a rule the user does not own', async () => {
    prisma.rule.findUnique.mockResolvedValue({
      repository: { userId: 'someone-else' },
    });

    await expect(service.remove('user1', 'r1')).rejects.toThrow();
    expect(prisma.rule.delete).not.toHaveBeenCalled();
  });
});
