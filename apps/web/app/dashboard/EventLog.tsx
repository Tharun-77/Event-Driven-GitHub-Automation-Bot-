'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { useEventStream } from '@/lib/useEventStream';

interface ActionLog {
  id: string;
  type: string;
  status: string;
  detail: Record<string, unknown>;
  createdAt: string;
}

interface AiTriage {
  summary?: string;
  suggestedLabel?: string;
  priority?: string;
}

interface EventRow {
  id: string;
  eventType: string;
  action: string | null;
  payloadSummary: { title?: string; number?: number } | null;
  status: string;
  attempts: number;
  aiTriage: AiTriage | null;
  error: string | null;
  receivedAt: string;
  actionLogs: ActionLog[];
}

const STATUS_COLOR: Record<string, string> = {
  done: 'var(--green)',
  failed: 'var(--yellow)',
  dead_letter: 'var(--red)',
  processing: 'var(--accent)',
  pending: 'var(--muted)',
};

function StatusBadge({ status }: { status: string }): React.JSX.Element {
  return (
    <span style={{ color: STATUS_COLOR[status] ?? 'var(--muted)', fontWeight: 600 }}>
      {status}
    </span>
  );
}

export function EventLog({ repoId }: { repoId: string | null }): React.JSX.Element {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await apiFetch(
      '/events' + (repoId ? `?repo=${encodeURIComponent(repoId)}` : ''),
    );
    if (res.ok) {
      setEvents((await res.json()) as EventRow[]);
    }
  }, [repoId]);

  useEffect(() => {
    void load();
  }, [load]);
  useEventStream(repoId, load);

  if (events.length === 0) {
    return (
      <p className="muted">
        No events yet. Open an issue or pull request on the connected repository
        to see the bot react.
      </p>
    );
  }

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr style={{ textAlign: 'left', color: 'var(--muted)', fontSize: 13 }}>
          <th style={{ padding: '0.5rem 0.5rem' }}>Event</th>
          <th>Status</th>
          <th>Attempts</th>
          <th>When</th>
        </tr>
      </thead>
      <tbody>
        {events.map((e) => (
          <EventRowView
            key={e.id}
            event={e}
            open={expanded === e.id}
            onToggle={() =>
              setExpanded((cur) => (cur === e.id ? null : e.id))
            }
          />
        ))}
      </tbody>
    </table>
  );
}

function EventRowView({
  event,
  open,
  onToggle,
}: {
  event: EventRow;
  open: boolean;
  onToggle: () => void;
}): React.JSX.Element {
  const title =
    event.payloadSummary?.title ??
    (event.payloadSummary?.number
      ? `#${event.payloadSummary.number}`
      : event.eventType);

  return (
    <>
      <tr
        onClick={onToggle}
        style={{ cursor: 'pointer', borderTop: '1px solid var(--border)' }}
      >
        <td style={{ padding: '0.6rem 0.5rem' }}>
          <code style={{ color: 'var(--accent)' }}>{event.eventType}</code>
          {event.action ? ` · ${event.action}` : ''}
          <div className="muted" style={{ fontSize: 13 }}>
            {title}
          </div>
        </td>
        <td>
          <StatusBadge status={event.status} />
        </td>
        <td>{event.attempts}</td>
        <td className="muted" style={{ fontSize: 13 }}>
          {new Date(event.receivedAt).toLocaleString()}
        </td>
      </tr>
      {open ? (
        <tr>
          <td colSpan={4} style={{ padding: '0 0.5rem 0.8rem' }}>
            {event.aiTriage ? (
              <div className="muted" style={{ marginBottom: '0.5rem' }}>
                <strong>AI triage:</strong> {event.aiTriage.summary} (label:{' '}
                {event.aiTriage.suggestedLabel}, priority:{' '}
                {event.aiTriage.priority})
              </div>
            ) : null}
            {event.error ? (
              <div style={{ color: 'var(--red)', marginBottom: '0.5rem' }}>
                Error: {event.error}
              </div>
            ) : null}
            {event.actionLogs.length === 0 ? (
              <span className="muted">No actions taken.</span>
            ) : (
              <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
                {event.actionLogs.map((a) => (
                  <li key={a.id}>
                    <code>{a.type}</code> &mdash;{' '}
                    <span
                      style={{
                        color:
                          a.status === 'success'
                            ? 'var(--green)'
                            : 'var(--red)',
                      }}
                    >
                      {a.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </td>
        </tr>
      ) : null}
    </>
  );
}
