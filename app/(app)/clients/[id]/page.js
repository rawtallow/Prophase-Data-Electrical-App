import { notFound } from 'next/navigation';
import { sql } from '../../../../lib/db';
import { getSession, CAN } from '../../../../lib/auth';
import ClientDetailApp from './client-detail-app';

export default async function ClientDetailPage({ params }) {
  const session = await getSession();
  const fullAccess = CAN.viewFinancials(session.role);
  const canManage = CAN.manageClients(session.role);
  const showContracts = CAN.manageContracts(session.role);

  const clients = await sql`select * from clients where id = ${params.id}`;
  const client = clients[0];
  if (!client) notFound();

  const [assets, quotes, jobs, compliance, contracts, assetJobs] = await Promise.all([
    sql`select * from assets where client_id = ${params.id} order by name asc`,
    sql`select * from quotes where client_id = ${params.id} order by date desc`,
    sql`select * from jobs where client_id = ${params.id} order by created_date desc`,
    sql`select * from compliance_records where client_id = ${params.id} order by record_date desc`,
    showContracts
      ? sql`select * from maintenance_contracts where client_id = ${params.id} order by next_due_date asc`
      : Promise.resolve([]),
    sql`select id, asset_id, job_number, status from jobs where client_id = ${params.id} and asset_id is not null`
  ]);

  const jobsByAsset = {};
  for (const j of assetJobs) {
    (jobsByAsset[j.asset_id] ||= []).push(j);
  }

  return (
    <ClientDetailApp
      initialClient={client}
      initialAssets={assets}
      quotes={quotes}
      jobs={jobs}
      compliance={compliance}
      contracts={contracts}
      jobsByAsset={jobsByAsset}
      showContracts={showContracts}
      fullAccess={fullAccess}
      canManage={canManage}
    />
  );
}
