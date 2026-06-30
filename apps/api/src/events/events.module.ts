import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EventsController } from './events.controller';
import { EventsEmitter } from './events.emitter';
import { EventsService } from './events.service';

// Global so the worker (ProcessingModule) can inject EventsEmitter without a
// cross-module import cycle.
@Global()
@Module({
  imports: [AuthModule],
  controllers: [EventsController],
  providers: [EventsService, EventsEmitter],
  exports: [EventsEmitter],
})
export class EventsModule {}
