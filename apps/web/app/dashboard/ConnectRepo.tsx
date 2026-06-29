'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/api';

export function ConnectRepo(): React.JSX.Element {
  const [busy, setBusy] = useState(false);

  async function connect(): Promise<void> {
    setBusy(true);
    try {
      const res = await apiFetch('/repositories/install-url');
      if (res.ok) {
        const { url } = (await res.json()) as { url: string };
        window.location.href = url;
      } else {
        setBusy(false);
      }
    } catch {
      setBusy(false);
    }
  }

  return (
    <button className="btn" onClick={connect} disabled={busy}>
      {busy ? 'Redirecting…' : 'Connect repository'}
    </button>
  );
}
