import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  const github = {
    exchangeOAuthCode: jest.fn(),
    getAuthenticatedUser: jest.fn(),
  };
  const prisma = { user: { upsert: jest.fn(), findUnique: jest.fn() } };
  const jwt = {
    sign: jest.fn().mockReturnValue('signed.jwt.token'),
    verify: jest.fn(),
  };
  const config = { get: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    jwt.sign.mockReturnValue('signed.jwt.token');
    service = new AuthService(
      github as never,
      prisma as never,
      jwt as never,
      config as never,
    );
  });

  it('exchanges the code, upserts the user, and returns a session jwt', async () => {
    github.exchangeOAuthCode.mockResolvedValue({ accessToken: 'tok' });
    github.getAuthenticatedUser.mockResolvedValue({
      id: 42,
      login: 'octocat',
      avatarUrl: 'http://x/a.png',
    });
    prisma.user.upsert.mockResolvedValue({
      id: 'u1',
      login: 'octocat',
      avatarUrl: 'http://x/a.png',
    });

    const res = await service.handleCallback('code123');

    expect(github.exchangeOAuthCode).toHaveBeenCalledWith('code123');
    expect(prisma.user.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { githubUserId: BigInt(42) } }),
    );
    expect(res.token).toBe('signed.jwt.token');
    expect(res.user).toEqual({
      id: 'u1',
      login: 'octocat',
      avatarUrl: 'http://x/a.png',
    });
  });

  it('builds an authorize URL containing the client id and state', () => {
    config.get.mockImplementation((key: string) =>
      key === 'GITHUB_APP_CLIENT_ID'
        ? 'Iv1.abc'
        : key === 'API_BASE_URL'
          ? 'http://localhost:4000'
          : undefined,
    );

    const url = service.buildAuthorizeUrl('xyz-state');

    expect(url).toContain('github.com/login/oauth/authorize');
    expect(url).toContain('client_id=Iv1.abc');
    expect(url).toContain('state=xyz-state');
  });
});
