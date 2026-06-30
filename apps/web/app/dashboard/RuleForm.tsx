'use client';

import { FormEvent, useState } from 'react';
import { apiFetch } from '@/lib/api';

const inputStyle: React.CSSProperties = {
  background: 'var(--bg)',
  color: 'var(--text)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  padding: '0.4rem 0.5rem',
};

export function RuleForm({
  repoId,
  onCreated,
}: {
  repoId: string;
  onCreated: () => void;
}): React.JSX.Element {
  const [name, setName] = useState('');
  const [eventType, setEventType] = useState('issues');
  const [matchField, setMatchField] = useState('title');
  const [matchOp, setMatchOp] = useState('contains');
  const [matchValue, setMatchValue] = useState('');
  const [addLabel, setAddLabel] = useState(true);
  const [labelName, setLabelName] = useState('bug');
  const [postComment, setPostComment] = useState(false);
  const [commentBody, setCommentBody] = useState('');
  const [slackNotify, setSlackNotify] = useState(true);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    const res = await apiFetch(`/repositories/${repoId}/rules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        eventType,
        matchField,
        matchOp,
        matchValue,
        actions: {
          addLabel,
          labelName,
          postComment,
          commentBody,
          slackNotify,
        },
      }),
    });
    setBusy(false);
    if (res.ok) {
      setName('');
      setMatchValue('');
      onCreated();
    }
  }

  return (
    <form
      onSubmit={submit}
      style={{
        marginTop: '1rem',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '0.5rem',
        alignItems: 'center',
      }}
    >
      <input
        required
        placeholder="Rule name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        style={inputStyle}
      />
      <span className="muted">WHEN</span>
      <select
        value={eventType}
        onChange={(e) => setEventType(e.target.value)}
        style={inputStyle}
      >
        <option value="issues">issues</option>
        <option value="pull_request">pull_request</option>
        <option value="push">push</option>
      </select>
      <select
        value={matchField}
        onChange={(e) => setMatchField(e.target.value)}
        style={inputStyle}
      >
        <option value="title">title</option>
        <option value="body">body</option>
        <option value="author">author</option>
        <option value="label">label</option>
      </select>
      <select
        value={matchOp}
        onChange={(e) => setMatchOp(e.target.value)}
        style={inputStyle}
      >
        <option value="contains">contains</option>
        <option value="equals">equals</option>
      </select>
      <input
        required
        placeholder="value"
        value={matchValue}
        onChange={(e) => setMatchValue(e.target.value)}
        style={inputStyle}
      />
      <span className="muted">THEN</span>
      <label>
        <input
          type="checkbox"
          checked={addLabel}
          onChange={(e) => setAddLabel(e.target.checked)}
        />{' '}
        label
      </label>
      <input
        placeholder="label name"
        value={labelName}
        onChange={(e) => setLabelName(e.target.value)}
        style={{ ...inputStyle, width: 110 }}
      />
      <label>
        <input
          type="checkbox"
          checked={postComment}
          onChange={(e) => setPostComment(e.target.checked)}
        />{' '}
        comment
      </label>
      <input
        placeholder="comment body"
        value={commentBody}
        onChange={(e) => setCommentBody(e.target.value)}
        style={{ ...inputStyle, width: 150 }}
      />
      <label>
        <input
          type="checkbox"
          checked={slackNotify}
          onChange={(e) => setSlackNotify(e.target.checked)}
        />{' '}
        Slack
      </label>
      <button className="btn" type="submit" disabled={busy}>
        {busy ? 'Adding…' : 'Add rule'}
      </button>
    </form>
  );
}
