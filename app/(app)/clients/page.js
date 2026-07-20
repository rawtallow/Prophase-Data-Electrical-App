import { sql } from '../../../lib/db';
import { getSession, CAN } from '../../../lib/auth';
import ClientsApp from './clients-app';

export default async function ClientsPage() {
  // getSession() is cache()'d, so this reuses the (app) layout's call instead
  // of a second DB round trip. Only an asset COUNT per client is needed here
  // now — full asset rows/edit history live on the client detail page.
  const session = await getSession();
  const [clients, assetCounts] = await Promise.all([
    sql`select * from clients order by name asc`,
    sql`select client_id, count(*)::int as n from assets group by client_id`
  ]);
  const assetCountByClient = Object.fromEntries(assetCounts.map((r) => [r.client_id, r.n]));
  return <ClientsApp initialClients={clients} assetCountByClient={assetCountByClient} canManage={CAN.manageClients(session.role)} />;
}
