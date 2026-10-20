import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderRailwayBootstrapSql } from './bootstrap.mjs';

const uuid = /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/;
export function parseSetupArgs(args) {
  const names = ['project', 'environment', 'service', 'database', 'origin'];
  const values = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i]?.replace(/^--/, '');
    if (!names.includes(key) || values[key] || !args[i + 1])
      throw new Error('Argumentos inválidos.');
    values[key] = args[i + 1];
  }
  if (
    !names.slice(0, 4).every((key) => uuid.test(values[key] ?? '')) ||
    values.database === values.service
  )
    throw new Error('Informe IDs distintos da aplicação e do Postgres.');
  const origin = new URL(values.origin);
  if (
    origin.protocol !== 'https:' ||
    origin.origin !== values.origin ||
    !origin.hostname.includes('.') ||
    origin.hostname.endsWith('.') ||
    /^(?:\d+\.){3}\d+$/.test(origin.hostname) ||
    origin.hostname.startsWith('[') ||
    /(?:^|\.)(?:localhost|local|internal|test|invalid|example)$/.test(origin.hostname)
  )
    throw new Error('Informe a origem HTTPS pública, sem caminho ou barra final.');
  return values;
}

function command(args, input) {
  const result = spawnSync('railway', args, {
    input,
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
    timeout: 120_000,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  // Railway variable output and PostgreSQL diagnostics can contain secrets.
  if (result.status !== 0)
    throw new Error('Railway recusou a operação. Confira acesso e IDs; nenhum segredo é exibido.');
  return result.stdout;
}

export async function setupRailway(target, root, run = command) {
  const flags = ['-p', target.project, '-e', target.environment];
  const db = JSON.parse(run(['variable', 'list', ...flags, '-s', target.database, '--json']));
  const app = JSON.parse(run(['variable', 'list', ...flags, '-s', target.service, '--json']));
  for (const [vars, service] of [
    [db, target.database],
    [app, target.service],
  ]) {
    if (
      vars.RAILWAY_PROJECT_ID !== target.project ||
      vars.RAILWAY_ENVIRONMENT_ID !== target.environment ||
      vars.RAILWAY_SERVICE_ID !== service
    )
      throw new Error('Destino retornado pelo Railway diverge dos IDs informados.');
  }
  if (
    !/^[a-z\d][a-z\d-]*\.railway\.internal$/.test(db.RAILWAY_PRIVATE_DOMAIN ?? '') ||
    !/^[a-z][a-z0-9_]{2,62}$/.test(db.POSTGRES_DB ?? '') ||
    ['postgres', 'template0', 'template1'].includes(db.POSTGRES_DB) ||
    db.POSTGRES_USER !== 'postgres'
  )
    throw new Error('Use um Postgres novo e privado, com banco de aplicação próprio.');
  const folder = resolve(root, '.renova');
  try {
    const info = await lstat(folder);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Pasta local inválida.');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  await mkdir(folder, { recursive: true, mode: 0o700 });
  const path = resolve(folder, 'railway-credentials.json');
  let saved;
  try {
    const info = await lstat(path);
    if (
      !info.isFile() ||
      info.isSymbolicLink() ||
      info.nlink !== 1 ||
      (info.mode & 0o777) !== 0o600
    )
      throw new Error('Arquivo local inválido.');
    saved = JSON.parse(await readFile(path, 'utf8'));
    if (
      ![saved.runtime, saved.migrator, saved.auth].every((value) =>
        /^[a-f\d]{64}$/.test(value ?? ''),
      ) ||
      saved.runtime === saved.migrator
    )
      throw new Error(
        'Credenciais locais inválidas; preserve a instalação e peça recuperação ao responsável.',
      );
    if (Object.keys(target).some((key) => saved.target?.[key] !== target[key]))
      throw new Error('Esta cópia já foi vinculada a outro destino.');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    if (app.DATABASE_URL || app.MIGRATION_DATABASE_URL || app.AUTH_SECRET)
      throw new Error(
        'Aplicação já configurada; preserve suas credenciais. Use a cópia que fez o vínculo original.',
      );
    saved = {
      target,
      runtime: randomBytes(32).toString('hex'),
      migrator: randomBytes(32).toString('hex'),
      auth: randomBytes(32).toString('hex'),
    };
    await writeFile(path, `${JSON.stringify(saved)}\n`, { mode: 0o600, flag: 'wx' });
  }
  const url = (role, password) =>
    `postgresql://${role}:${password}@${db.RAILWAY_PRIVATE_DOMAIN}:5432/${db.POSTGRES_DB}`;
  const variables = {
    NODE_ENV: 'production',
    DEPLOY_TARGET: 'railway',
    HOST: '::',
    PORT: '8080',
    FRONTEND_URL: target.origin,
    RENOVA_DB_NAME: db.POSTGRES_DB,
    RENOVA_DB_PROJECT_ID: target.project,
    RENOVA_DB_ENVIRONMENT_ID: target.environment,
    DATABASE_URL: url('renova_runtime', saved.runtime),
    MIGRATION_DATABASE_URL: url('renova_migrator', saved.migrator),
  };
  for (const name of ['DATABASE_URL', 'MIGRATION_DATABASE_URL']) {
    if (app[name] && app[name] !== variables[name])
      throw new Error('Credenciais existentes divergentes; nenhuma rotação automática.');
  }
  const project = JSON.parse(await readFile(resolve(root, 'renova.project.json'), 'utf8'));
  if (project.profile === 'authenticated') {
    if (app.AUTH_SECRET && app.AUTH_SECRET !== saved.auth)
      throw new Error('Segredo de autenticação divergente.');
    variables.AUTH_SECRET = saved.auth;
  }
  const sql = renderRailwayBootstrapSql({
    ...variables,
    RAILWAY_PROJECT_ID: target.project,
    RAILWAY_ENVIRONMENT_ID: target.environment,
    RAILWAY_SERVICE_ID: target.database,
    RENOVA_BOOTSTRAP_NEW_DATABASE: '1',
    POSTGRES_RUNTIME_PASSWORD: saved.runtime,
    POSTGRES_MIGRATOR_PASSWORD: saved.migrator,
  });
  run(
    [
      'ssh',
      ...flags,
      '-s',
      target.database,
      '--',
      'psql',
      '-X',
      '-qAt',
      '-v',
      'ON_ERROR_STOP=1',
      '-U',
      'postgres',
      '-d',
      db.POSTGRES_DB,
    ],
    sql,
  );
  // Reconnect through the private network (not the trusted local socket): replay
  // must prove the saved credentials before publishing application variables.
  const credentials = [
    ['renova_runtime', saved.runtime],
    ['renova_migrator', saved.migrator],
  ];
  const verify = credentials
    .map(
      ([role, password]) =>
        `\\setenv PGPASSWORD ${password}\n\\connect "host=${db.RAILWAY_PRIVATE_DOMAIN} port=5432 dbname=${db.POSTGRES_DB} user=${role}"\nSELECT 1;\n`,
    )
    .join('');
  run(
    [
      'ssh',
      ...flags,
      '-s',
      target.database,
      '--',
      'psql',
      '-X',
      '-qAt',
      '-v',
      'ON_ERROR_STOP=1',
      '-U',
      'postgres',
      '-d',
      db.POSTGRES_DB,
    ],
    verify,
  );
  run(
    [
      'api',
      'mutation Configure($input: VariableCollectionUpsertInput!) { variableCollectionUpsert(input: $input) }',
      '--variables',
      '@-',
      '--compact',
    ],
    JSON.stringify({
      input: {
        projectId: target.project,
        environmentId: target.environment,
        serviceId: target.service,
        skipDeploys: true,
        replace: false,
        variables,
      },
    }),
  );
  return {
    project: target.project,
    environment: target.environment,
    service: target.service,
    origin: target.origin,
    profile: project.profile,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await setupRailway(
      parseSetupArgs(process.argv.slice(2)),
      fileURLToPath(new URL('../../', import.meta.url)),
    );
    process.stdout.write(
      `Banco e aplicação vinculados: ${result.project} / ${result.environment}.\nOrigem: ${result.origin}\n`,
    );
    if (result.profile === 'authenticated')
      process.stdout.write(
        'Antes de publicar, configure RESEND_API_KEY e AUTH_EMAIL_FROM no serviço app.\n',
      );
    process.stdout.write(
      'Credenciais guardadas em .renova/railway-credentials.json (ignorado pelo Git). Não compartilhe esse arquivo.\n',
    );
  } catch (error) {
    process.stderr.write(
      `Configuração Railway interrompida: ${error instanceof SyntaxError ? 'resposta inválida.' : error.message}\n`,
    );
    process.exitCode = 1;
  }
}
