import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { GithubModule } from '../github/github.module';
import { SlackModule } from '../slack/slack.module';
import { EventProcessor } from './event.processor';
import { EventWorker } from './event.worker';
import { QueueModule } from './queue.module';

@Module({
  imports: [QueueModule, GithubModule, SlackModule, AiModule],
  providers: [EventProcessor, EventWorker],
  exports: [EventProcessor],
})
export class ProcessingModule {}
