'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';

interface Me {
  id: string;
  login: string;
  avatarUrl: string | null;
}

export default function DashboardPage(): React.JSX.Element | null {
  const router = useRouter();
  const [user, setUser] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    apiFetch('/auth/me')
      .then(async (res) => {
        if (!res.ok) {
          router.replace('/');
          return;
        }
        const data = (await res.json()) as Me;
        if (active) {
          setUser(data);
          setLoading(false);
        }
      })
      .catch(() => router.replace('/'));
    return () => {
      active = false;
    };
  }, [router]);

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
      <section className="panel">
        <p className="muted">
          Connect a repository and your event log will appear here.
        </p>
      </section>
    </main>
  );
}
