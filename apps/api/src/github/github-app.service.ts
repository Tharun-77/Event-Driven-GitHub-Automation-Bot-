import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createAppAuth } from '@octokit/auth-app';
import { Octokit } from '@octokit/rest';
import * as jwt from 'jsonwebtoken';

export interface GithubUser {
  id: number;
  login: string;
  avatarUrl: string;
}

/**
 * Wraps the single GitHub App used for both user OAuth sign-in and installation
 * (webhooks + write-back). Reads its config from env and guards missing values at
 * call time so the app can still boot before the GitHub App is provisioned.
 */
@Injectable()
export class GithubAppService {
  constructor(private readonly config: ConfigService) {}

  private require(key: string): string {
    const value = this.config.get<string>(key);
    if (!value) {
      throw new InternalServerErrorException(
        `Missing required configuration: ${key}`,
      );
    }
    return value;
  }

  private privateKeyPem(): string {
    return Buffer.from(
      this.require('GITHUB_APP_PRIVATE_KEY_BASE64'),
      'base64',
    ).toString('utf8');
  }

  /**
   * Short-lived (9 min) JWT signed with the App private key (RS256), used to
   * authenticate as the GitHub App itself (e.g. to mint installation tokens).
   */
  createAppJwt(): string {
    const appId = this.require('GITHUB_APP_ID');
    const now = Math.floor(Date.now() / 1000);
    return jwt.sign(
      { iat: now - 60, exp: now + 9 * 60, iss: appId },
      this.privateKeyPem(),
      { algorithm: 'RS256' },
    );
  }

  /**
   * An Octokit client authenticated as a specific installation, used for
   * write-back (labels/comments) and listing installation repositories.
   */
  async getInstallationOctokit(installationId: number): Promise<Octokit> {
    return new Octokit({
      authStrategy: createAppAuth,
      auth: {
        appId: this.require('GITHUB_APP_ID'),
        privateKey: this.privateKeyPem(),
        installationId,
      },
    });
  }

  /** Exchanges an OAuth `code` (user sign-in) for a user access token. */
  async exchangeOAuthCode(code: string): Promise<{ accessToken: string }> {
    const res = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        client_id: this.require('GITHUB_APP_CLIENT_ID'),
        client_secret: this.require('GITHUB_APP_CLIENT_SECRET'),
        code,
      }),
    });
    if (!res.ok) {
      throw new InternalServerErrorException('GitHub OAuth exchange failed');
    }
    const data = (await res.json()) as {
      access_token?: string;
      error?: string;
      error_description?: string;
    };
    if (!data.access_token) {
      throw new InternalServerErrorException(
        `GitHub OAuth error: ${data.error_description ?? data.error ?? 'no token returned'}`,
      );
    }
    return { accessToken: data.access_token };
  }

  /** Resolves the GitHub identity behind a user access token. */
  async getAuthenticatedUser(token: string): Promise<GithubUser> {
    const octokit = new Octokit({ auth: token });
    const { data } = await octokit.rest.users.getAuthenticated();
    return { id: data.id, login: data.login, avatarUrl: data.avatar_url };
  }
}
