'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { ConnectRepo } from './ConnectRepo';
import { EventLog } from './EventLog';
import { Repo, RepoSwitcher } from './RepoSwitcher';

interface Me {
  id: string;
  login: string;
  avatarUrl: string | null;
}

export default function DashboardPage(): React.JSX.Element | null {
  const router = useRouter();
  const [user, setUser] = useState<Me | null>(null);
  const [repos, setRepos] = useState<Repo[]>([]);
  const [activeRepoId, setActiveRepoId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        // Independent requests -> fire in parallel (async-parallel).
        const [meRes, reposRes] = await Promise.all([
          apiFetch('/auth/me'),
          apiFetch('/repositories'),
        ]);
        if (!meRes.ok) {
          router.replace('/');
          return;
        }
        const me = (await meRes.json()) as Me;
        const repoList = reposRes.ok ? ((await reposRes.json()) as Repo[]) : [];
        if (!active) {
          return;
        }
        setUser(me);
        setRepos(repoList);
        const fromUrl = new URLSearchParams(window.location.search).get('repo');
        setActiveRepoId(
          fromUrl && repoList.some((r) => r.id === fromUrl)
            ? fromUrl
            : (repoList[0]?.id ?? null),
        );
        setLoading(false);
      } catch {
        router.replace('/');
      }
    })();
    return () => {
      active = false;
    };
  }, [router]);

  function selectRepo(id: string): void {
    setActiveRepoId(id);
    const params = new URLSearchParams(window.location.search);
    params.set('repo', id);
    window.history.replaceState(null, '', `?${params.toString()}`);
  }

  if (loading) {
    return (
      <main>
        <p className="muted">Loading&hellip;</p>
      </main>
    );
  }
  if (!user) {
    return null;
  }

  const activeRepo = repos.find((r) => r.id === activeRepoId) ?? null;

  return (
    <main>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '1.5rem',
        }}
      >
        <h1 style={{ margin: 0 }}>Dashboard</h1>
        <span className="muted">
          Signed in as <strong>{user.login}</strong>
        </span>
      </header>

      <div
        style={{
          display: 'flex',
          gap: '0.75rem',
          alignItems: 'center',
          marginBottom: '1.5rem',
        }}
      >
        <RepoSwitcher
          repos={repos}
          value={activeRepoId}
          onChange={selectRepo}
        />
        <ConnectRepo />
      </div>

      <section className="panel">
        {repos.length === 0 ? (
          <p className="muted">
            No repositories connected yet. Click &ldquo;Connect
            repository&rdquo; to install the GitHub App on a repo you own.
          </p>
        ) : (
          <>
            <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>
              Event log
              {activeRepo ? (
                <span className="muted"> &mdash; {activeRepo.fullName}</span>
              ) : null}
            </h2>
            <EventLog repoId={activeRepoId} />
          </>
        )}
      </section>
    </main>
  );
}
