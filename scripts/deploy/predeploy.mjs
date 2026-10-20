import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertRailwayDatabaseUrl, readRailwayTarget } from './env.mjs';

export async function predeploy(env = process.env) {
  const target = readRailwayTarget(env);
  if (env.BOOTSTRAP_DATABASE_URL || env.POSTGRES_ADMIN_PASSWORD) {
    throw new Error('Credencial administrativa recusada no predeploy.');
  }
  assertRailwayDatabaseUrl(env.MIGRATION_DATABASE_URL, target, 'renova_migrator');
  const { runRailwayMigrations } = await import('../../packages/dbmigrator/dist/index.js');
  return runRailwayMigrations({ ...target, connectionString: env.MIGRATION_DATABASE_URL });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 2) throw new Error('Argumentos recusados.');
    const result = await predeploy();
    process.stdout.write(
      `Migrations Railway concluídas: ${result.applied}; versão ${result.version}.\n`,
    );
  } catch {
    process.stderr.write(
      'Predeploy Railway recusado ou interrompido; confira destino, identidade e histórico.\n',
    );
    process.exitCode = 1;
  }
}
