'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { visibleItems, isActive, NavIcon } from './nav-items';

// Desktop top navigation: daily-use pages as direct tabs, back-office pages
// folded into a "More" dropdown. Hidden below 820px (the mobile bottom bar +
// drawer take over — see mobile-nav.js). Reads the shared nav config so it
// can't drift from the mobile nav.
export default function NavLinks({ role }) {
  const pathname = usePathname();
  const items = visibleItems(role);
  const primary = items.filter((i) => i.desktopPrimary);
  const more = items.filter((i) => !i.desktopPrimary);

  const [moreOpen, setMoreOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const moreActive = more.some((i) => isActive(pathname, i.href));

  function openMenu() {
    if (triggerRef.current) {
      const r = triggerRef.current.getBoundingClientRect();
      const left = Math.min(r.left, window.innerWidth - 210);
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
    function onKey(e) { if (e.key === 'Escape') setMoreOpen(false); }
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onKey);
    };
  }, [moreOpen]);

  useEffect(() => { setMoreOpen(false); }, [pathname]);

  return (
    <nav className="tabs desktop-only">
      {primary.map((i) => (
        <Link key={i.href} href={i.href} className={isActive(pathname, i.href) ? 'active' : ''}>
          <NavIcon name={i.icon} />{i.label}
        </Link>
      ))}
      {more.length > 0 && (
        <>
          <button
            ref={triggerRef}
            type="button"
            className={`tabs-more-trigger${moreActive ? ' active' : ''}`}
            onClick={() => (moreOpen ? setMoreOpen(false) : openMenu())}
            aria-expanded={moreOpen}
          >
            <NavIcon name="menu" />More <span className="tabs-more-caret" aria-hidden="true">▾</span>
          </button>
          {moreOpen && (
            <div className="tabs-more-menu" ref={menuRef} style={{ top: menuPos.top, left: menuPos.left }}>
              {more.map((i) => (
                <Link key={i.href} href={i.href} className={isActive(pathname, i.href) ? 'active' : ''}>
                  <NavIcon name={i.icon} />{i.label}
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </nav>
  );
}
