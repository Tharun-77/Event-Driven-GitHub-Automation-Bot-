import { GithubWritebackService } from './github-writeback.service';

describe('GithubWritebackService', () => {
  const addLabels = jest.fn();
  const createComment = jest.fn();
  const github = {
    getInstallationOctokit: jest.fn().mockResolvedValue({
      rest: { issues: { addLabels, createComment } },
    }),
  };
  let service: GithubWritebackService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new GithubWritebackService(github as never);
  });

  it('adds a label via the installation octokit', async () => {
    await service.addLabel(1, 'octo', 'repo', 5, 'bug');
    expect(github.getInstallationOctokit).toHaveBeenCalledWith(1);
    expect(addLabels).toHaveBeenCalledWith({
      owner: 'octo',
      repo: 'repo',
      issue_number: 5,
      labels: ['bug'],
    });
  });

  it('posts a comment via the installation octokit', async () => {
    await service.postComment(1, 'octo', 'repo', 5, 'hello there');
    expect(createComment).toHaveBeenCalledWith({
      owner: 'octo',
      repo: 'repo',
      issue_number: 5,
      body: 'hello there',
    });
  });
});
