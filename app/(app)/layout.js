import { getSession, CAN } from '../../lib/auth';
import { redirect } from 'next/navigation';
import NavLinks from './nav-links';
import LogoutButton from './logout-button';
import ChangePasswordButton from './change-password-button';
import { FeedbackHost } from './ui-feedback';
import PageTransition from './page-transition';

export default async function AppLayout({ children }) {
  const session = await getSession();
  if (!session) redirect('/login');

  return (
    <>
      <header className="app-header">
        <div className="brand">
          <div className="bolt">&#9889;</div>
          <div>
            <h1>Prophase Data and Electrical</h1>
            <div className="sub">Quoting, Jobs, Payroll &amp; Inventory</div>
          </div>
        </div>
        <div className="whoami">
          {session.name}
          <span className={`role-badge badge ${session.role}`}>{session.role}</span>
          <ChangePasswordButton />
          <LogoutButton />
        </div>
      </header>
      <NavLinks role={session.role} />
      <main className="container">
        <PageTransition>{children}</PageTransition>
      </main>
      <FeedbackHost />
    </>
  );
}
