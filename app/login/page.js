'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Login failed.');
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
      <div className="auth-card">
        <div className="brand">
          <div className="bolt">&#9889;</div>
          <div>
            <h1 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#0a0a0a', textAlign: 'left' }}>
              Prophase
            </h1>
          </div>
        </div>
        <h1>Sign in to the portal</h1>
        {error && <div className="error-box">{error}</div>}
        <form onSubmit={submit}>
          <div className="field">
            <label>Email</label>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
          </div>
          <div className="field">
            <label>Password</label>
            <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <button className="btn amber" type="submit" disabled={busy} style={{ width: '100%', justifyContent: 'center' }}>
            {busy ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
        <p className="small-note" style={{ textAlign: 'center', marginTop: 16 }}>
          First time setting this up? <a href="/setup">Create the admin account</a>.
        </p>
      </div>
    </div>
  );
}
