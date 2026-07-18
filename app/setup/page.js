'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function SetupPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Setup failed.');
        setBusy(false);
        return;
      }
      router.push('/dashboard');
      router.refresh();
    } catch {
      setError('Could not reach the server. Try again.');
      setBusy(false);
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-card" style={{ maxWidth: 420 }}>
        <div className="brand">
          <div className="bolt">&#9889;</div>
        </div>
        <h1>Create the first Admin account</h1>
        <p className="small-note" style={{ marginTop: -12, marginBottom: 16 }}>
          This only works once, while no accounts exist yet. This account will have full
          access, including creating Manager and Employee logins afterward from Users.
        </p>
        {error && <div className="error-box">{error}</div>}
        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="setup-name">Your Name</label>
            <input id="setup-name" required value={name} onChange={(e) => setName(e.target.value)} autoFocus autoComplete="name" />
          </div>
          <div className="field">
            <label htmlFor="setup-email">Email</label>
            <input
              id="setup-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck="false"
              inputMode="email"
            />
          </div>
          <div className="field">
            <label htmlFor="setup-password">Password (min. 8 characters)</label>
            <input
              id="setup-password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <button className="btn amber" type="submit" disabled={busy} style={{ width: '100%', justifyContent: 'center' }}>
            {busy ? 'Creating…' : 'Create Admin Account'}
          </button>
        </form>
      </div>
    </div>
  );
}
