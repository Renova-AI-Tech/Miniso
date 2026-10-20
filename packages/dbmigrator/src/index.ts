import { createHash } from 'node:crypto';
import pg from 'pg';
import { type Migration, migrations } from './migrations.js';

export { type Migration, migrations } from './migrations.js';
export const expectedMigrationVersion = migrations.at(-1)?.id ?? '';

interface AppliedMigration {
  id: string;
  checksum: string;
}

export interface MigrationTarget {
  readonly connectionString: string;
  readonly expectedDatabase: string;
  readonly projectId: string;
  readonly target: 'local' | 'test';
}

export interface RailwayMigrationTarget {
  readonly connectionString: string;
  readonly expectedDatabase: string;
  readonly projectId: string;
  readonly environmentId: string;
  readonly target: 'railway';
}

export interface RuntimeDatabaseTarget {
  readonly target: 'railway';
  readonly expectedDatabase: string;
  readonly projectId: string;
  readonly environmentId: string;
}

export class MigrationError extends Error {
  constructor(
    readonly code:
      | 'INVALID_TARGET'
      | 'IDENTITY_MISMATCH'
      | 'INVALID_MANIFEST'
      | 'HISTORY_CHANGED'
      | 'MIGRATION_FAILED',
  ) {
    super(`Database migration refused: ${code}.`);
  }
}

function checksum(migration: Migration): string {
  return createHash('sha256').update(migration.sql).digest('hex');
}

function validateManifest(manifest: readonly Migration[]): void {
  if (
    manifest.some(
      (entry, index) =>
        !/^\d{3}_[a-z0-9_]+$/.test(entry.id) ||
        !entry.sql.trim() ||
        (index > 0 && entry.id <= (manifest[index - 1]?.id ?? '')),
    )
  ) {
    throw new MigrationError('INVALID_MANIFEST');
  }
}

function validHistory(history: AppliedMigration[], manifest: readonly Migration[]): boolean {
  return history.every(
    (entry, index) =>
      entry.id === manifest[index]?.id && entry.checksum === checksum(manifest[index] as Migration),
  );
}

function validateTarget(target: MigrationTarget): void {
  try {
    const url = new URL(target.connectionString);
    if (
      !['postgres:', 'postgresql:'].includes(url.protocol) ||
      url.hostname !== '127.0.0.1' ||
      !url.port ||
      url.username !== 'renova_migrator' ||
      !url.password ||
      url.search ||
      url.hash ||
      !['local', 'test'].includes(target.target) ||
      !/^renova_[a-f0-9]{12}_(local|test)$/.test(target.expectedDatabase) ||
      !target.expectedDatabase.endsWith(`_${target.target}`) ||
      url.pathname !== `/${target.expectedDatabase}` ||
      !/^[a-f0-9-]{36}$/.test(target.projectId)
    ) {
      throw new MigrationError('INVALID_TARGET');
    }
  } catch {
    throw new MigrationError('INVALID_TARGET');
  }
}

function validateRailwayTarget(target: RailwayMigrationTarget): void {
  const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
  try {
    const url = new URL(target.connectionString);
    if (
      target.target !== 'railway' ||
      !uuid.test(target.projectId) ||
      !uuid.test(target.environmentId) ||
      !/^[a-z][a-z0-9_]{0,62}$/.test(target.expectedDatabase) ||
      ['postgres', 'template0', 'template1'].includes(target.expectedDatabase) ||
      !['postgres:', 'postgresql:'].includes(url.protocol) ||
      !/^[a-z0-9][a-z0-9-]*\.railway\.internal$/.test(url.hostname) ||
      url.port !== '5432' ||
      url.username !== 'renova_migrator' ||
      !url.password ||
      url.pathname !== `/${target.expectedDatabase}` ||
      url.search ||
      url.hash
    ) {
      throw new MigrationError('INVALID_TARGET');
    }
  } catch {
    throw new MigrationError('INVALID_TARGET');
  }
}

/** O driver local continua restrito a loopback e bancos local/test vinculados. */
export async function runMigrations(
  target: MigrationTarget,
  manifest: readonly Migration[] = migrations,
): Promise<{ applied: number; version: string }> {
  validateTarget(target);
  return applyMigrations(target, manifest);
}

/** Driver remoto explícito; identidade do projeto e ambiente é conferida no banco. */
export async function runRailwayMigrations(
  target: RailwayMigrationTarget,
  manifest: readonly Migration[] = migrations,
): Promise<{ applied: number; version: string }> {
  validateRailwayTarget(target);
  return applyMigrations(target, manifest);
}

async function applyMigrations(
  target: MigrationTarget | RailwayMigrationTarget,
  manifest: readonly Migration[],
): Promise<{ applied: number; version: string }> {
  validateManifest(manifest);
  const client = new pg.Client({
    connectionString: target.connectionString,
    connectionTimeoutMillis: 5000,
    query_timeout: 7000,
  });
  let transaction = false;
  try {
    await client.connect();
    const identity = await client.query<{
      database: string;
      project_id: string;
      environment_id?: string;
      role: string;
      rolsuper: boolean;
      rolcreatedb: boolean;
      rolcreaterole: boolean;
      rolreplication: boolean;
      rolbypassrls: boolean;
    }>(
      `select current_database() as database, project_id, ${target.target === 'railway' ? 'environment_id,' : ''} current_user as role, rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls from renova_bootstrap.identity cross join pg_roles where rolname = current_user`,
    );
    if (
      identity.rows.length !== 1 ||
      identity.rows[0]?.database !== target.expectedDatabase ||
      identity.rows[0]?.project_id !== target.projectId ||
      identity.rows[0]?.role !== 'renova_migrator' ||
      identity.rows[0]?.rolsuper ||
      (target.target === 'railway' &&
        (identity.rows[0]?.environment_id !== target.environmentId ||
          identity.rows[0]?.rolcreatedb ||
          identity.rows[0]?.rolcreaterole ||
          identity.rows[0]?.rolreplication ||
          identity.rows[0]?.rolbypassrls))
    ) {
      throw new MigrationError('IDENTITY_MISMATCH');
    }
    await client.query('BEGIN');
    transaction = true;
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SET LOCAL statement_timeout = '5s'");
    await client.query('SELECT pg_advisory_xact_lock(724839102)');
    await client.query(`CREATE SCHEMA IF NOT EXISTS renova_meta;
CREATE TABLE IF NOT EXISTS renova_meta.migrations (id text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP);
GRANT USAGE ON SCHEMA renova_meta TO renova_runtime;
GRANT SELECT ON renova_meta.migrations TO renova_runtime;`);
    const history = await client.query<AppliedMigration>(
      'SELECT id, checksum FROM renova_meta.migrations ORDER BY id',
    );
    if (!validHistory(history.rows, manifest)) throw new MigrationError('HISTORY_CHANGED');
    let applied = 0;
    for (const migration of manifest.slice(history.rows.length)) {
      await client.query(migration.sql);
      await client.query('INSERT INTO renova_meta.migrations(id, checksum) VALUES ($1, $2)', [
        migration.id,
        checksum(migration),
      ]);
      applied += 1;
    }
    await client.query('COMMIT');
    transaction = false;
    return { applied, version: manifest.at(-1)?.id ?? '' };
  } catch (error) {
    if (transaction) await client.query('ROLLBACK').catch(() => undefined);
    if (error instanceof MigrationError) throw error;
    throw new MigrationError('MIGRATION_FAILED');
  } finally {
    await client.end();
  }
}

/** Verifica conexão e histórico de migrations, sem depender das tabelas de produto. */
export async function checkReadiness(
  database: Pick<pg.Pool, 'query'>,
  manifest: readonly Migration[] = migrations,
  target?: RuntimeDatabaseTarget,
): Promise<boolean> {
  try {
    validateManifest(manifest);
    if (target) {
      const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
      if (
        target.target !== 'railway' ||
        !uuid.test(target.projectId) ||
        !uuid.test(target.environmentId) ||
        !/^[a-z][a-z0-9_]{0,62}$/.test(target.expectedDatabase) ||
        ['postgres', 'template0', 'template1'].includes(target.expectedDatabase)
      )
        return false;
      const identity = await database.query<{
        database: string;
        project_id: string;
        environment_id: string;
        role: string;
        rolsuper: boolean;
        rolcreatedb: boolean;
        rolcreaterole: boolean;
        rolreplication: boolean;
        rolbypassrls: boolean;
        has_membership: boolean;
      }>(
        `SELECT current_database() AS database, project_id, environment_id, current_user AS role,
          rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls,
          EXISTS (SELECT 1 FROM pg_auth_members WHERE member = pg_roles.oid) AS has_membership
          FROM renova_bootstrap.identity CROSS JOIN pg_roles WHERE rolname = current_user`,
      );
      const row = identity.rows[0];
      if (
        identity.rows.length !== 1 ||
        row?.database !== target.expectedDatabase ||
        row?.project_id !== target.projectId ||
        row?.environment_id !== target.environmentId ||
        row?.role !== 'renova_runtime' ||
        row?.rolsuper !== false ||
        row?.rolcreatedb !== false ||
        row?.rolcreaterole !== false ||
        row?.rolreplication !== false ||
        row?.rolbypassrls !== false ||
        row?.has_membership !== false
      )
        return false;
    }
    const history = await database.query<AppliedMigration>(
      'SELECT id, checksum FROM renova_meta.migrations ORDER BY id',
    );
    return history.rows.length === manifest.length && validHistory(history.rows, manifest);
  } catch {
    return false;
  }
}
