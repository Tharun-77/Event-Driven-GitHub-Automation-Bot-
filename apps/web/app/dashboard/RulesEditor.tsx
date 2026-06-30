'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { RuleForm } from './RuleForm';

interface RuleActions {
  addLabel?: boolean;
  labelName?: string;
  postComment?: boolean;
  commentBody?: string;
  slackNotify?: boolean;
}

interface Rule {
  id: string;
  name: string;
  eventType: string;
  matchField: string;
  matchOp: string;
  matchValue: string;
  enabled: boolean;
  actions: RuleActions;
}

function describeActions(a: RuleActions): string {
  const parts: string[] = [];
  if (a.addLabel) parts.push(`label "${a.labelName ?? ''}"`);
  if (a.postComment) parts.push('comment');
  if (a.slackNotify) parts.push('Slack');
  return parts.join(' + ') || 'nothing';
}

export function RulesEditor({ repoId }: { repoId: string }): React.JSX.Element {
  const [rules, setRules] = useState<Rule[]>([]);

  const load = useCallback(async () => {
    const res = await apiFetch(`/repositories/${repoId}/rules`);
    if (res.ok) {
      setRules((await res.json()) as Rule[]);
    }
  }, [repoId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggle(rule: Rule): Promise<void> {
    await apiFetch(`/repositories/${repoId}/rules/${rule.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !rule.enabled }),
    });
    void load();
  }

  async function remove(rule: Rule): Promise<void> {
    await apiFetch(`/repositories/${repoId}/rules/${rule.id}`, {
      method: 'DELETE',
    });
    void load();
  }

  return (
    <div>
      {rules.length === 0 ? (
        <p className="muted">No rules yet. Add one below.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {rules.map((r) => (
            <li
              key={r.id}
              style={{
                borderTop: '1px solid var(--border)',
                padding: '0.6rem 0',
                opacity: r.enabled ? 1 : 0.55,
              }}
            >
              <strong>{r.name}</strong>{' '}
              <span className="muted" style={{ fontSize: 13 }}>
                WHEN {r.eventType} {r.matchField} {r.matchOp} &ldquo;
                {r.matchValue}&rdquo; THEN {describeActions(r.actions)}
              </span>
              <div style={{ marginTop: 4, display: 'flex', gap: '0.5rem' }}>
                <button onClick={() => toggle(r)}>
                  {r.enabled ? 'Disable' : 'Enable'}
                </button>
                <button onClick={() => remove(r)}>Delete</button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <RuleForm repoId={repoId} onCreated={load} />
    </div>
  );
}
