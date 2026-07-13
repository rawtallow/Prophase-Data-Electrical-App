import './globals.css';

export const metadata = {
  title: 'Prophase Data and Electrical — Portal',
  description: 'Quoting, job log, payroll, clients and spare parts.'
};

// viewport-fit=cover lets the fixed bottom nav and bottom-sheet modals extend
// into the iPhone home-indicator area, where env(safe-area-inset-*) padding
// keeps content clear. maximumScale isn't pinned so users can still zoom.
export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#ffffff'
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
