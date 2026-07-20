'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { visibleItems, isActive, NavIcon } from './nav-items';

// Mobile navigation (shown < 820px): a fixed bottom bar with the four most-
// used destinations plus a "Menu" button that opens a full drawer listing
// every permitted page, grouped by section. Reads the shared nav config so
// it stays in lockstep with the desktop nav.
export default function MobileNav({ role, badges = {} }) {
  const pathname = usePathname();
  const items = visibleItems(role);
  const bottom = items.filter((i) => i.bottom);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Close on navigation.
  useEffect(() => { setDrawerOpen(false); }, [pathname]);

  // Lock body scroll + close on Escape while the drawer is open.
  useEffect(() => {
    if (!drawerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function onKey(e) { if (e.key === 'Escape') setDrawerOpen(false); }
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
    };
  }, [drawerOpen]);

  const sections = [];
  for (const item of items) {
    let s = sections.find((x) => x.label === item.section);
    if (!s) { s = { label: item.section, items: [] }; sections.push(s); }
    s.items.push(item);
  }

  const drawerActive = drawerOpen || !bottom.some((i) => isActive(pathname, i.href));

  return (
    <>
      <nav className="bottom-nav mobile-only">
        {bottom.map((i) => (
          <Link key={i.href} href={i.href} className={`bn-item${isActive(pathname, i.href) ? ' active' : ''}`}>
            <span className="bn-icon-wrap">
              <NavIcon name={i.icon} />
              {badges[i.href] > 0 && <span className="nav-badge">{badges[i.href]}</span>}
            </span>
            {i.short || i.label}
          </Link>
        ))}
        <button
          type="button"
          className={`bn-item${drawerOpen ? ' active' : ''}`}
          onClick={() => setDrawerOpen(true)}
          aria-expanded={drawerOpen}
        >
          <NavIcon name="menu" />
          Menu
        </button>
      </nav>

      {drawerOpen && (
        <>
          <div className="drawer-backdrop mobile-only" onClick={() => setDrawerOpen(false)} />
          <aside className="nav-drawer mobile-only" role="dialog" aria-label="Menu">
            <div className="drawer-head">
              <div className="brand">
                <div className="bolt">&#9889;</div>
                <div className="brand-text">
                  <h1>Prophase Data and Electrical</h1>
                  <div className="sub">Hub</div>
                </div>
              </div>
              <button className="drawer-close" onClick={() => setDrawerOpen(false)} aria-label="Close menu">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            </div>
            {sections.map((s) => (
              <div className="drawer-section" key={s.label}>
                <div className="lbl">{s.label}</div>
                {s.items.map((i) => (
                  <Link key={i.href} href={i.href} className={`drawer-link${isActive(pathname, i.href) ? ' active' : ''}`}>
                    <NavIcon name={i.icon} />
                    {i.label}
                    {badges[i.href] > 0 && <span className="nav-badge">{badges[i.href]}</span>}
                  </Link>
                ))}
              </div>
            ))}
          </aside>
        </>
      )}
    </>
  );
}
