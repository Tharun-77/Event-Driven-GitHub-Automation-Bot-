import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GithubAppService } from '../github/github-app.service';
import { PrismaService } from '../prisma/prisma.service';

export interface RepoDto {
  id: string;
  fullName: string;
  active: boolean;
  githubRepoId: string;
}

@Injectable()
export class RepositoriesService {
  constructor(
    private readonly github: GithubAppService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** URL where a signed-in user installs the GitHub App on their repositories. */
  getInstallUrl(): { url: string } {
    const slug = this.config.get<string>('GITHUB_APP_SLUG') ?? '';
    return { url: `https://github.com/apps/${slug}/installations/new` };
  }

  /**
   * After the user installs (or updates) the App, record the installation and
   * every repository it can access for that user. Idempotent via upserts, so it
   * is safe to run on both `install` and `update` setup actions.
   */
  async handleSetup(
    userId: string,
    installationId: number,
  ): Promise<{ count: number }> {
    const octokit = await this.github.getInstallationOctokit(installationId);
    const { data } = await octokit.rest.apps.listReposAccessibleToInstallation({
      per_page: 100,
    });
    const repos = data.repositories ?? [];

    const installation = await this.prisma.installation.upsert({
      where: { githubInstallationId: BigInt(installationId) },
      update: { userId },
      create: { githubInstallationId: BigInt(installationId), userId },
    });

    for (const repo of repos) {
      await this.prisma.repository.upsert({
        where: { githubRepoId: BigInt(repo.id) },
        update: {
          fullName: repo.full_name,
          installationId: installation.id,
          userId,
          active: true,
        },
        create: {
          githubRepoId: BigInt(repo.id),
          fullName: repo.full_name,
          installationId: installation.id,
          userId,
        },
      });
    }

    return { count: repos.length };
  }

  async listForUser(userId: string): Promise<RepoDto[]> {
    const repos = await this.prisma.repository.findMany({
      where: { userId },
      orderBy: { fullName: 'asc' },
    });
    return repos.map((r) => this.toDto(r));
  }

  async setActive(
    userId: string,
    repoId: string,
    active: boolean,
  ): Promise<RepoDto> {
    const repo = await this.prisma.repository.findUnique({
      where: { id: repoId },
    });
    if (!repo) {
      throw new NotFoundException('Repository not found');
    }
    if (repo.userId !== userId) {
      throw new ForbiddenException();
    }
    const updated = await this.prisma.repository.update({
      where: { id: repoId },
      data: { active },
    });
    return this.toDto(updated);
  }

  private toDto(r: {
    id: string;
    fullName: string;
    active: boolean;
    githubRepoId: bigint;
  }): RepoDto {
    return {
      id: r.id,
      fullName: r.fullName,
      active: r.active,
      githubRepoId: r.githubRepoId.toString(),
    };
  }
}
