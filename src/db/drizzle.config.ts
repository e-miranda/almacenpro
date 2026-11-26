import { defineConfig } from 'drizzle-kit';
import * as dotenv from 'dotenv';

dotenv.config();

const databaseUrl = process.env.DATABASE_URL?.trim();

function shouldUseSslForUrl(url: string): boolean {
  if (process.env.SQL_SSL === 'true') return true;
  if (process.env.SQL_SSL === 'false') return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1' || !host.includes('.')) {
      return false;
    }
    return true;
  } catch {
    return !url.includes('localhost') && !url.includes('127.0.0.1');
  }
}

function buildDbCredentials() {
  if (databaseUrl) {
    const useSsl = shouldUseSslForUrl(databaseUrl);
    return {
      url: databaseUrl,
      ssl: useSsl ? ('require' as const) : false,
    };
  }

  const sqlHost = process.env.SQL_HOST;
  const sqlDbName = process.env.SQL_DB_NAME;
  const user = process.env.SQL_ADMIN_USER || process.env.SQL_USER;
  const password = process.env.SQL_ADMIN_PASSWORD || process.env.SQL_PASSWORD;

  if (!sqlHost) {
    throw new Error('DATABASE_URL or SQL_HOST must be set in environment variables.');
  }
  if (!sqlDbName) {
    throw new Error('DATABASE_URL or SQL_DB_NAME must be set in environment variables.');
  }
  if (!user) {
    throw new Error('DATABASE_URL or SQL_ADMIN_USER must be set in environment variables.');
  }
  if (!password) {
    throw new Error('DATABASE_URL or SQL_ADMIN_PASSWORD must be set in environment variables.');
  }

  return {
    host: sqlHost,
    user,
    password,
    database: sqlDbName,
    ssl: process.env.SQL_SSL === 'true' ? ('require' as const) : false,
  };
}

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  schemaFilter: ['public'],
  dbCredentials: buildDbCredentials(),
  verbose: true,
});
