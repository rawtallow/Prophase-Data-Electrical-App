'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast, confirmDialog } from '../ui-feedback';
import { money, slug, toDateInputValue as dstr } from '../../../lib/format';

export default function QuotesApp({ initialQuotes }) {
  const router = useRouter();
  const [quotes, setQuotes] = useState(initialQuotes);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState(null);

  async function refresh() {
    const rows = await fetch('/api/quotes').then((r) => r.json());
    setQuotes(rows);
  }

  async function del(id) {
    const ok = await confirmDialog('Delete this quote? This cannot be undone.', {
      title: 'Delete quote',
      confirmLabel: 'Delete Quote',
      danger: true
    });
    if (!ok) return;
    setBusyId(id);
    try {
      await fetch(`/api/quotes/${id}`, { method: 'DELETE' });
      toast.success('Quote deleted');
      await refresh();
    } finally {
      setBusyId(null);
    }
  }
  async function duplicate(id) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/quotes/${id}/duplicate`, { method: 'POST' });
      if (res.ok) {
        toast.success('Quote duplicated');
        await refresh();
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || 'Could not duplicate quote');
      }
    } finally {
      setBusyId(null);
    }
  }
  async function convert(id) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/quotes/${id}/convert`, { method: 'POST' });
      if (res.ok) {
        toast.success('Converted to a job');
        router.push('/jobs');
        router.refresh();
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || 'Could not convert to job');
      }
    } finally {
      setBusyId(null);
    }
  }

  const list = quotes.filter((q) => {
    if (statusFilter && q.status !== statusFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      if (!q.client_name.toLowerCase().includes(s) && !q.quote_number.toLowerCase().includes(s)) return false;
    }
    return true;
  });

  return (
    <>
      <div className="toolbar">
        <h2 className="section-title" style={{ margin: 0 }}>Quotes</h2>
        <div className="filters">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All Statuses</option>
            {['Draft', 'Sent', 'Accepted', 'Declined'].map((s) => <option key={s}>{s}</option>)}
          </select>
          <input placeholder="Search customer or #" value={search} onChange={(e) => setSearch(e.target.value)} />
          <a className="btn amber sm" href="/quotes/new">+ New Quote</a>
        </div>
      </div>
      <div className="panel">
        <table>
          <thead><tr><th>Quote #</th><th>Customer</th><th>Date</th><th>Status</th><th className="num">Total</th><th>Actions</th></tr></thead>
          <tbody>
            {list.map((q) => {
              const busy = busyId === q.id;
              return (
                <tr key={q.id}>
                  <td>{q.quote_number}</td>
                  <td>{q.client_name}</td>
                  <td>{dstr(q.date)}</td>
                  <td><span className={`badge ${slug(q.status)}`}>{q.status}</span></td>
                  <td className="num">{money(q.total)}</td>
                  <td>
                    <div className="row-actions">
                      <a className="btn ghost sm" href={`/quotes/${q.id}/edit`}>Edit</a>
                      <a className="btn ghost sm" href={`/quotes/${q.id}/print`} target="_blank" rel="noreferrer">Print</a>
                      <button className="btn ghost sm" disabled={busy} onClick={() => duplicate(q.id)}>Duplicate</button>
                      <button className="btn amber sm" disabled={busy} onClick={() => convert(q.id)}>To Job</button>
                      <button className="btn danger sm" disabled={busy} onClick={() => del(q.id)}>{busy ? '…' : 'Delete'}</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {list.length === 0 && <div className="empty">No quotes match your filters.</div>}
      </div>
    </>
  );
}
