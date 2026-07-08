'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

// Everyone with any access to these sees them daily, so they stay as
// direct top-level tabs. The back-office/admin-only pages (below) get
// folded into a "More" dropdown instead — with those included, the bar
// was 13-14 items wide and wrapped/scrolled awkwardly, especially for
// admin/manager who see everything.
const PRIMARY_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', show: () => true },
  { href: '/quotes', label: 'Quotes', show: () => true },
  { href: '/jobs', label: 'Job Log', show: () => true },
  { href: '/parts', label: 'Spare Parts', show: () => true },
  { href: '/clients', label: 'Clients', show: () => true },
  { href: '/receipts', label: 'Receipts', show: () => true },
  { href: '/compliance', label: 'Compliance', show: () => true }
];

const MORE_ITEMS = [
  { href: '/statistics', label: 'Statistics', show: (fullAccess) => fullAccess },
  { href: '/payroll', label: 'Payroll', show: (fullAccess) => fullAccess },
  { href: '/maintenance', label: 'Maintenance', show: (fullAccess) => fullAccess },
  { href: '/documents', label: 'Documents', show: (fullAccess) => fullAccess },
  { href: '/users', label: 'Users', show: (_fullAccess, role) => role === 'admin' },
  { href: '/backup', label: 'Backup', show: (fullAccess) => fullAccess }
];

export default function NavLinks({ role }) {
  const pathname = usePathname();
  const fullAccess = role === 'admin' || role === 'manager';
  const [moreOpen, setMoreOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const triggerRef = useRef(null);
  const menuRef = useRef(null);

  const primaryItems = PRIMARY_ITEMS.filter((i) => i.show(fullAccess, role));
  const moreItems = MORE_ITEMS.filter((i) => i.show(fullAccess, role));
  const moreActive = moreItems.some((i) => pathname.startsWith(i.href));

  // Positioned via getBoundingClientRect + `position: fixed` rather than a
  // simple `position: absolute` dropdown, since `.tabs` has overflow-x:auto
  // for mobile scrolling — which also clips absolutely-positioned children
  // vertically. Fixed positioning escapes that clipping entirely.
  function openMenu() {
    if (triggerRef.current) {
      const r = triggerRef.current.getBoundingClientRect();
      const left = Math.min(r.left, window.innerWidth - 200);
      setMenuPos({ top: r.bottom + 4, left: Math.max(left, 8) });
    }
    setMoreOpen(true);
  }

  useEffect(() => {
    if (!moreOpen) return;
    function onClickOutside(e) {
      if (triggerRef.current?.contains(e.target)) return;
      if (menuRef.current?.contains(e.target)) return;
      setMoreOpen(false);
    }
    function onKey(e) {
      if (e.key === 'Escape') setMoreOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onKey);
    };
  }, [moreOpen]);

  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  return (
    <nav className="tabs">
      {primaryItems.map((i) => (
        <Link key={i.href} href={i.href} className={pathname.startsWith(i.href) ? 'active' : ''}>
          {i.label}
        </Link>
      ))}
      {moreItems.length > 0 && (
        <>
          <button
            ref={triggerRef}
            type="button"
            className={`tabs-more-trigger${moreActive ? ' active' : ''}`}
            onClick={() => (moreOpen ? setMoreOpen(false) : openMenu())}
            aria-expanded={moreOpen}
          >
            More {moreOpen ? '▴' : '▾'}
          </button>
          {moreOpen && (
            <div className="tabs-more-menu" ref={menuRef} style={{ top: menuPos.top, left: menuPos.left }}>
              {moreItems.map((i) => (
                <Link key={i.href} href={i.href} className={pathname.startsWith(i.href) ? 'active' : ''}>
                  {i.label}
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </nav>
  );
}
