import { Module } from '@nestjs/common';
import { GithubModule } from '../github/github.module';
import { SlackModule } from '../slack/slack.module';
import { EventProcessor } from './event.processor';
import { EventWorker } from './event.worker';
import { QueueModule } from './queue.module';

@Module({
  imports: [QueueModule, GithubModule, SlackModule],
  providers: [EventProcessor, EventWorker],
  exports: [EventProcessor],
})
export class ProcessingModule {}
