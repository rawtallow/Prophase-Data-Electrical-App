'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function NavLinks({ role }) {
  const pathname = usePathname();
  const fullAccess = role === 'admin' || role === 'manager';

  const items = [
    { href: '/dashboard', label: 'Dashboard', show: true },
    { href: '/quotes/new', label: 'New Quote', show: fullAccess },
    { href: '/quotes', label: 'Quotes', show: fullAccess },
    { href: '/jobs', label: 'Job Log', show: true },
    { href: '/payroll', label: 'Payroll', show: fullAccess },
    { href: '/parts', label: 'Spare Parts', show: true },
    { href: '/clients', label: 'Clients', show: true },
    { href: '/receipts', label: 'Receipts', show: true },
    { href: '/users', label: 'Users', show: role === 'admin' },
    { href: '/backup', label: 'Backup', show: fullAccess }
  ];

  return (
    <nav className="tabs">
      {items
        .filter((i) => i.show)
        .map((i) => (
          <Link key={i.href} href={i.href} className={pathname.startsWith(i.href) ? 'active' : ''}>
            {i.label}
          </Link>
        ))}
    </nav>
  );
}
