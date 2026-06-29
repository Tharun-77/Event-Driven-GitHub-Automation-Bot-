import { Module } from '@nestjs/common';
import { GithubAppService } from './github-app.service';
import { GithubWritebackService } from './github-writeback.service';

@Module({
  providers: [GithubAppService, GithubWritebackService],
  exports: [GithubAppService, GithubWritebackService],
})
export class GithubModule {}
