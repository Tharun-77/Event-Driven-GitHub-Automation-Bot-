'use client';

export interface Repo {
  id: string;
  fullName: string;
  active: boolean;
  githubRepoId: string;
}

export function RepoSwitcher({
  repos,
  value,
  onChange,
}: {
  repos: Repo[];
  value: string | null;
  onChange: (id: string) => void;
}): React.JSX.Element | null {
  if (repos.length === 0) {
    return null;
  }
  return (
    <select
      aria-label="Active repository"
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      style={{
        background: 'var(--panel)',
        color: 'var(--text)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: '0.5rem 0.75rem',
      }}
    >
      {repos.map((r) => (
        <option key={r.id} value={r.id}>
          {r.fullName}
          {r.active ? '' : ' (paused)'}
        </option>
      ))}
    </select>
  );
}
