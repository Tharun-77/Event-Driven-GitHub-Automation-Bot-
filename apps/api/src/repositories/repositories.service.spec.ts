import { RepositoriesService } from './repositories.service';

describe('RepositoriesService', () => {
  let service: RepositoriesService;
  const listRepos = jest.fn();
  const github = {
    getInstallationOctokit: jest.fn().mockResolvedValue({
      rest: { apps: { listReposAccessibleToInstallation: listRepos } },
    }),
  };
  const prisma = {
    installation: { upsert: jest.fn() },
    repository: {
      upsert: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };
  const config = { get: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new RepositoriesService(
      github as never,
      prisma as never,
      config as never,
    );
  });

  it('stores the installation and upserts each accessible repository', async () => {
    listRepos.mockResolvedValue({
      data: {
        repositories: [
          { id: 111, full_name: 'octo/repo-a' },
          { id: 222, full_name: 'octo/repo-b' },
        ],
      },
    });
    prisma.installation.upsert.mockResolvedValue({ id: 'inst1' });
    prisma.repository.upsert.mockResolvedValue({});

    const res = await service.handleSetup('user1', 9999);

    expect(github.getInstallationOctokit).toHaveBeenCalledWith(9999);
    expect(prisma.installation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { githubInstallationId: BigInt(9999) },
      }),
    );
    expect(prisma.repository.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.repository.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { githubRepoId: BigInt(111) } }),
    );
    expect(res.count).toBe(2);
  });

  it('forbids toggling a repository the user does not own', async () => {
    prisma.repository.findUnique.mockResolvedValue({
      id: 'r1',
      userId: 'someone-else',
    });
    await expect(service.setActive('user1', 'r1', false)).rejects.toThrow();
    expect(prisma.repository.update).not.toHaveBeenCalled();
  });
});
