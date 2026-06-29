import { Injectable } from '@nestjs/common';
import { GithubAppService } from './github-app.service';

/**
 * Write-back actions via a GitHub App installation token. Each method is safe to
 * retry; callers check the ActionLog before invoking to avoid duplicate effects.
 */
@Injectable()
export class GithubWritebackService {
  constructor(private readonly github: GithubAppService) {}

  async addLabel(
    installationId: number,
    owner: string,
    repo: string,
    issueNumber: number,
    label: string,
  ): Promise<void> {
    const octokit = await this.github.getInstallationOctokit(installationId);
    await octokit.rest.issues.addLabels({
      owner,
      repo,
      issue_number: issueNumber,
      labels: [label],
    });
  }

  async postComment(
    installationId: number,
    owner: string,
    repo: string,
    issueNumber: number,
    body: string,
  ): Promise<void> {
    const octokit = await this.github.getInstallationOctokit(installationId);
    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: issueNumber,
      body,
    });
  }
}
