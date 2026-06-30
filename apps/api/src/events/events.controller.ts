import {
  Controller,
  Get,
  MessageEvent,
  Query,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Observable } from 'rxjs';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtGuard } from '../auth/jwt.guard';
import { EventsEmitter } from './events.emitter';
import { EventsService } from './events.service';

@ApiTags('events')
@Controller('events')
@UseGuards(JwtGuard)
export class EventsController {
  constructor(
    private readonly events: EventsService,
    private readonly emitter: EventsEmitter,
  ) {}

  @Get()
  list(@CurrentUser() userId: string, @Query('repo') repo?: string) {
    return this.events.listForUser(userId, repo);
  }

  /**
   * Server-Sent Events stream. Emits a lightweight signal on every event status
   * change; the client refetches its (ownership-scoped) list in response.
   */
  @Sse('stream')
  stream(): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      subscriber.next({ data: { type: 'connected' } });
      const unsubscribe = this.emitter.onChange((eventId) => {
        subscriber.next({ data: { type: 'change', eventId } });
      });
      return () => unsubscribe();
    });
  }
}
