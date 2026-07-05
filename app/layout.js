import './globals.css';

export const metadata = {
  title: 'Prophase Data and Electrical — Portal',
  description: 'Quoting, job log, payroll, clients and spare parts.'
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
