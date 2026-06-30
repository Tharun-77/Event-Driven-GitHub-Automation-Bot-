import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'events';

/**
 * In-process pub/sub bridging the worker (which updates events) and the SSE
 * endpoint (which streams updates to the dashboard). Single-instance only,
 * which is fine for the free-tier deployment.
 */
@Injectable()
export class EventsEmitter {
  private readonly emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(0); // one listener per open SSE connection
  }

  emitChange(eventId: string): void {
    this.emitter.emit('change', eventId);
  }

  onChange(listener: (eventId: string) => void): () => void {
    this.emitter.on('change', listener);
    return () => {
      this.emitter.off('change', listener);
    };
  }
}
