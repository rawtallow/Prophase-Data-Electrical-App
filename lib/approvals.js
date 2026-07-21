import { sql } from './db';

// The full set of action types a Subadmin's attempt gets held for — see
// app/api/approvals/[id]/review/route.js for how each one is actually
// carried out once a Director approves it. Kept as one flat list here so
// every gated route (and the review endpoint) can check membership the
// same way, rather than re-deciding "is this gated" ad hoc per file.
export const GATED_ACTIONS = new Set([
  'delete_client',
  'delete_job',
  'delete_quote',
  'delete_purchase_order',
  'delete_asset',
  'delete_part',
  'void_job_payment',
  'void_po_invoice_payment',
  'review_quote',
  'review_purchase_order',
  'create_payroll_entry',
  'create_owner_draw',
  'restore_backup',
  'create_user',
  'edit_user',
  'delete_user'
]);

export function requiresApproval(role, actionType) {
  return role === 'subadmin' && GATED_ACTIONS.has(actionType);
}

async function createApprovalRequest({ session, actionType, targetId, targetLabel, payload }) {
  const rows = await sql`
    insert into approval_requests (action_type, target_id, target_label, payload, requested_by_id, requested_by)
    values (${actionType}, ${targetId || null}, ${targetLabel || ''}, ${JSON.stringify(payload || {})}, ${session.id}, ${session.name})
    returning *
  `;
  return rows[0];
}

// The one thing every gated route calls. `execute` is the route's own
// existing mutation logic (a closure over whatever local variables/params
// it needs) — for a Director/Manager (or anyone requiresApproval() says no
// to) it just runs immediately, same as before this feature existed. For a
// Subadmin it's held as a pending request instead, and `execute` is never
// called here — the review endpoint re-performs the equivalent action from
// the stored target_id/payload once a Director approves it.
export async function gateOrExecute({ session, actionType, targetId, targetLabel, payload, execute }) {
  if (requiresApproval(session.role, actionType)) {
    const request = await createApprovalRequest({ session, actionType, targetId, targetLabel, payload });
    return { pending: true, request };
  }
  const result = await execute();
  return { pending: false, result };
}
