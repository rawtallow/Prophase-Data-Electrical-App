import { Inter } from 'next/font/google';
import './globals.css';

// globals.css asked for Inter but nothing ever loaded it, so the whole app
// silently fell back to the OS UI font (San Francisco / Segoe UI) — the
// tighter letterforms and tabular figures the layout was tuned for never
// actually rendered. next/font self-hosts the file at build time, so this
// adds no external request (the CSP's font-src 'self' still holds) and no
// flash of unstyled text. The variable weight axis covers 400–800, which is
// the full range globals.css uses.
const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter'
});

export const metadata = {
  title: 'PROPHASE Data and Electrical — Portal',
  description: 'Quoting, job log, payroll, clients and spare parts.'
};

// viewport-fit=cover lets the fixed bottom nav and bottom-sheet modals extend
// into the iPhone home-indicator area, where env(safe-area-inset-*) padding
// keeps content clear. maximumScale isn't pinned so users can still zoom.
export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0c0c0c'
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
