import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { GithubAppService } from '../github/github-app.service';
import { PrismaService } from '../prisma/prisma.service';

export interface SessionUser {
  id: string;
  login: string;
  avatarUrl: string | null;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly github: GithubAppService,
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  /** GitHub authorize URL for user sign-in, carrying a CSRF `state`. */
  buildAuthorizeUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.config.get<string>('GITHUB_APP_CLIENT_ID') ?? '',
      redirect_uri: `${this.config.get<string>('API_BASE_URL')}/auth/github/callback`,
      state,
    });
    return `https://github.com/login/oauth/authorize?${params.toString()}`;
  }

  /** Completes sign-in: code -> user token -> identity -> upserted User -> session JWT. */
  async handleCallback(
    code: string,
  ): Promise<{ token: string; user: SessionUser }> {
    const { accessToken } = await this.github.exchangeOAuthCode(code);
    const ghUser = await this.github.getAuthenticatedUser(accessToken);

    const user = await this.prisma.user.upsert({
      where: { githubUserId: BigInt(ghUser.id) },
      update: { login: ghUser.login, avatarUrl: ghUser.avatarUrl },
      create: {
        githubUserId: BigInt(ghUser.id),
        login: ghUser.login,
        avatarUrl: ghUser.avatarUrl,
      },
    });

    return {
      token: this.issueJwt(user.id),
      user: { id: user.id, login: user.login, avatarUrl: user.avatarUrl },
    };
  }

  issueJwt(userId: string): string {
    return this.jwt.sign({ sub: userId });
  }

  verifyJwt(token: string): { sub: string } {
    return this.jwt.verify(token);
  }

  async getUserById(id: string): Promise<SessionUser | null> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) return null;
    return { id: user.id, login: user.login, avatarUrl: user.avatarUrl };
  }
}
