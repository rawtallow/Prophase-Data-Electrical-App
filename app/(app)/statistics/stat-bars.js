// Renders a simple horizontal bar breakdown (e.g. jobs by status) — plain
// CSS, no charting library, sized relative to the largest count so the
// biggest category always fills the row.
export default function StatBars({ rows, formatValue }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div>
      {rows.map((r) => (
        <div className="stat-bar-row" key={r.label}>
          <div className="stat-bar-label">{r.label}</div>
          <div className="stat-bar-track">
            <div className="stat-bar-fill" style={{ width: `${(r.count / max) * 100}%` }} />
          </div>
          <div className="stat-bar-value">{formatValue ? formatValue(r) : r.count}</div>
        </div>
      ))}
      {rows.length === 0 && <div className="empty">No data for this financial year.</div>}
    </div>
  );
}
