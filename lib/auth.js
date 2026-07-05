// Server-only helpers (Route Handlers / Server Components). This file uses
// next/headers, which is why middleware.js imports from lib/jwt.js directly
// instead of from here — Edge middleware can't pull in next/headers.
import { SignJWT } from 'jose';
import { cookies } from 'next/headers';
import { secretKey, verifyToken, COOKIE, SESSION_DAYS, ROLES, CAN } from './jwt';

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
export async function getSession() {
  const token = cookies().get(COOKIE)?.value;
  if (!token) return null;
  return verifyToken(token);
}
