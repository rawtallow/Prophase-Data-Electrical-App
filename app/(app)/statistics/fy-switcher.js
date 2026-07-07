import Link from 'next/link';
import { fyLabel } from '../../../lib/financial-year';

// Server-renderable — just changes the ?fy= query param on the current
// page, so it works identically on every statistics subpage without
// needing client state.
export default function FySwitcher({ pathname, years, current }) {
  return (
    <div className="filters" style={{ marginBottom: 18 }}>
      {years.map((y) => (
        <Link
          key={y}
          href={`${pathname}?fy=${y}`}
          className={`btn sm ${y === current ? 'amber' : 'ghost'}`}
        >
          {fyLabel(y)}
        </Link>
      ))}
    </div>
  );
}
