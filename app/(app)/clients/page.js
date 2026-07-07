import { sql } from '../../../lib/db';
import { getSession, CAN } from '../../../lib/auth';
import ClientsApp from './clients-app';

export default async function ClientsPage() {
  // getSession() is cache()'d, so this reuses the (app) layout's call instead
  // of a second DB round trip; the two table queries are independent, so
  // they run together rather than one after the other.
  const session = await getSession();
  const [clients, assets, assetJobs] = await Promise.all([
    sql`select * from clients order by name asc`,
    sql`select * from assets order by name asc`,
    sql`select id, asset_id, job_number, status, job_type, scheduled_date from jobs where asset_id is not null order by created_date desc`
  ]);
  // scheduled_date arrives as a native Date object (the DB driver parses
  // `date` columns using local-time components) — convert to a plain
  // string here with local getters so it round-trips correctly regardless
  // of which timezone this server process happens to run in.
  const jobsByAsset = {};
  for (const j of assetJobs) {
    const d = j.scheduled_date;
    const scheduledDate = d
      ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      : null;
    (jobsByAsset[j.asset_id] ||= []).push({ ...j, scheduled_date: scheduledDate });
  }
  return <ClientsApp initialClients={clients} initialAssets={assets} jobsByAsset={jobsByAsset} canManage={CAN.manageClients(session.role)} />;
}
