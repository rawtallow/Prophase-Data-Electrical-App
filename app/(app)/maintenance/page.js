import { sql } from '../../../lib/db';
import { getSession, CAN } from '../../../lib/auth';
import MaintenanceApp from './maintenance-app';

export default async function MaintenancePage() {
  const session = await getSession();
  const [contracts, clients] = await Promise.all([
    sql`select * from maintenance_contracts order by next_due_date asc`,
    sql`select id, name from clients order by name asc`
  ]);
  return (
    <MaintenanceApp
      initialContracts={contracts}
      clients={clients}
      canManage={CAN.manageContracts(session.role)}
    />
  );
}
