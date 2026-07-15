import { sql } from '../../../lib/db';
import { getSession, CAN } from '../../../lib/auth';
import SuppliersApp from './suppliers-app';

export default async function SuppliersPage() {
  const session = await getSession();
  const suppliers = await sql`select * from suppliers order by name asc`;
  return <SuppliersApp initialSuppliers={suppliers} canManage={CAN.manageSuppliers(session.role)} />;
}
