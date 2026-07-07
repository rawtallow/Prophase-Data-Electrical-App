'use client';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

const TABS = [
  { href: '/statistics', label: 'Overview' },
  { href: '/statistics/jobs', label: 'Jobs' },
  { href: '/statistics/quotes', label: 'Quotes' },
  { href: '/statistics/payroll', label: 'Payroll' },
  { href: '/statistics/revenue', label: 'Revenue' }
];

export default function StatisticsNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const fy = searchParams.get('fy');
  const suffix = fy ? `?fy=${fy}` : '';

  return (
    <nav className="subtabs">
      {TABS.map((t) => (
        <Link key={t.href} href={`${t.href}${suffix}`} className={pathname === t.href ? 'active' : ''}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
