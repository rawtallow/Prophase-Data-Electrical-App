// Single source of truth for navigation, shared by the desktop top nav,
// the mobile bottom bar, and the mobile drawer — so role visibility and
// ordering stay consistent and there's one list to maintain.
//
// Flags per item:
//   desktopPrimary — shown as a top-level tab on desktop (vs. the "More" menu)
//   bottom         — shown in the mobile bottom bar
//   section        — grouping label used in the mobile drawer
//   show(role)     — role gate (mirrors the CAN matrix / middleware rules)

const fullAccess = (role) => role === 'admin' || role === 'manager';

export const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: 'home', desktopPrimary: true, bottom: true, section: 'Workspace', show: () => true },
  { href: '/quotes', label: 'Quotes', icon: 'quote', desktopPrimary: true, bottom: true, section: 'Workspace', show: () => true },
  { href: '/jobs', label: 'Job Log', short: 'Jobs', icon: 'jobs', desktopPrimary: true, bottom: true, section: 'Workspace', show: () => true },
  { href: '/clients', label: 'Clients', icon: 'clients', desktopPrimary: true, bottom: true, section: 'Workspace', show: () => true },
  { href: '/parts', label: 'Spare Parts', icon: 'parts', desktopPrimary: true, section: 'Workspace', show: () => true },
  { href: '/receipts', label: 'Receipts', icon: 'receipts', desktopPrimary: true, section: 'Workspace', show: () => true },
  { href: '/compliance', label: 'Compliance', icon: 'compliance', desktopPrimary: true, section: 'Workspace', show: () => true },
  { href: '/statistics', label: 'Statistics', icon: 'stats', section: 'Management', show: fullAccess },
  { href: '/payroll', label: 'Payroll', icon: 'payroll', section: 'Management', show: fullAccess },
  { href: '/maintenance', label: 'Maintenance', icon: 'maintenance', section: 'Management', show: fullAccess },
  { href: '/documents', label: 'Documents', icon: 'documents', section: 'Management', show: fullAccess },
  { href: '/users', label: 'Users', icon: 'users', section: 'Management', show: (role) => role === 'admin' },
  { href: '/backup', label: 'Backup', icon: 'backup', section: 'Management', show: fullAccess }
];

export function visibleItems(role) {
  return NAV_ITEMS.filter((i) => i.show(role));
}

// Marks a nav item active when the current path is within its section.
export function isActive(pathname, href) {
  if (href === '/dashboard') return pathname === '/dashboard';
  return pathname === href || pathname.startsWith(href + '/');
}

const PATHS = {
  home: ['M3 11.4 12 4l9 7.4', 'M5.5 10.2V20h13v-9.8', 'M9.7 20v-5.4h4.6V20'],
  quote: ['M6 3.2h9l3.8 3.8V20.8H6z', 'M15 3.2v4h4', 'M9 12h6', 'M9 15.5h6', 'M9 8.5h3'],
  jobs: ['M6 5.2h12v15.6H6z', 'M9 3.4h6v3.2H9z', 'M9 11h6', 'M9 14.5h4'],
  clients: ['M8.6 11.4a3.3 3.3 0 1 0 0-6.6 3.3 3.3 0 0 0 0 6.6Z', 'M2.8 20c0-3.4 2.6-5.6 5.8-5.6s5.8 2.2 5.8 5.6', 'M16 5.1a3.3 3.3 0 0 1 0 6.4', 'M17.4 14.7c2 .7 3.6 2.6 3.6 5.3'],
  parts: ['M12 3 4 7v10l8 4 8-4V7z', 'M4 7l8 4 8-4', 'M12 11v10'],
  receipts: ['M6 3h12v18l-2.2-1.4-2 1.4-2-1.4-2 1.4-2-1.4L6 21z', 'M9 8h6', 'M9 12h6'],
  compliance: ['M12 3.2 19 6v5.2c0 4.4-3 7.8-7 9.6-4-1.8-7-5.2-7-9.6V6z', 'M9 11.7l2.2 2.1L15 10'],
  stats: ['M4 20h16', 'M6.5 20v-8.5', 'M12 20V5.5', 'M17.5 20v-6'],
  payroll: ['M3 6.5h18v11H3z', 'M3 10.5h18', 'M16.5 14.4a1.1 1.1 0 1 0 0-2.2 1.1 1.1 0 0 0 0 2.2Z'],
  maintenance: ['M20.5 11.2A8.4 8.4 0 0 0 6.4 6.2L4 8.4', 'M4 4v4.6h4.6', 'M3.5 12.8a8.4 8.4 0 0 0 14.1 5l2.4-2.2', 'M20 20v-4.6h-4.6'],
  documents: ['M3.4 7.2a2 2 0 0 1 2-2h3.4l2 2H18.6a2 2 0 0 1 2 2v8.4a2 2 0 0 1-2 2H5.4a2 2 0 0 1-2-2z'],
  users: ['M12 11.6a3.6 3.6 0 1 0 0-7.2 3.6 3.6 0 0 0 0 7.2Z', 'M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6'],
  backup: ['M12 8.2c3.9 0 7-1.2 7-2.6S15.9 3 12 3 5 4.2 5 5.6 8.1 8.2 12 8.2Z', 'M5 5.6v6c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6v-6', 'M5 11.6v6c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6v-6'],
  menu: ['M4 7h16', 'M4 12h16', 'M4 17h16']
};

export function NavIcon({ name }) {
  const paths = PATHS[name] || PATHS.documents;
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths.map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}
