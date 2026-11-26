import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.ts';

declare global {
  var _postgresPool: Pool | undefined;
}

function shouldUseSslForDatabaseUrl(databaseUrl: string): boolean {
  if (process.env.SQL_SSL === 'true') return true;
  if (process.env.SQL_SSL === 'false') return false;
  try {
    const parsed = new URL(databaseUrl);
    const host = parsed.hostname.toLowerCase();
    // Localhost and single-label internal hostnames (e.g., Render internal dpg-xxxx-a) do not use SSL
    if (host === 'localhost' || host === '127.0.0.1' || !host.includes('.')) {
      return false;
    }
    return true;
  } catch {
    return !databaseUrl.includes('localhost') && !databaseUrl.includes('127.0.0.1');
  }
}

export const createPool = () => {
  if (!global._postgresPool) {
    const databaseUrl = process.env.DATABASE_URL?.trim();
    const useSsl = databaseUrl ? shouldUseSslForDatabaseUrl(databaseUrl) : false;

    global._postgresPool = databaseUrl
      ? new Pool({
          connectionString: databaseUrl,
          ssl: useSsl ? { rejectUnauthorized: false } : false,
          max: 10,
          connectionTimeoutMillis: 15000,
        })
      : new Pool({
          host: process.env.SQL_HOST,
          user: process.env.SQL_USER,
          password: process.env.SQL_PASSWORD,
          database: process.env.SQL_DB_NAME,
          ssl: process.env.SQL_SSL === 'true' ? { rejectUnauthorized: false } : false,
          max: 10,
          connectionTimeoutMillis: 15000,
        });

    global._postgresPool.on('error', (err) => {
      console.error('Unexpected error on idle SQL pool client:', err);
    });
  }
  return global._postgresPool;
};

const pool = createPool();

export const db = drizzle(pool, { schema });
