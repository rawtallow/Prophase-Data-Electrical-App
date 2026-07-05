import { sql } from '../../../lib/db';
import { getSession, CAN } from '../../../lib/auth';
import ClientsApp from './clients-app';

export default async function ClientsPage() {
  const session = await getSession();
  const clients = await sql`select * from clients order by name asc`;
  const assets = await sql`select * from assets order by name asc`;
  return <ClientsApp initialClients={clients} initialAssets={assets} canManage={CAN.manageClients(session.role)} />;
}
