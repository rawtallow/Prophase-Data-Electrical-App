'use client';
import { useEffect, useRef, useState } from 'react';
import ChangePasswordButton from './change-password-button';
import LogoutButton from './logout-button';

function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Unified account control shown top-right on every screen: an avatar (plus
// name/role on desktop) that opens a dropdown with the role badge, Change
// Password, and Sign out. Replaces the old row of loose header buttons that
// wrapped awkwardly on phones.
export default function AccountArea({ name, role }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e) { if (!ref.current?.contains(e.target)) setOpen(false); }
    function onKey(e) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="account" ref={ref}>
      <button type="button" className="account-trigger" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="account-avatar">{initials(name)}</span>
        <span className="who">
          <span className="nm">{name}</span>
          <span className="rl">{role}</span>
        </span>
        <span className="account-caret">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className="account-menu">
          <div className="am-head">
            <div className="nm">{name}</div>
            <div className="rl"><span className={`badge ${role}`}>{role}</span></div>
          </div>
          <ChangePasswordButton />
          <LogoutButton />
        </div>
      )}
    </div>
  );
}
