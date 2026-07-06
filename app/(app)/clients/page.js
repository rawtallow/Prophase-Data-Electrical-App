import { sql } from '../../../lib/db';
import { getSession, CAN } from '../../../lib/auth';
import ClientsApp from './clients-app';

export default async function ClientsPage() {
  // getSession() is cache()'d, so this reuses the (app) layout's call instead
  // of a second DB round trip; the two table queries are independent, so
  // they run together rather than one after the other.
  const session = await getSession();
  const [clients, assets] = await Promise.all([
    sql`select * from clients order by name asc`,
    sql`select * from assets order by name asc`
  ]);
  return <ClientsApp initialClients={clients} initialAssets={assets} canManage={CAN.manageClients(session.role)} />;
}
