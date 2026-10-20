import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { validateDatabaseEnvironment } from './local.mjs';

const execute = promisify(execFile);

export async function buildMigrator(root) {
  try {
    await execute('pnpm', ['--filter', '@renova/dbmigrator', 'build'], { cwd: root });
  } catch {
    throw new Error(
      'Não foi possível compilar o migrador. Execute pnpm install e verifique o typecheck.',
    );
  }
}

export async function migrateLocalDatabase(handle) {
  validateDatabaseEnvironment(handle.plan, handle.env);
  const { runMigrations } = await import('../../packages/dbmigrator/dist/index.js');
  return runMigrations({
    connectionString: handle.env.MIGRATION_DATABASE_URL,
    expectedDatabase: handle.plan.databaseName,
    projectId: handle.plan.projectId,
    target: handle.plan.target,
  });
}
