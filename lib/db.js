import { neon } from '@neondatabase/serverless';

// Vercel's Postgres/Neon storage integration usually injects one of these
// automatically. We check a few common names so setup doesn't hinge on
// getting the exact env var name right.
const connectionString =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.DATABASE_URL_UNPOOLED ||
  process.env.POSTGRES_URL_NON_POOLING;

if (!connectionString) {
  // Thrown lazily (at query time, not import time) in routes that call sql(),
  // so the rest of the app can still render a helpful setup message.
  console.warn(
    'No database connection string found. Set DATABASE_URL (see .env.example).'
  );
}

export const sql = connectionString
  ? neon(connectionString)
  : async () => {
      throw new Error(
        'Database is not configured yet. Set DATABASE_URL in your Vercel project settings.'
      );
    };

export function rowsOrThrow(result) {
  return result;
}

// Postgres foreign-key-violation code — thrown when deleting a row that
// other tables still reference (e.g. a client with jobs on file). Callers
// use this to return a friendly, specific message instead of a raw 500.
export function isForeignKeyViolation(err) {
  return err && err.code === '23503';
}
