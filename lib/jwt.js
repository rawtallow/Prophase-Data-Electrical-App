// Edge-safe helpers: no next/headers import here, so this module can be
// used from middleware.js (Edge runtime) as well as from lib/auth.js
// (used in Route Handlers / Server Components).
import { jwtVerify } from 'jose';

export function secretKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error('SESSION_SECRET is not set. See .env.example.');
  }
  return new TextEncoder().encode(secret);
}

export const COOKIE = 'prophase_session';
export const SESSION_DAYS = 14;

// Roles. 'admin' is kept only for backward compatibility with any old row/
// backup — new accounts use director/subadmin/manager/employee. Director,
// Subadmin, Manager, and (legacy) Admin all share the same day-to-day
// permissions below — the one place Subadmin differs is lib/approvals.js's
// GATED_ACTIONS list, where a Subadmin's attempt becomes a pending request
// for a Director to approve instead of executing immediately. Manager stays
// fully ungated (it was already equivalent to admin before this and the
// user didn't ask to change that), so gating is specifically a Subadmin
// concept layered on top of the same baseline access, not a lower rung on a
// strict ladder.
export const ROLES = ['employee', 'manager', 'subadmin', 'director'];

// Shared by every "admin/manager-equivalent" check below — Director,
// Subadmin, Manager, and legacy Admin all get this baseline; only Employee
// is excluded. Whether a Subadmin's specific action needs director approval
// is decided separately by lib/approvals.js, not by this function.
function fullAccessRole(role) {
  return role === 'director' || role === 'subadmin' || role === 'admin' || role === 'manager';
}

export async function verifyToken(token) {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    return {
      id: payload.sub,
      name: payload.name,
      role: payload.role,
      email: payload.email
    };
  } catch {
    return null;
  }
}

// Feature access matrix. Kept in one place so page guards and nav rendering
// can't drift apart. "full" = director/subadmin/manager(/legacy admin),
// "employee" = standard crew. Whether a full-access Subadmin's specific
// attempt (e.g. deleting a client, voiding a payment) gets held for
// director approval instead of running immediately is decided by
// lib/approvals.js, not by these checks — CAN answers "is this role allowed
// to reach this feature at all", approvals.js answers "does *this* role's
// attempt at *this* action need sign-off first".
export const CAN = {
  viewQuotes: () => true, // any role can view/draft quotes; employee-drafted ones need approval before sending
  editQuotes: fullAccessRole, // approve/reject, send, edit any quote, delete, duplicate, convert
  viewPayroll: fullAccessRole,
  editPayroll: fullAccessRole,
  viewFinancials: fullAccessRole, // job $ amounts, margins
  manageClients: fullAccessRole,
  viewClientAssets: () => true, // all roles, per Justin's spec
  manageParts: fullAccessRole,
  useParts: () => true, // all roles can adjust qty on hand
  // User management was always admin-only, a narrower gate than the general
  // fullAccessRole tier (manager has never had it, and still doesn't).
  // Subadmin can view/propose changes; lib/approvals.js gates the actual
  // create/edit/delete, which needs a Director to approve.
  manageUsers: (role) => role === 'director' || role === 'subadmin' || role === 'admin',
  manageJobs: fullAccessRole, // create/delete jobs
  updateJobStatus: () => true, // all roles can update status/schedule/notes
  backup: fullAccessRole, // Subadmin can view backups/export; restoring is gated to Director approval
  addReceipts: () => true, // anyone can upload a receipt
  manageReceipts: fullAccessRole, // edit/delete
  addCompliance: () => true, // anyone can log a compliance record (usually the electrician on-site)
  manageCompliance: fullAccessRole, // edit/delete
  manageContracts: fullAccessRole, // recurring maintenance contracts
  manageSuppliers: fullAccessRole, // wholesaler trade accounts
  viewPurchaseOrders: () => true, // any role can view/draft POs; employee-drafted ones need approval before sending, same as quotes
  editPurchaseOrders: fullAccessRole, // approve/reject, send, edit any PO, delete
  receivePurchaseOrders: () => true, // logging delivered stock is a physical on-site task, same as useParts
  isDirector: (role) => role === 'director', // approval authority over a Subadmin's gated requests
  isSubadmin: (role) => role === 'subadmin'
};
