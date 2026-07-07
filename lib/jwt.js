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

// Roles, from least to most access. Manager and Admin currently share the
// same permissions everywhere except user-account management, which is
// admin-only. Keeping them as distinct roles (rather than collapsing them)
// leaves room to split their access further later without a schema change.
export const ROLES = ['employee', 'manager', 'admin'];

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
// can't drift apart. "full" = admin + manager, "employee" = standard crew.
export const CAN = {
  viewQuotes: () => true, // any role can view/draft quotes; employee-drafted ones need approval before sending
  editQuotes: (role) => role === 'admin' || role === 'manager', // approve/reject, send, edit any quote, delete, duplicate, convert
  viewPayroll: (role) => role === 'admin' || role === 'manager',
  editPayroll: (role) => role === 'admin' || role === 'manager',
  viewFinancials: (role) => role === 'admin' || role === 'manager', // job $ amounts, margins
  manageClients: (role) => role === 'admin' || role === 'manager',
  viewClientAssets: () => true, // all roles, per Justin's spec
  manageParts: (role) => role === 'admin' || role === 'manager',
  useParts: () => true, // all roles can adjust qty on hand
  manageUsers: (role) => role === 'admin',
  manageJobs: (role) => role === 'admin' || role === 'manager', // create/delete jobs
  updateJobStatus: () => true, // all roles can update status/schedule/notes
  backup: (role) => role === 'admin' || role === 'manager',
  addReceipts: () => true, // anyone can upload a receipt
  manageReceipts: (role) => role === 'admin' || role === 'manager', // edit/delete
  addCompliance: () => true, // anyone can log a compliance record (usually the electrician on-site)
  manageCompliance: (role) => role === 'admin' || role === 'manager' // edit/delete
};
