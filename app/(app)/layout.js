import { getSession, CAN } from '../../lib/auth';
import { redirect } from 'next/navigation';
import { sql } from '../../lib/db';
import NavLinks from './nav-links';
import MobileNav from './mobile-nav';
import AccountArea from './account-area';
import { FeedbackHost } from './ui-feedback';
import PageTransition from './page-transition';

export default async function AppLayout({ children }) {
  const session = await getSession();
  if (!session) redirect('/login');

  // Nav badges flagging quotes/POs waiting on a decision — only fetched for
  // roles that can actually act on them, so an employee's every-page-load
  // never pays for a query whose result they'd never see anyway.
  const canApprove = CAN.editQuotes(session.role) || CAN.editPurchaseOrders(session.role);
  const [pendingQuotes, pendingPOs] = canApprove
    ? await Promise.all([
        sql`select count(*)::int as n from quotes where approval_status = 'Pending Approval'`,
        sql`select count(*)::int as n from purchase_orders where approval_status = 'Pending Approval'`
      ])
    : [[{ n: 0 }], [{ n: 0 }]];
  const badges = { '/quotes': pendingQuotes[0].n, '/purchase-orders': pendingPOs[0].n };

  return (
    <>
      <header className="app-header">
        <div className="brand">
          <div className="bolt">&#9889;</div>
          <div className="brand-text">
            <h1>PROPHASE Data and Electrical</h1>
            <div className="sub">Hub</div>
          </div>
        </div>
        <AccountArea name={session.name} role={session.role} />
      </header>
      <NavLinks role={session.role} badges={badges} />
      <main className="container">
        <PageTransition>{children}</PageTransition>
      </main>
      <MobileNav role={session.role} badges={badges} />
      <FeedbackHost />
    </>
  );
}
