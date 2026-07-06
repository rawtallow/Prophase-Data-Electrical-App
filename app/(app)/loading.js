// Next.js shows this automatically the instant a nav link is clicked, while
// the target page's Server Component is still fetching its data — without
// it, the old page just sits frozen for the round trip, which is what reads
// as "laggy" even after the actual query time is cut down.
export default function Loading() {
  return (
    <div aria-hidden="true">
      <div className="cards">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card">
            <div className="skeleton-line skeleton-line-sm" />
            <div className="skeleton-line skeleton-line-lg" />
          </div>
        ))}
      </div>
      <div className="panel">
        <div className="skeleton-line skeleton-line-md" style={{ marginBottom: 18 }} />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="skeleton-row" />
        ))}
      </div>
    </div>
  );
}
