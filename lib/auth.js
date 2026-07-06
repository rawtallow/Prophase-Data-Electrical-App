// Server-only helpers (Route Handlers / Server Components). This file uses
// next/headers, which is why middleware.js imports from lib/jwt.js directly
// instead of from here — Edge middleware can't pull in next/headers.
import { SignJWT } from 'jose';
import { cookies } from 'next/headers';
import { cache } from 'react';
import { secretKey, verifyToken, COOKIE, SESSION_DAYS, ROLES, CAN } from './jwt';
import { sql } from './db';

export { verifyToken, COOKIE, ROLES, CAN };

export async function createSession({ id, name, role, email }) {
  const token = await new SignJWT({ name, role, email })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(id)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secretKey());

  cookies().set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_DAYS * 24 * 60 * 60
  });
}

export function clearSession() {
  cookies().set(COOKIE, '', { path: '/', maxAge: 0 });
}

// Verifies the session cookie for use in Server Components / Route Handlers.
// Returns null if there is no valid session.
//
// Beyond the JWT signature check, this re-validates the user against the
// database on every call, so deactivating (or deleting) a user cuts off
// their existing sessions immediately rather than at token expiry, and role
// changes take effect on their very next request. The returned role/name
// always come from the database, not the (possibly stale) token payload.
//
// Wrapped in React's cache() so multiple calls within the SAME request (the
// shared (app) layout always calls this, and several pages call it again for
// role checks) dedupe to a single DB round trip instead of one per caller —
// on pages that called it twice this alone cut a full serial query out of
// every navigation.
export const getSession = cache(async function getSession() {
  const token = cookies().get(COOKIE)?.value;
  if (!token) return null;
  const claims = await verifyToken(token);
  if (!claims) return null;

  try {
    const rows = await sql`
      select id, name, email, role, active from users where id = ${claims.id}
    `;
    const user = rows[0];
    if (!user || !user.active) return null;
    return { id: user.id, name: user.name, email: user.email, role: user.role };
  } catch {
    // Fail closed: if the user lookup errors, treat as unauthenticated.
    return null;
  }
});
