'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  return (
    <button onClick={logout} disabled={busy} className="btn ghost sm">
      {busy ? 'Signing out…' : 'Sign out'}
    </button>
  );
}
