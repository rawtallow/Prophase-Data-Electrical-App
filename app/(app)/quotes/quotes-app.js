'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

function money(n) {
  return '$' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function slug(s) { return String(s).toLowerCase().replace(/\s+/g, ''); }
function dstr(d) { return d ? String(d).slice(0, 10) : ''; }

export default function QuotesApp({ initialQuotes }) {
  const router = useRouter();
  const [quotes, setQuotes] = useState(initialQuotes);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');

  async function refresh() {
    const rows = await fetch('/api/quotes').then((r) => r.json());
    setQuotes(rows);
  }

  async function del(id) {
    if (!confirm('Delete this quote? This cannot be undone.')) return;
    await fetch(`/api/quotes/${id}`, { method: 'DELETE' });
    await refresh();
  }
  async function duplicate(id) {
    await fetch(`/api/quotes/${id}/duplicate`, { method: 'POST' });
    await refresh();
  }
  async function convert(id) {
    const res = await fetch(`/api/quotes/${id}/convert`, { method: 'POST' });
    if (res.ok) {
      router.push('/jobs');
      router.refresh();
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
            {list.map((q) => (
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
                    <button className="btn ghost sm" onClick={() => duplicate(q.id)}>Duplicate</button>
                    <button className="btn amber sm" onClick={() => convert(q.id)}>To Job</button>
                    <button className="btn danger sm" onClick={() => del(q.id)}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.length === 0 && <div className="empty">No quotes match your filters.</div>}
      </div>
    </>
  );
}
