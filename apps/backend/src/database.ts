import type { Database } from '@renova/db-types';
import { checkReadiness } from '@renova/dbmigrator';
import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import type { BackendEnv } from './env.js';
import { createExampleRepository } from './modules/example/example.repository.js';

export function createDatabase(env: BackendEnv, onConnectionError: () => void = () => {}) {
  const pool = new pg.Pool({
    connectionString: env.DATABASE_URL,
    application_name: 'renova-backend',
    max: 5,
    connectionTimeoutMillis: 2000,
    idleTimeoutMillis: 30_000,
    statement_timeout: 5000,
    query_timeout: 6000,
    options: '-c default_transaction_read_only=on',
  });
  pool.on('error', onConnectionError);
  const database = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
  return {
    examples: createExampleRepository(database),
    readiness: () =>
      checkReadiness(
        pool,
        undefined,
        env.NODE_ENV === 'production'
          ? {
              target: 'railway',
              expectedDatabase: env.RENOVA_DB_NAME ?? '',
              projectId: env.RAILWAY_PROJECT_ID ?? '',
              environmentId: env.RAILWAY_ENVIRONMENT_ID ?? '',
            }
          : undefined,
      ),
    close: async () => {
      await database.destroy();
      if (!pool.ending) await pool.end();
    },
  };
}
