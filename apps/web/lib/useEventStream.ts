import { useEffect, useRef } from 'react';
import { apiUrl } from './api';

/**
 * Subscribes to the API's SSE stream and invokes `onChange` whenever the server
 * signals an event update. The callback is kept in a ref so the EventSource is
 * only re-created when `repoId` changes, not on every render.
 */
export function useEventStream(
  repoId: string | null,
  onChange: () => void,
): void {
  const callbackRef = useRef(onChange);
  callbackRef.current = onChange;

  useEffect(() => {
    const url = apiUrl(
      '/events/stream' + (repoId ? `?repo=${encodeURIComponent(repoId)}` : ''),
    );
    const source = new EventSource(url, { withCredentials: true });
    source.onmessage = () => callbackRef.current();
    // EventSource reconnects automatically on transient errors.
    return () => source.close();
  }, [repoId]);
}
