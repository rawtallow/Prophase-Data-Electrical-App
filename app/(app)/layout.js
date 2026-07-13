import { getSession } from '../../lib/auth';
import { redirect } from 'next/navigation';
import NavLinks from './nav-links';
import MobileNav from './mobile-nav';
import AccountArea from './account-area';
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
          <div className="brand-text">
            <h1>Prophase Data and Electrical</h1>
            <div className="sub">Hub</div>
          </div>
        </div>
        <AccountArea name={session.name} role={session.role} />
      </header>
      <NavLinks role={session.role} />
      <main className="container">
        <PageTransition>{children}</PageTransition>
      </main>
      <MobileNav role={session.role} />
      <FeedbackHost />
    </>
  );
}
