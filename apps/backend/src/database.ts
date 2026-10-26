import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Database } from '@renova/db-types';
import { checkReadiness } from '@renova/dbmigrator';
import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import type { BackendEnv } from './env.js';
import { createLinxRepository } from './modules/linx/linx.repository.js';
import { createLinxSyncRunner } from './modules/linx/linx.sync.js';

export function createDatabase(env: BackendEnv, onConnectionError: () => void = () => {}) {
  const projectRoot =
    [process.cwd(), resolve(process.cwd(), '..', '..'), resolve(process.cwd(), '..')].find(
      (candidate) => existsSync(join(candidate, 'scripts', 'linx', 'sync.mjs')),
    ) ?? process.cwd();
  const collectionFile = env.LINX_COLLECTION
    ? resolve(projectRoot, env.LINX_COLLECTION)
    : join(projectRoot, 'secrets', 'MiniSo - Linx.json');
  const credentialsConfigured =
    Boolean(env.LINX_USER && env.LINX_PASSWORD && env.LINX_KEY && env.LINX_PORTAL) ||
    existsSync(collectionFile) ||
    existsSync(join(projectRoot, 'MiniSo - Linx.json'));
  const pool = new pg.Pool({
    connectionString: env.DATABASE_URL,
    application_name: 'miniso-analytics-backend',
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
    linx: createLinxRepository(database),
    sync: createLinxSyncRunner(projectRoot, env.MIGRATION_DATABASE_URL, credentialsConfigured),
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
