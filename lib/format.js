// Shared display helpers used across the client components. Consolidated
// here after the same date-input bug (a raw Date object breaking an
// `<input type="date">`'s value) had to be patched in four separate
// copy-pasted versions of dstr() — fixing it once, here, means it stays
// fixed everywhere that imports it instead of drifting again.

export function money(n) {
  return '$' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
}

// yyyy-mm-dd, suitable for populating an <input type="date"> value. Server-
// read `date` columns can arrive as native Date objects (parsed using local-
// time components by the DB driver); reading them back with local getters
// recovers the correct calendar day regardless of server timezone.
export function toDateInputValue(d) {
  if (!d) return '';
  if (d instanceof Date) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  return String(d).slice(0, 10);
}

// Human-readable display date, e.g. "Jul 1, 2026".
export function toDisplayDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Converts the named fields of a DB row from raw Date objects to yyyy-mm-dd
// strings before the row crosses NextResponse.json(): JSON.stringify() calls
// Date.prototype.toJSON() (UTC-based) on any Date it finds, which can shift
// the calendar day by one depending on the server process's timezone.
export function serializeDates(row, fields) {
  if (!row) return row;
  const out = { ...row };
  for (const f of fields) out[f] = toDateInputValue(row[f]);
  return out;
}
