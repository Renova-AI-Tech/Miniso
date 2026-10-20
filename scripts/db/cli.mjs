import { fileURLToPath } from 'node:url';
import { prepareLocalDatabase, readLocalDatabase, startDatabase } from './local.mjs';
import { buildMigrator, migrateLocalDatabase } from './migrate.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
try {
  const args = process.argv.slice(2);
  if (
    args.length !== 3 ||
    !['up', 'migrate'].includes(args[0]) ||
    args[1] !== '--target' ||
    args[2] !== 'local'
  ) {
    throw new Error(
      'Use db:up ou db:migrate com --target local. Nenhum comando destrutivo está disponível.',
    );
  }
  if (args[0] === 'up') {
    const handle = await prepareLocalDatabase(root);
    await startDatabase(root, handle);
    process.stdout.write(`Postgres local pronto em 127.0.0.1:${handle.plan.port}.\n`);
  } else {
    const handle = await readLocalDatabase(root);
    await buildMigrator(root);
    const result = await migrateLocalDatabase(handle);
    process.stdout.write(
      `Migrations locais: ${result.applied} aplicada(s); versão ${result.version}.\n`,
    );
  }
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
